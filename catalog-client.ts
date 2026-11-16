/**
 * Load catalog from server (source of truth). Falls back to local seed/cache.
 */
import type { Product, SiteSettings } from "@/data/products";
import { PRODUCTS, DEFAULT_SETTINGS } from "@/data/products";
import { loadProducts, loadSettings, saveProducts, saveSettings } from "@/lib/store";

export async function fetchCatalog(): Promise<{
  products: Product[];
  settings: SiteSettings;
  fromServer: boolean;
}> {
  try {
    const { publicGetCatalog } = await import("@/lib/admin.functions");
    const data = await publicGetCatalog();
    // Mirror to localStorage so offline UI stays coherent
    try {
      saveProducts(data.products);
      saveSettings(data.settings);
    } catch {
      /* ignore */
    }
    return { products: data.products, settings: data.settings, fromServer: true };
  } catch {
    return {
      products: loadProducts().length ? loadProducts() : PRODUCTS,
      settings: loadSettings() || DEFAULT_SETTINGS,
      fromServer: false,
    };
  }
}
