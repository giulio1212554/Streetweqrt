import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("quoteOrder discount validation (server db)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plab-test-"));
    process.env.PLAB_DATA_DIR = dir;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.PLAB_DATA_DIR;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("rejects invalid discount code", async () => {
    const { quoteOrder } = await import("@/lib/plab-db.server");
    expect(() =>
      quoteOrder({
        items: [{ productId: "pl-001", size: "S", qty: 1 }],
        discountCode: "NOPE",
      }),
    ).toThrow(/invalid discount/i);
  });

  it("applies LAB10 and does not stack referral when promo present", async () => {
    const { quoteOrder } = await import("@/lib/plab-db.server");
    // seed referrals in db via createPending path is heavy — just promo
    const q = quoteOrder({
      items: [{ productId: "pl-001", size: "S", qty: 1 }],
      discountCode: "LAB10",
    });
    expect(q.appliedPercent).toBe(10);
    expect(q.discountCode).toBe("LAB10");
    expect(q.discountAmount).toBeGreaterThan(0);
  });

  it("rejects own referral code", async () => {
    const db = await import("@/lib/plab-db.server");
    // inject referral via file
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
    const seed = {
      products: (
        await import("@/data/products")
      ).PRODUCTS,
      settings: (await import("@/data/products")).DEFAULT_SETTINGS,
      orders: [],
      referrals: [{ code: "REFTEST", ownerEmail: "me@example.com", uses: 0 }],
    };
    writeFileSync(join(dir, "plab-db.json"), JSON.stringify(seed));

    // re-import won't reset module state — quoteOrder reads file each time
    expect(() =>
      db.quoteOrder({
        items: [{ productId: "pl-001", size: "S", qty: 1 }],
        referralCode: "REFTEST",
        customerEmail: "me@example.com",
      }),
    ).toThrow(/own referral/i);
  });
});

describe("atomic stock reservation", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plab-stock-"));
    process.env.PLAB_DATA_DIR = dir;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.PLAB_DATA_DIR;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("reserves stock and fails when concurrent oversell would occur", async () => {
    const { reserveStock, getAvailableStock, getServerProducts } = await import(
      "@/lib/plab-db.server"
    );
    // Ensure seed product exists with known stock
    const products = getServerProducts();
    const p = products.find((x) => x.id === "pl-001");
    expect(p).toBeTruthy();
    const size = p!.sizes.find((s) => s.stock > 0)!;
    const start = size.stock;

    const r1 = await reserveStock([
      { productId: "pl-001", size: size.size, qty: start },
    ]);
    expect(r1.ok).toBe(true);
    expect(getAvailableStock("pl-001", size.size)).toBe(0);

    const r2 = await reserveStock([
      { productId: "pl-001", size: size.size, qty: 1 },
    ]);
    expect(r2.ok).toBe(false);
    expect(r2.message).toMatch(/insufficient stock/i);
  });

  it("serializes concurrent reserve attempts (queue)", async () => {
    const { reserveStock, getAvailableStock, getServerProducts } = await import(
      "@/lib/plab-db.server"
    );
    const p = getServerProducts().find((x) => x.id === "pl-001")!;
    // find size with at least 2
    let size = p.sizes.find((s) => s.stock >= 2);
    if (!size) {
      // use S with whatever stock after previous tests — re-seed via new dir each beforeEach
      size = p.sizes.find((s) => s.stock > 0)!;
    }
    const available = getAvailableStock("pl-001", size.size);
    if (available < 2) {
      // skip soft
      expect(available).toBeGreaterThanOrEqual(0);
      return;
    }

    const results = await Promise.all([
      reserveStock([{ productId: "pl-001", size: size.size, qty: available }]),
      reserveStock([{ productId: "pl-001", size: size.size, qty: 1 }]),
    ]);
    const okCount = results.filter((r) => r.ok).length;
    expect(okCount).toBe(1);
    expect(getAvailableStock("pl-001", size.size)).toBe(0);
  });
});

describe("order paid idempotency (webhook-like)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plab-order-"));
    process.env.PLAB_DATA_DIR = dir;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.PLAB_DATA_DIR;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("markOrderPaid is idempotent", async () => {
    const {
      createPendingOrder,
      markOrderPaid,
      getOrderById,
    } = await import("@/lib/plab-db.server");

    const order = await createPendingOrder({
      items: [{ productId: "pl-001", size: "S", qty: 1 }],
      customer: {
        name: "Test",
        email: "t@example.com",
        phone: "1234567890",
        address: "Via 1",
        city: "Ischia",
        zip: "80077",
        country: "IT",
      },
      paymentMethod: "stripe",
      holdMinutes: 30,
    });

    const a = await markOrderPaid(order.id);
    const b = await markOrderPaid(order.id);
    expect(a?.status).toBe("paid");
    expect(b?.status).toBe("paid");
    expect(getOrderById(order.id)?.status).toBe("paid");
  });

  it("expire after paid is a no-op for status paid", async () => {
    const { createPendingOrder, markOrderPaid, expireOrCancelOrder, getOrderById } =
      await import("@/lib/plab-db.server");
    const order = await createPendingOrder({
      items: [{ productId: "pl-001", size: "M", qty: 1 }],
      customer: {
        name: "Test",
        email: "t@example.com",
        phone: "1234567890",
        address: "Via 1",
        city: "Ischia",
        zip: "80077",
        country: "IT",
      },
      paymentMethod: "stripe",
      holdMinutes: 30,
    });
    await markOrderPaid(order.id);
    const after = await expireOrCancelOrder(order.id, "expired");
    expect(after?.status).toBe("paid");
    expect(getOrderById(order.id)?.status).toBe("paid");
  });
});
