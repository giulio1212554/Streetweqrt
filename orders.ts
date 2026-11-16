/**
 * PROJECT LAB — shared order types + client-side order list helpers.
 * Server source of truth for paid/Stripe orders: plab-db.server.ts
 */

export type OrderLineItem = {
  productId: string;
  title: string;
  size: string;
  qty: number;
  /** Unit price (catalog or line) */
  price: number;
  slug?: string;
  unitPrice?: number;
};

/** @deprecated alias — use OrderLineItem */
export type OrderItem = OrderLineItem;

export type ShippingStatus = "to_ship" | "shipped" | "delivered" | "cancelled";

export type OrderStatus = "pending_payment" | "paid" | "cancelled" | "expired";

export type StoreOrder = {
  id: string;
  createdAt: string;
  items: OrderLineItem[];
  total: number;
  customer: {
    name: string;
    email: string;
    phone: string;
    address?: string;
    city?: string;
    zip?: string;
    country?: string;
  };
  status: OrderStatus;
  shippingStatus: ShippingStatus;
  paymentMethod?: string;
  stripeSessionId?: string;
  trackingCode?: string;
  shippedAt?: string;
  receiptToken?: string;
};

/** @deprecated alias — use StoreOrder */
export type OrderRecord = StoreOrder;

const ORDERS_KEY = "plab-orders-v1";

export function loadOrders(): StoreOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as StoreOrder[];
    if (!Array.isArray(list)) return [];
    return list.map((o) => ({
      ...o,
      shippingStatus: o.shippingStatus ?? "to_ship",
    }));
  } catch {
    return [];
  }
}

export function saveOrders(orders: StoreOrder[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

export function updateOrderShipping(
  id: string,
  shippingStatus: ShippingStatus,
  trackingCode?: string,
): StoreOrder[] {
  const orders = loadOrders();
  const next = orders.map((o) => {
    if (o.id !== id) return o;
    return {
      ...o,
      shippingStatus,
      trackingCode: trackingCode ?? o.trackingCode,
      shippedAt:
        shippingStatus === "shipped" || shippingStatus === "delivered"
          ? (o.shippedAt ?? new Date().toISOString())
          : o.shippedAt,
    };
  });
  saveOrders(next);
  return next;
}

export function ordersToShip(orders: StoreOrder[]): StoreOrder[] {
  return orders.filter(
    (o) => o.status === "paid" && o.shippingStatus === "to_ship",
  );
}

export function ordersShipped(orders: StoreOrder[]): StoreOrder[] {
  return orders.filter(
    (o) => o.shippingStatus === "shipped" || o.shippingStatus === "delivered",
  );
}
