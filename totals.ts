/**
 * Shared order total calculation (client + server safe, no browser APIs).
 */

export type TotalsLineItem = {
  price: number;
  qty: number;
};

export type TotalsSettings = {
  freeShippingThreshold: number;
  /** Flat shipping fee when under threshold (EUR). */
  shippingFee?: number;
};

export type ComputeTotalsInput = {
  items: TotalsLineItem[];
  settings: TotalsSettings;
  /** Promo code discount percentage (0–100). */
  discountPercent?: number;
  /** Referral bonus percentage applied only when discountPercent is 0. */
  referralPercent?: number;
};

export type OrderTotals = {
  subtotal: number;
  discountAmount: number;
  afterDiscount: number;
  shipping: number;
  total: number;
  /** Effective percent used (promo or referral). */
  appliedPercent: number;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeTotals(input: ComputeTotalsInput): OrderTotals {
  const {
    items,
    settings,
    discountPercent = 0,
    referralPercent = 0,
  } = input;

  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + item.price * item.qty, 0)
  );

  const promo = Math.max(0, Math.min(100, discountPercent));
  const referral = Math.max(0, Math.min(100, referralPercent));
  const appliedPercent = promo > 0 ? promo : referral;

  const discountAmount = roundMoney(subtotal * (appliedPercent / 100));
  const afterDiscount = Math.max(0, roundMoney(subtotal - discountAmount));

  const threshold = settings.freeShippingThreshold;
  const fee = settings.shippingFee ?? 12;
  const shipping =
    afterDiscount === 0 || afterDiscount >= threshold ? 0 : fee;

  const total = roundMoney(afterDiscount + shipping);

  return {
    subtotal,
    discountAmount,
    afterDiscount,
    shipping,
    total,
    appliedPercent,
  };
}
