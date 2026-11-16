/**
 * PROJECT LAB — local persistence (localStorage)
 * Products + site settings survive refresh and browser restarts on this machine.
 */

import {
  PRODUCTS as SEED_PRODUCTS,
  DEFAULT_SETTINGS,
  type Product,
  type SiteSettings,
} from "@/data/products";

const PRODUCTS_KEY = "plab-products-v1";
const SETTINGS_KEY = "plab-settings-v1";
const SUBSCRIBERS_KEY = "plab-subscribers-v1";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadProducts(): Product[] {
  if (!canUseStorage()) return structuredClone(SEED_PRODUCTS);
  try {
    const raw = localStorage.getItem(PRODUCTS_KEY);
    if (!raw) {
      saveProducts(SEED_PRODUCTS);
      return structuredClone(SEED_PRODUCTS);
    }
    const parsed = JSON.parse(raw) as Product[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      saveProducts(SEED_PRODUCTS);
      return structuredClone(SEED_PRODUCTS);
    }
    return parsed;
  } catch {
    return structuredClone(SEED_PRODUCTS);
  }
}

export function saveProducts(products: Product[]): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  } catch (e) {
    console.warn("[PLAB] could not save products", e);
  }
}

export function loadSettings(): SiteSettings {
  if (!canUseStorage()) return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      saveSettings(DEFAULT_SETTINGS);
      return { ...DEFAULT_SETTINGS };
    }
    const parsed = JSON.parse(raw) as Partial<SiteSettings>;
    const nextDrop =
      typeof parsed.nextDropDate === "string" && parsed.nextDropDate.trim()
        ? parsed.nextDropDate.trim()
        : DEFAULT_SETTINGS.nextDropDate;
    // Invalid dates in localStorage break the countdown → fall back to default
    const parsedMs = Date.parse(nextDrop);
    const safeDrop = Number.isNaN(parsedMs)
      ? DEFAULT_SETTINGS.nextDropDate
      : nextDrop;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      nextDropDate: safeDrop,
      payment: { ...DEFAULT_SETTINGS.payment, ...(parsed.payment ?? {}) },
      store: { ...DEFAULT_SETTINGS.store, ...(parsed.store ?? {}) },
      social: { ...DEFAULT_SETTINGS.social, ...(parsed.social ?? {}) },
      discountCodes: parsed.discountCodes ?? DEFAULT_SETTINGS.discountCodes,
      referralPercent: parsed.referralPercent ?? DEFAULT_SETTINGS.referralPercent,
      aboutTitle: parsed.aboutTitle ?? DEFAULT_SETTINGS.aboutTitle,
      aboutBody: parsed.aboutBody ?? DEFAULT_SETTINGS.aboutBody,
      aboutFooter: parsed.aboutFooter ?? DEFAULT_SETTINGS.aboutFooter,
      lookbookImages: Array.isArray((parsed as SiteSettings).lookbookImages)
        ? (parsed as SiteSettings).lookbookImages
        : DEFAULT_SETTINGS.lookbookImages,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: SiteSettings): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("[PLAB] could not save settings", e);
  }
}

export function loadSubscribers(): string[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(SUBSCRIBERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addSubscriber(email: string): void {
  if (!canUseStorage() || !email) return;
  const list = loadSubscribers();
  const normalized = email.trim().toLowerCase();
  if (!list.includes(normalized)) {
    list.push(normalized);
    localStorage.setItem(SUBSCRIBERS_KEY, JSON.stringify(list));
  }
}

/** Reset to seed data (useful from admin) */
export function resetToSeed(): void {
  saveProducts(SEED_PRODUCTS);
  saveSettings(DEFAULT_SETTINGS);
}

export function getProductBySlugFromStore(slug: string): Product | undefined {
  return loadProducts().find((p) => p.slug === slug);
}

export function getLiveProductsFromStore(): Product[] {
  return loadProducts().filter((p) => p.status === "live" || p.status === "soldout");
}

export function getTeaserProductsFromStore(): Product[] {
  return loadProducts().filter((p) => p.status === "teaser");
}


/**
 * Local catalog stock adjustment (UI cache).
 * Throws if product/size missing or insufficient stock — never fails silently.
 * Prefer server `reserveStock` / `createStoreHold` for real inventory.
 */
export function adjustStock(productId: string, size: string, delta: number): void {
  const products = loadProducts();
  const idx = products.findIndex((p) => p.id === productId);
  if (idx < 0) throw new Error(`Product not found: ${productId}`);
  const product = products[idx]!;
  const before = product.sizes.find((s) => s.size === size);
  if (!before) throw new Error(`Size ${size} not found`);
  if (delta < 0 && before.stock + delta < 0) {
    throw new Error(
      `Insufficient stock for ${product.title} · ${size} (have ${before.stock})`,
    );
  }
  const sizes = product.sizes.map((s) =>
    s.size === size ? { ...s, stock: s.stock + delta } : s,
  );
  products[idx] = {
    ...product,
    sizes,
    status:
      sizes.every((s) => s.stock <= 0) && product.status === "live"
        ? "soldout"
        : product.status === "soldout" && sizes.some((s) => s.stock > 0)
          ? "live"
          : product.status,
  };
  saveProducts(products);
}

export function getAvailableStock(productId: string, size: string): number {
  const p = loadProducts().find((x) => x.id === productId);
  return p?.sizes.find((s) => s.size === size)?.stock ?? 0;
}
