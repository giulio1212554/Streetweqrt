/**
 * PROJECT LAB — server-side JSON store (orders, stock, discounts).
 * File: data/plab-db.json (gitignored via data/).
 * Atomic-ish via exclusive write after full read; single-process safe.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  PRODUCTS as SEED_PRODUCTS,
  DEFAULT_SETTINGS,
  type Product,
  type SiteSettings,
  type DiscountCode,
} from "@/data/products";
import { computeTotals } from "@/lib/totals";

export type OrderLine = {
  productId: string;
  slug: string;
  title: string;
  size: string;
  qty: number;
  /** Unit price from server catalog (discountPrice ?? price) */
  unitPrice: number;
};

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "cancelled"
  | "expired";

export type ShippingStatus = "to_ship" | "shipped" | "delivered" | "cancelled";

export type PlabOrder = {
  id: string;
  createdAt: string;
  expiresAt: string | null;
  items: OrderLine[];
  subtotal: number;
  discountAmount: number;
  shipping: number;
  total: number;
  discountCode: string | null;
  referralCode: string | null;
  appliedPercent: number;
  customer: {
    name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    zip: string;
    country: string;
  };
  status: OrderStatus;
  shippingStatus: ShippingStatus;
  paymentMethod: "stripe" | "bank";
  stripeSessionId: string | null;
  stockReserved: boolean;
  staffNotifiedAt: string | null;
  /** Secret token for /receipt access */
  receiptToken: string;
};

export type StoreHold = {
  id: string;
  createdAt: string;
  productId: string;
  productTitle: string;
  slug: string;
  size: string;
  customerName: string;
  phone: string;
  email: string;
  note?: string;
  status: "pending" | "ready" | "picked_up" | "cancelled" | "expired";
  holdUntil: string;
  stockReserved: boolean;
};

type DbShape = {
  products: Product[];
  settings: SiteSettings;
  orders: PlabOrder[];
  referrals: { code: string; ownerEmail: string; uses: number }[];
  holds?: StoreHold[];
};

function dataDir(): string {
  return process.env.PLAB_DATA_DIR?.trim() || join(process.cwd(), "data");
}

function dbPath(): string {
  return join(dataDir(), "plab-db.json");
}

let writeQueue: Promise<void> = Promise.resolve();

