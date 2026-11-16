import { describe, expect, it } from "vitest";
import { computeTotals } from "@/lib/totals";

describe("computeTotals", () => {
  const settings = { freeShippingThreshold: 150, shippingFee: 12 };

  it("computes subtotal and free shipping over threshold", () => {
    const t = computeTotals({
      items: [{ price: 100, qty: 2 }],
      settings,
    });
    expect(t.subtotal).toBe(200);
    expect(t.discountAmount).toBe(0);
    expect(t.shipping).toBe(0);
    expect(t.total).toBe(200);
  });

  it("adds shipping under threshold", () => {
    const t = computeTotals({
      items: [{ price: 50, qty: 1 }],
      settings,
    });
    expect(t.shipping).toBe(12);
    expect(t.total).toBe(62);
  });

  it("applies promo percent before shipping", () => {
    const t = computeTotals({
      items: [{ price: 100, qty: 1 }],
      settings,
      discountPercent: 10,
    });
    expect(t.discountAmount).toBe(10);
    expect(t.afterDiscount).toBe(90);
    expect(t.shipping).toBe(12);
    expect(t.total).toBe(102);
    expect(t.appliedPercent).toBe(10);
  });

  it("uses referral only when promo is zero", () => {
    const t = computeTotals({
      items: [{ price: 100, qty: 1 }],
      settings,
      discountPercent: 0,
      referralPercent: 10,
    });
    expect(t.appliedPercent).toBe(10);
    expect(t.discountAmount).toBe(10);
  });

  it("prefers promo over referral when both provided to computeTotals", () => {
    const t = computeTotals({
      items: [{ price: 100, qty: 1 }],
      settings,
      discountPercent: 20,
      referralPercent: 10,
    });
    expect(t.appliedPercent).toBe(20);
    expect(t.discountAmount).toBe(20);
  });

  it("free shipping after discount if threshold met", () => {
    const t = computeTotals({
      items: [{ price: 160, qty: 1 }],
      settings,
      discountPercent: 10,
    });
    // 160 - 16 = 144 < 150 → still shipping
    expect(t.afterDiscount).toBe(144);
    expect(t.shipping).toBe(12);
  });

  it("zero cart has zero shipping and total", () => {
    const t = computeTotals({ items: [], settings });
    expect(t.subtotal).toBe(0);
    expect(t.shipping).toBe(0);
    expect(t.total).toBe(0);
  });
});
