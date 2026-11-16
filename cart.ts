/**
 * PROJECT LAB — Cart (localStorage)
 */

export type CartItem = {
  productId: string;
  slug: string;
  title: string;
  price: number;
  size: string;
  qty: number;
};

const CART_KEY = "plab-cart-v1";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadCart(): CartItem[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCart(items: CartItem[]): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("plab-cart-updated"));
  } catch (e) {
    console.warn("[PLAB] cart save failed", e);
  }
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((n, i) => n + i.qty, 0);
}

export function cartSubtotal(items: CartItem[]): number {
  return items.reduce((n, i) => n + i.price * i.qty, 0);
}

export function addToCart(
  item: Omit<CartItem, "qty"> & { qty?: number },
  maxStock?: number,
): CartItem[] {
  const items = loadCart();
  const qty = item.qty ?? 1;
  const idx = items.findIndex(
    (x) => x.productId === item.productId && x.size === item.size,
  );
  const current = idx >= 0 ? items[idx]!.qty : 0;
  const nextQty = current + qty;
  if (maxStock != null && nextQty > maxStock) {
    throw new Error(`Only ${maxStock} in stock for size ${item.size}`);
  }
  if (idx >= 0) {
    items[idx] = { ...items[idx]!, qty: nextQty };
  } else {
    items.push({
      productId: item.productId,
      slug: item.slug,
      title: item.title,
      price: item.price,
      size: item.size,
      qty,
    });
  }
  saveCart(items);
  return items;
}

export function updateCartQty(productId: string, size: string, qty: number): CartItem[] {
  let items = loadCart();
  if (qty <= 0) {
    items = items.filter((x) => !(x.productId === productId && x.size === size));
  } else {
    items = items.map((x) =>
      x.productId === productId && x.size === size ? { ...x, qty } : x
    );
  }
  saveCart(items);
  return items;
}

export function removeFromCart(productId: string, size: string): CartItem[] {
  const items = loadCart().filter((x) => !(x.productId === productId && x.size === size));
  saveCart(items);
  return items;
}

export function clearCart(): void {
  saveCart([]);
}