function ensureDir() {
  const dir = dataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function defaultDb(): DbShape {
  return {
    products: structuredClone(SEED_PRODUCTS),
    settings: structuredClone(DEFAULT_SETTINGS),
    orders: [],
    referrals: [],
    holds: [],
  };
}

function readDb(): DbShape {
  ensureDir();
  if (!existsSync(dbPath())) {
    const d = defaultDb();
    writeFileSync(dbPath(), JSON.stringify(d, null, 2), "utf8");
    return d;
  }
  try {
    const raw = readFileSync(dbPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<DbShape>;
    return {
      products: parsed.products?.length ? parsed.products : structuredClone(SEED_PRODUCTS),
      settings: {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings ?? {}),
        payment: { ...DEFAULT_SETTINGS.payment, ...(parsed.settings?.payment ?? {}) },
        store: { ...DEFAULT_SETTINGS.store, ...(parsed.settings?.store ?? {}) },
        social: { ...DEFAULT_SETTINGS.social, ...(parsed.settings?.social ?? {}) },
        discountCodes:
          parsed.settings?.discountCodes ?? DEFAULT_SETTINGS.discountCodes,
      },
      orders: parsed.orders ?? [],
      referrals: parsed.referrals ?? [],
      holds: Array.isArray(parsed.holds) ? parsed.holds : [],
    };
  } catch {
    return defaultDb();
  }
}

function writeDb(db: DbShape) {
  ensureDir();
  writeFileSync(dbPath(), JSON.stringify(db, null, 2), "utf8");
}

/** Serialize mutations */
function withDb<T>(fn: (db: DbShape) => T): Promise<T> {
  const run = writeQueue.then(() => {
    const db = readDb();
    const result = fn(db);
    writeDb(db);
    return result;
  });
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function getServerSettings(): SiteSettings {
  return readDb().settings;
}

function promoteDueDrops(db: DbShape): boolean {
  const now = Date.now();
  let changed = false;
  for (const p of db.products) {
    if (p.status !== "teaser" || !p.dropDate) continue;
    const d = new Date(p.dropDate).getTime();
    if (!Number.isNaN(d) && d <= now) {
      const hasStock = p.sizes.some((s) => s.stock > 0);
      p.status = hasStock ? "live" : "soldout";
      changed = true;
    }
  }
  return changed;
}

export function getServerProducts(): Product[] {
  const db = readDb();
  if (promoteDueDrops(db)) {
    writeDb(db);
  }
  return db.products;
}

/**
 * Admin catalog write — queued via withDb (respects PLAB_DATA_DIR).
 * Full product list replace (admin is intentional). Load from server before editing
 * to avoid overwriting concurrent stock changes with a stale browser cache.
 */
export async function saveServerProducts(products: Product[]): Promise<void> {
  await withDb((db) => {
    db.products = products.map((p) => ({
      ...p,
      sizes: p.sizes.map((s) => ({
        ...s,
        stock: Math.max(0, Math.trunc(Number(s.stock) || 0)),
      })),
      price: Math.max(0, Number(p.price) || 0),
      discountPrice:
        p.discountPrice == null ? undefined : Math.max(0, Number(p.discountPrice)),
    }));
  });
}

export async function saveServerSettings(settings: SiteSettings): Promise<void> {
  await withDb((db) => {
    db.settings = settings;
  });
}

/**
 * In-store POS sale: remove 1 unit of product/size from warehouse stock.
 * Returns remaining stock or error if zero.
 */
export async function posDecrementStock(
  productId: string,
  size: string,
  qty = 1,
): Promise<{ ok: true; remaining: number; title: string } | { ok: false; message: string }> {
  const n = Math.max(1, Math.trunc(qty));
  return withDb((db) => {
    const p = db.products.find((x) => x.id === productId);
    if (!p) return { ok: false as const, message: "Prodotto non trovato" };
    const s = p.sizes.find((x) => x.size === size);
    if (!s) return { ok: false as const, message: `Taglia ${size} assente` };
    if (s.stock < n) {
      return {
        ok: false as const,
        message: `Stock insufficiente: ${p.title} · ${size} (disponibili ${s.stock})`,
      };
    }
    s.stock -= n;
    if (p.sizes.every((x) => x.stock <= 0) && p.status === "live") {
      p.status = "soldout";
    }
    return {
      ok: true as const,
      remaining: s.stock,
      title: p.title,
    };
  });
}

export function getProductById(id: string): Product | undefined {
  return readDb().products.find((p) => p.id === id);
}

export function getAvailableStock(productId: string, size: string): number {
  const p = getProductById(productId);
  return p?.sizes.find((s) => s.size === size)?.stock ?? 0;
}

/**
 * Try to reserve stock for lines. Returns false if any line lacks stock.
 * Decrements stock in DB.
 */
function aggregateLines(
  lines: { productId: string; size: string; qty: number }[],
): { productId: string; size: string; qty: number }[] {
  const map = new Map<string, { productId: string; size: string; qty: number }>();
  for (const line of lines) {
    const qty = Math.trunc(Number(line.qty));
    if (!Number.isFinite(qty) || qty < 1) continue;
    const key = `${line.productId}::${line.size}`;
    const prev = map.get(key);
    if (prev) prev.qty += qty;
    else map.set(key, { productId: line.productId, size: line.size, qty });
  }
  return Array.from(map.values());
}

export async function reserveStock(lines: { productId: string; size: string; qty: number }[]): Promise<{
  ok: boolean;
  message?: string;
}> {
  return withDb((db) => {
    lines = aggregateLines(lines);
    for (const line of lines) {
      const p = db.products.find((x) => x.id === line.productId);
      if (!p) return { ok: false, message: `Unknown product ${line.productId}` };
      const s = p.sizes.find((x) => x.size === line.size);
      if (!s || s.stock < line.qty) {
        return {
          ok: false,
          message: `Insufficient stock for ${p.title} · ${line.size} (need ${line.qty}, have ${s?.stock ?? 0})`,
        };
      }
    }
    for (const line of lines) {
      const p = db.products.find((x) => x.id === line.productId)!;
      const s = p.sizes.find((x) => x.size === line.size)!;
      s.stock -= line.qty;
      if (p.sizes.every((x) => x.stock <= 0) && p.status === "live") {
        p.status = "soldout";
      }
    }
    return { ok: true };
  });
}

export async function releaseStock(lines: { productId: string; size: string; qty: number }[]): Promise<void> {
  await withDb((db) => {
    for (const line of lines) {
      const p = db.products.find((x) => x.id === line.productId);
      if (!p) continue;
      const s = p.sizes.find((x) => x.size === line.size);
      if (!s) continue;
      s.stock += line.qty;
      if (p.status === "soldout" && p.sizes.some((x) => x.stock > 0)) {
        p.status = "live";
      }
    }
  });
}

export type QuoteInput = {
  items: { productId: string; size: string; qty: number }[];
  discountCode?: string;
  referralCode?: string;
  customerEmail?: string;
};

export type QuoteResult = {
  lines: OrderLine[];
  subtotal: number;
  discountAmount: number;
  shipping: number;
  total: number;
  appliedPercent: number;
  discountCode: string | null;
  referralCode: string | null;
};

/**
 * Discount rules (server):
 * - Promo code and referral are NEVER stacked: promo wins if both present and valid.
 * - Referral cannot be used by the code owner (same email).
 * - maxUses is enforced atomically when the order is confirmed paid (or at reserve for bank).
 */
export function quoteOrder(input: QuoteInput): QuoteResult {
  const db = readDb();
  const lines: OrderLine[] = [];

  for (const raw of input.items) {
    const qty = Math.trunc(Number(raw.qty));
    if (!qty || qty < 1) throw new Error("Invalid quantity");
    const item = { productId: raw.productId, size: raw.size, qty };
    const p = db.products.find((x) => x.id === item.productId);
    if (!p) throw new Error(`Product not found: ${item.productId}`);
    if (p.status !== "live") throw new Error(`${p.title} is not available`);
    const sizeRow = p.sizes.find((s) => s.size === item.size);
    if (!sizeRow) throw new Error(`Size ${item.size} not found`);
    if (sizeRow.stock < item.qty) {
      throw new Error(
        `Not enough stock for ${p.title} · ${item.size} (available ${sizeRow.stock})`,
      );
    }
    const unitPrice = p.discountPrice ?? p.price;
    lines.push({
      productId: p.id,
      slug: p.slug,
      title: p.title,
      size: item.size,
      qty: item.qty,
      unitPrice,
    });
  }

  let discountPercent = 0;
  let referralPercent = 0;
  let discountCode: string | null = null;
  let referralCode: string | null = null;

  const codeRaw = input.discountCode?.trim().toUpperCase();
  if (codeRaw) {
    const dc = db.settings.discountCodes?.find(
      (c) => c.code.toUpperCase() === codeRaw && c.active,
    );
    if (!dc) throw new Error("Invalid discount code");
    if (dc.maxUses != null && (dc.used ?? 0) >= dc.maxUses) {
      throw new Error("Discount code exhausted");
    }
    discountPercent = dc.percent;
    discountCode = dc.code;
  }

  const refRaw = input.referralCode?.trim().toUpperCase();
  if (refRaw && discountPercent === 0) {
    const ref = db.referrals.find((r) => r.code.toUpperCase() === refRaw);
    if (!ref) throw new Error("Invalid referral code");
    if (
      input.customerEmail &&
      ref.ownerEmail.toLowerCase() === input.customerEmail.toLowerCase()
    ) {
      throw new Error("You cannot use your own referral code");
    }
    referralPercent = db.settings.referralPercent ?? 10;
    referralCode = ref.code;
  }

  const totals = computeTotals({
    items: lines.map((l) => ({ price: l.unitPrice, qty: l.qty })),
    settings: {
      freeShippingThreshold: db.settings.freeShippingThreshold,
      shippingFee: 12,
    },
    discountPercent,
    referralPercent,
  });

  return {
    lines,
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    shipping: totals.shipping,
    total: totals.total,
    appliedPercent: totals.appliedPercent,
    discountCode,
    referralCode,
  };
}

function newOrderId(): string {
  return `PL-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

export async function createPendingOrder(input: {
  items: { productId: string; size: string; qty: number }[];
  customer: PlabOrder["customer"];
  discountCode?: string;
  referralCode?: string;
  paymentMethod: "stripe" | "bank";
  /** Hold minutes: stripe 30, bank 48h */
  holdMinutes: number;
}): Promise<PlabOrder> {
  const quote = quoteOrder({
    items: input.items,
    discountCode: input.discountCode,
    referralCode: input.referralCode,
    customerEmail: input.customer.email,
  });

  const reserve = await reserveStock(
    quote.lines.map((l) => ({ productId: l.productId, size: l.size, qty: l.qty })),
  );
  if (!reserve.ok) {
    throw new Error(reserve.message ?? "Stock reservation failed");
  }

  const now = Date.now();
  const order: PlabOrder = {
    id: newOrderId(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + input.holdMinutes * 60_000).toISOString(),
    items: quote.lines,
    subtotal: quote.subtotal,
    discountAmount: quote.discountAmount,
    shipping: quote.shipping,
    total: quote.total,
    discountCode: quote.discountCode,
    referralCode: quote.referralCode,
    appliedPercent: quote.appliedPercent,
    customer: input.customer,
    status: "pending_payment",
    shippingStatus: "to_ship",
    paymentMethod: input.paymentMethod,
    stripeSessionId: null,
    stockReserved: true,
    staffNotifiedAt: null,
    receiptToken: randomBytes(24).toString("hex"),
  };

  await withDb((db) => {
    db.orders.unshift(order);
  });

  return order;
}

export async function setOrderStripeSession(
  orderId: string,
  sessionId: string,
): Promise<void> {
  await withDb((db) => {
    const o = db.orders.find((x) => x.id === orderId);
    if (o) o.stripeSessionId = sessionId;
  });
}

export function getOrderById(id: string): PlabOrder | null {
  return readDb().orders.find((o) => o.id === id) ?? null;
}

export function getOrderForReceipt(
  id: string,
  token?: string,
  _email?: string,
): PlabOrder | null {
  const o = getOrderById(id);
  if (!o) return null;
  // Token required — email alone is not sufficient
  if (token && o.receiptToken && token === o.receiptToken) return o;
  return null;
}

export function getPaidOrderByIdAndEmail(
  orderId: string,
  email: string,
): PlabOrder | null {
  const o = getOrderById(orderId);
  if (!o) return null;
  if (o.status !== "paid") return null;
  if (o.customer.email.toLowerCase() !== email.trim().toLowerCase()) return null;
  return o;
}


export function getOrderByStripeSession(sessionId: string): PlabOrder | null {
  return readDb().orders.find((o) => o.stripeSessionId === sessionId) ?? null;
}

/** Idempotent: mark paid, consume discount, bump referral, notify once */
export async function markOrderPaid(orderId: string): Promise<PlabOrder | null> {
  return withDb((db) => {
    const o = db.orders.find((x) => x.id === orderId);
    if (!o) return null;
    if (o.status === "paid") return o; // idempotent

    // Late webhook after expiry: stock may have been released — re-reserve best-effort, never throw (avoids Stripe retries)
    if (o.status === "cancelled" || o.status === "expired") {
      if (!o.stockReserved) {
        const lines = aggregateLines(
          o.items.map((i) => ({ productId: i.productId, size: i.size, qty: i.qty })),
        );
        for (const line of lines) {
          const prod = db.products.find((x) => x.id === line.productId);
          const sz = prod?.sizes.find((x) => x.size === line.size);
          if (prod && sz && sz.stock >= line.qty) {
            sz.stock -= line.qty;
          }
        }
      }
      o.status = "paid";
      o.expiresAt = null;
      o.stockReserved = true;
      if (o.shippingStatus === "cancelled") o.shippingStatus = "to_ship";
      if (o.discountCode) {
        const dc = db.settings.discountCodes?.find(
          (c) => c.code.toUpperCase() === o.discountCode!.toUpperCase(),
        );
        if (dc) dc.used = (dc.used ?? 0) + 1;
      }
      if (o.referralCode) {
        const ref = db.referrals.find(
          (r) => r.code.toUpperCase() === o.referralCode!.toUpperCase(),
        );
        if (ref) ref.uses += 1;
      }
      return o;
    }

    o.status = "paid";
    o.expiresAt = null;
    // stock stays reserved/decreased
    o.stockReserved = true;

    if (o.discountCode) {
      const dc = db.settings.discountCodes?.find(
        (c) => c.code.toUpperCase() === o.discountCode!.toUpperCase(),
      );
      if (dc) dc.used = (dc.used ?? 0) + 1;
    }
    if (o.referralCode) {
      const ref = db.referrals.find(
        (r) => r.code.toUpperCase() === o.referralCode!.toUpperCase(),
      );
      if (ref) ref.uses += 1;
    }
    return o;
  });
}

/** Idempotent release on expire/cancel */
export async function expireOrCancelOrder(
  orderId: string,
  reason: "expired" | "cancelled",
): Promise<PlabOrder | null> {
  // Single withDb transaction — avoids double stock release under concurrent webhook + sweep
  return withDb((db) => {
    const o = db.orders.find((x) => x.id === orderId);
    if (!o) return null;
    if (o.status === "paid") return o;
    if (o.status === "expired" || o.status === "cancelled") return o;

    if (o.stockReserved) {
      const lines = aggregateLines(
        o.items.map((i) => ({ productId: i.productId, size: i.size, qty: i.qty })),
      );
      for (const line of lines) {
        const prod = db.products.find((x) => x.id === line.productId);
        if (!prod) continue;
        const sz = prod.sizes.find((x) => x.size === line.size);
        if (!sz) continue;
        sz.stock += line.qty;
        if (prod.status === "soldout" && prod.sizes.some((x) => x.stock > 0)) {
          prod.status = "live";
        }
      }
    }

    o.status = reason;
    o.stockReserved = false;
    o.shippingStatus = "cancelled";
    return o;
  });
}

/** Sweep expired pending orders (call from checkout/webhook) */
export async function sweepExpiredOrders(): Promise<number> {
  const db = readDb();
  const now = Date.now();
  let n = 0;
  for (const o of db.orders) {
    if (
      o.status === "pending_payment" &&
      o.expiresAt &&
      new Date(o.expiresAt).getTime() < now
    ) {
      await expireOrCancelOrder(o.id, "expired");
      n += 1;
    }
  }
  return n;
}

export async function markStaffNotified(orderId: string): Promise<void> {
  await withDb((db) => {
    const o = db.orders.find((x) => x.id === orderId);
    if (o && !o.staffNotifiedAt) {
      o.staffNotifiedAt = new Date().toISOString();
    }
  });
}

export async function adminMarkBankPaid(orderId: string): Promise<PlabOrder | null> {
  const o = getOrderById(orderId);
  if (!o) return null;
  if (o.paymentMethod !== "bank") throw new Error("Not a bank transfer order");
  return markOrderPaid(orderId);
}

export function listOrders(): PlabOrder[] {
  return readDb().orders;
}


function holdsFromDb(db: DbShape): StoreHold[] {
  return ((db as DbShape & { holds?: StoreHold[] }).holds ?? []) as StoreHold[];
}

export async function expireStoreHolds(): Promise<number> {
  return withDb((db) => {
    const holds = holdsFromDb(db);
    const now = Date.now();
    let n = 0;
    const next: StoreHold[] = [];
    for (const h of holds) {
      if (
        (h.status === "pending" || h.status === "ready") &&
        new Date(h.holdUntil).getTime() < now
      ) {
        if (h.stockReserved) {
          const p = db.products.find((x) => x.id === h.productId);
          const s = p?.sizes.find((x) => x.size === h.size);
          if (s) {
            s.stock += 1;
            if (p && p.status === "soldout" && p.sizes.some((x) => x.stock > 0)) {
              p.status = "live";
            }
          }
        }
        next.push({ ...h, status: "expired", stockReserved: false });
        n += 1;
      } else {
        next.push(h);
      }
    }
    (db as DbShape & { holds: StoreHold[] }).holds = next;
    return n;
  });
}

export function activeHoldsForProduct(productId: string, size: string): number {
  const db = readDb();
  expireStoreHoldsSync(db);
  const now = Date.now();
  return holdsFromDb(db).filter(
    (h) =>
      h.productId === productId &&
      h.size === size &&
      (h.status === "pending" || h.status === "ready") &&
      new Date(h.holdUntil).getTime() > now,
  ).length;
}

function expireStoreHoldsSync(db: DbShape): void {
  const holds = holdsFromDb(db);
  const now = Date.now();
  const next: StoreHold[] = [];
  for (const h of holds) {
    if (
      (h.status === "pending" || h.status === "ready") &&
      new Date(h.holdUntil).getTime() < now &&
      h.stockReserved
    ) {
      const p = db.products.find((x) => x.id === h.productId);
      const s = p?.sizes.find((x) => x.size === h.size);
      if (s) s.stock += 1;
      next.push({ ...h, status: "expired", stockReserved: false });
    } else if (
      (h.status === "pending" || h.status === "ready") &&
      new Date(h.holdUntil).getTime() < now
    ) {
      next.push({ ...h, status: "expired", stockReserved: false });
    } else {
      next.push(h);
    }
  }
  (db as DbShape & { holds: StoreHold[] }).holds = next;
}

export async function createStoreHold(input: {
  productId: string;
  size: string;
  customerName: string;
  phone: string;
  email: string;
  note?: string;
  holdHours?: number;
}): Promise<StoreHold> {
  await expireStoreHolds();
  return withDb((db) => {
    const p = db.products.find((x) => x.id === input.productId);
    if (!p) throw new Error("Product not found");
    if (p.status !== "live") throw new Error("Product not available for hold");
    const s = p.sizes.find((x) => x.size === input.size);
    if (!s || s.stock < 1) {
      throw new Error(`No stock for ${p.title} · ${input.size}`);
    }
    s.stock -= 1;
    if (p.sizes.every((x) => x.stock <= 0)) p.status = "soldout";

    const hours = input.holdHours ?? 48;
    const hold: StoreHold = {
      id: `RS-${Date.now().toString(36).toUpperCase()}`,
      createdAt: new Date().toISOString(),
      productId: p.id,
      productTitle: p.title,
      slug: p.slug,
      size: input.size,
      customerName: input.customerName.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      note: input.note?.trim(),
      status: "pending",
      holdUntil: new Date(Date.now() + hours * 3600 * 1000).toISOString(),
      stockReserved: true,
    };
    const holds = holdsFromDb(db);
    holds.unshift(hold);
    (db as DbShape & { holds: StoreHold[] }).holds = holds;
    return hold;
  });
}

export async function updateStoreHoldStatus(
  id: string,
  status: StoreHold["status"],
): Promise<StoreHold[]> {
  return withDb((db) => {
    const holds = holdsFromDb(db);
    const next = holds.map((h) => {
      if (h.id !== id) return h;
      if (
        (status === "cancelled" || status === "expired") &&
        h.stockReserved &&
        (h.status === "pending" || h.status === "ready")
      ) {
        const p = db.products.find((x) => x.id === h.productId);
        const s = p?.sizes.find((x) => x.size === h.size);
        if (s) {
          s.stock += 1;
          if (p && p.status === "soldout") p.status = "live";
        }
        return { ...h, status, stockReserved: false };
      }
      if (status === "picked_up") {
        return { ...h, status, stockReserved: false };
      }
      return { ...h, status };
    });
    (db as DbShape & { holds: StoreHold[] }).holds = next;
    return next;
  });
}

export function listStoreHolds(): StoreHold[] {
  const db = readDb();
  expireStoreHoldsSync(db);
  writeDb(db);
  return holdsFromDb(db);
}


export async function notifyStaff(message: string): Promise<void> {
  // Server-side only — never opens the customer's browser.
  console.info("[PLAB STAFF NOTIFY]", message);
  const webhook = process.env.STAFF_NOTIFY_WEBHOOK;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: message }),
      });
    } catch (e) {
      console.warn("[PLAB] staff webhook failed", e);
    }
  }
}
