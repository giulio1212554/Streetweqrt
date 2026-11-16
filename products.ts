export type ProductStatus = "draft" | "teaser" | "live" | "soldout";

export type Product = {
  id: string;
  slug: string;
  title: string;
  price: number;
  discountPrice?: number;
  category: "hoodies" | "tees" | "cargo" | "accessories";
  sizes: { size: string; stock: number }[];
  description: string;
  /** Fabric / materials e.g. "450gsm French terry, 100% cotton" */
  materials?: string;
  status: ProductStatus;
  /** Image URLs or data: URLs */
  images: string[];
  dropDate?: string; // ISO
  limited?: boolean;
};

export type PaymentMethod = "bank" | "card" | "both" | "stripe";

export type PaymentDestination = {
  method: PaymentMethod;
  /** Bank transfer */
  accountHolder: string;
  iban: string;
  bic: string;
  bankName: string;
  /** Card / Stripe-like reference shown to customer */
  cardLabel: string;
  cardLast4: string;
  /** Notes shown at checkout */
  notes: string;
  /**
   * Test mode: checkout creates a paid order without calling Stripe.
   * Use only in local/dev. Never enable in production with real customers.
   */
  testMode?: boolean;
};

export type StoreLocation = {
  name: string;
  address: string;
  city: string;
  hours: string;
  pickupNote: string;
  staffWhatsApp: string; // e.g. 393331234567 without +
};

export type DiscountCode = {
  code: string;
  percent: number;
  active: boolean;
  earlyAccess?: boolean; // unlocks teaser drops early
  maxUses?: number;
  used?: number;
};

export type PosHotkey = {
  /** Single letter a-z */
  key: string;
  productId: string;
  size: string;
  label?: string;
};

export type SiteSettings = {
  marqueeText: string;
  nextDropDate: string; // ISO
  bannerMessage: string;
  freeShippingThreshold: number;
  payment: PaymentDestination;
  store: StoreLocation;
  social: {
    instagram: string;
    tiktok: string;
    lookbookUrl: string;
  };
  /** Lookbook editorial photos (URL or data-URL) — editable in admin */
  lookbookImages: string[];
  /** POS negozio: lettera tastiera → prodotto/taglia da scalare */
  posHotkeys: PosHotkey[];
  referralPercent: number;
  discountCodes: DiscountCode[];
  /** Pagina Informazioni (modificabile da admin) */
  aboutTitle: string;
  aboutBody: string;
  aboutFooter: string;
};

export const DEFAULT_SETTINGS: SiteSettings = {
  marqueeText: "PROJECT LAB // URBAN UNIFORM // EXCLUSIVE RELEASES // WORLDWIDE SHIPPING // LIMITED DROPS // NO RESTOCKS //",
  nextDropDate: "2026-11-15T18:00:00+01:00",
  bannerMessage: "NEXT DROP — 15 NOV 2026 · 18:00 CET",
  freeShippingThreshold: 150,
  payment: {
    method: "stripe",
    accountHolder: "",
    iban: "",
    bic: "",
    bankName: "",
    cardLabel: "",
    cardLast4: "",
    notes: "Paga in sicurezza con carta via Stripe. Spedizione dopo conferma pagamento.",
    testMode: false,
  },
  store: {
    name: "PROJECT LAB Store",
    address: "Corso Vittoria Colonna",
    city: "Ischia Porto (NA)",
    hours: "Mar–Dom 10:00–20:00 · Lunedì chiuso",
    pickupNote: "Ritiro solo a Ischia Porto, mar–dom 10–20. Porta il codice QR della prenotazione.",
    staffWhatsApp: "393331234567",
  },
  social: {
    instagram: "https://instagram.com/",
    tiktok: "https://tiktok.com/",
    lookbookUrl: "/collections",
  },
  lookbookImages: [],
  posHotkeys: [],
  referralPercent: 10,
  discountCodes: [
    { code: "LAB10", percent: 10, active: true, maxUses: 100, used: 0 },
    { code: "DROPACCESS", percent: 0, active: true, earlyAccess: true, maxUses: 50, used: 0 },
  ],
  aboutTitle: "Informazioni",
  aboutBody:
    "PROJECT LAB è un label streetwear indipendente dedicato a uscite limitate, utility urbana e drop senza restock. Pensato per chi si muove in città con intenzionalità.",
  aboutFooter: "Limited Drops. No Restocks. Spedizione mondiale.",
};

export const PRODUCTS: Product[] = [
  {
    id: "pl-001",
    slug: "acid-hoodie-black",
    title: "ACID HOODIE / BLACK",
    price: 180,
    category: "hoodies",
    sizes: [
      { size: "S", stock: 4 },
      { size: "M", stock: 2 },
      { size: "L", stock: 0 },
      { size: "XL", stock: 3 },
    ],
    description: "Heavyweight 450gsm French terry. Oversized fit. Embroidered acid green logo. Limited run of 120.",
    status: "live",
    images: [],
    limited: true,
  },
  {
    id: "pl-002",
    slug: "lab-tee-white",
    title: "LAB TEE / WHITE",
    price: 65,
    category: "tees",
    sizes: [
      { size: "S", stock: 12 },
      { size: "M", stock: 8 },
      { size: "L", stock: 5 },
      { size: "XL", stock: 9 },
    ],
    description: "220gsm organic cotton. Boxy cut. Screen print front + back.",
    status: "live",
    images: [],
  },
  {
    id: "pl-003",
    slug: "cargo-pants-charcoal",
    title: "CARGO / CHARCOAL",
    price: 220,
    discountPrice: 180,
    category: "cargo",
    sizes: [
      { size: "S", stock: 1 },
      { size: "M", stock: 0 },
      { size: "L", stock: 3 },
      { size: "XL", stock: 2 },
    ],
    description: "Ripstop nylon. Multiple utility pockets. Adjustable waist. Water resistant.",
    status: "live",
    images: [],
    limited: true,
  },
  {
    id: "pl-004",
    slug: "cap-acid",
    title: "ACID CAP",
    price: 45,
    category: "accessories",
    sizes: [{ size: "OS", stock: 25 }],
    description: "Structured 6-panel. Acid green undervisor. Metal clasp.",
    status: "live",
    images: [],
  },
  {
    id: "pl-005",
    slug: "teaser-parka",
    title: "STORM PARKA",
    price: 320,
    category: "hoodies",
    sizes: [
      { size: "S", stock: 0 },
      { size: "M", stock: 0 },
      { size: "L", stock: 0 },
      { size: "XL", stock: 0 },
    ],
    description: "Coming next drop. 3-layer shell. Fully taped seams.",
    status: "teaser",
    images: [],
    dropDate: "2026-11-15T18:00:00+01:00",
  },
  {
    id: "pl-006",
    slug: "sold-out-jersey",
    title: "LAB JERSEY / BLACK",
    price: 95,
    category: "tees",
    sizes: [
      { size: "S", stock: 0 },
      { size: "M", stock: 0 },
      { size: "L", stock: 0 },
      { size: "XL", stock: 0 },
    ],
    description: "Sold out. No restocks.",
    status: "soldout",
    images: [],
  },
];

export function getProductBySlug(slug: string) {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function getLiveProducts() {
  return PRODUCTS.filter((p) => p.status === "live" || p.status === "soldout");
}

export function getTeaserProducts() {
  return PRODUCTS.filter((p) => p.status === "teaser");
}
