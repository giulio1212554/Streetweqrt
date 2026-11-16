/**
 * In-store holds (client mirror). Prefer server createStoreHold for stock.
 */

export type StoreReservation = {
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
};

const KEY = "plab-store-reservations-v1";

function expireList(list: StoreReservation[]): StoreReservation[] {
  const now = Date.now();
  return list.map((r) => {
    if (
      (r.status === "pending" || r.status === "ready") &&
      new Date(r.holdUntil).getTime() < now
    ) {
      return { ...r, status: "expired" as const };
    }
    return r;
  });
}

export function loadReservations(): StoreReservation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list: StoreReservation[] = raw ? JSON.parse(raw) : [];
    const expired = expireList(list);
    if (JSON.stringify(expired) !== JSON.stringify(list)) {
      saveReservations(expired);
    }
    return expired;
  } catch {
    return [];
  }
}

export function saveReservations(list: StoreReservation[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
}

/** Active holds count for product/size (after expiring stale rows). */
export function activeReservationsForProduct(
  productId: string,
  size: string,
): number {
  const now = Date.now();
  return loadReservations().filter(
    (r) =>
      r.productId === productId &&
      r.size === size &&
      (r.status === "pending" || r.status === "ready") &&
      new Date(r.holdUntil).getTime() > now,
  ).length;
}

export function createReservation(input: {
  productId: string;
  productTitle: string;
  slug: string;
  size: string;
  customerName: string;
  phone: string;
  email: string;
  note?: string;
  holdHours?: number;
}): StoreReservation {
  const hours = input.holdHours ?? 48;
  const reservation: StoreReservation = {
    id: `RS-${Date.now().toString(36).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    productId: input.productId,
    productTitle: input.productTitle,
    slug: input.slug,
    size: input.size,
    customerName: input.customerName.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    note: input.note?.trim(),
    status: "pending",
    holdUntil: new Date(Date.now() + hours * 3600 * 1000).toISOString(),
  };
  const list = loadReservations();
  list.unshift(reservation);
  saveReservations(list);
  return reservation;
}

export function updateReservationStatus(
  id: string,
  status: StoreReservation["status"],
): StoreReservation[] {
  const list = loadReservations().map((r) =>
    r.id === id ? { ...r, status } : r,
  );
  saveReservations(list);
  return list;
}
