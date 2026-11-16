/** Waitlist, discounts, returns, referrals, WhatsApp alerts */

import type { DiscountCode } from "@/data/products";
import { loadSettings, saveSettings } from "@/lib/store";

// ——— Waitlist ———
export type WaitlistEntry = {
  id: string;
  productId: string;
  productTitle: string;
  slug: string;
  size: string;
  email: string;
  phone?: string;
  createdAt: string;
  notified?: boolean;
};

const WAITLIST_KEY = "plab-waitlist-v1";

export function loadWaitlist(): WaitlistEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(WAITLIST_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addToWaitlist(entry: Omit<WaitlistEntry, "id" | "createdAt">): WaitlistEntry {
  const list = loadWaitlist();
  const row: WaitlistEntry = {
    ...entry,
    id: `WL-${Date.now().toString(36).toUpperCase()}`,
    createdAt: new Date().toISOString(),
  };
  list.unshift(row);
  localStorage.setItem(WAITLIST_KEY, JSON.stringify(list));
  return row;
}

// ——— Drop SMS / phone alerts ———
const DROP_SMS_KEY = "plab-drop-sms-v1";

export function loadDropPhones(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(DROP_SMS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addDropPhone(phone: string): void {
  const n = phone.replace(/\s/g, "");
  if (!n) return;
  const list = loadDropPhones();
  if (!list.includes(n)) {
    list.push(n);
    localStorage.setItem(DROP_SMS_KEY, JSON.stringify(list));
  }
}

// ——— Returns / RMA ———
export type RmaRequest = {
  id: string;
  orderId: string;
  email: string;
  reason: string;
  items: string;
  createdAt: string;
  status: "requested" | "approved" | "label_sent" | "received" | "refunded" | "rejected";
};

const RMA_KEY = "plab-rma-v1";

export function loadRmas(): RmaRequest[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RMA_KEY) || "[]");
  } catch {
    return [];
  }
}

export function createRma(input: Omit<RmaRequest, "id" | "createdAt" | "status">): RmaRequest {
  const row: RmaRequest = {
    ...input,
    id: `RMA-${Date.now().toString(36).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    status: "requested",
  };
  const list = loadRmas();
  list.unshift(row);
  localStorage.setItem(RMA_KEY, JSON.stringify(list));
  return row;
}

export function updateRmaStatus(id: string, status: RmaRequest["status"]): RmaRequest[] {
  const list = loadRmas().map((r) => (r.id === id ? { ...r, status } : r));
  localStorage.setItem(RMA_KEY, JSON.stringify(list));
  return list;
}

// ——— Referrals ———
const REF_KEY = "plab-referrals-v1";

export type ReferralRecord = {
  code: string;
  ownerEmail: string;
  uses: number;
  createdAt: string;
};

export function loadReferrals(): ReferralRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(REF_KEY) || "[]");
  } catch {
    return [];
  }
}

export function getOrCreateReferral(email: string): ReferralRecord {
  const list = loadReferrals();
  const existing = list.find((r) => r.ownerEmail.toLowerCase() === email.toLowerCase());
  if (existing) return existing;
  const code = `REF${email.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase()}${Date.now().toString(36).slice(-3).toUpperCase()}`;
  const row: ReferralRecord = {
    code,
    ownerEmail: email,
    uses: 0,
    createdAt: new Date().toISOString(),
  };
  list.push(row);
  localStorage.setItem(REF_KEY, JSON.stringify(list));
  return row;
}

export function findReferral(code: string): ReferralRecord | undefined {
  return loadReferrals().find((r) => r.code.toUpperCase() === code.toUpperCase());
}

export function bumpReferralUse(code: string): void {
  const list = loadReferrals().map((r) =>
    r.code.toUpperCase() === code.toUpperCase() ? { ...r, uses: r.uses + 1 } : r
  );
  localStorage.setItem(REF_KEY, JSON.stringify(list));
}

// ——— Discount validation ———
export function validateDiscount(code: string): {
  ok: boolean;
  percent: number;
  earlyAccess: boolean;
  message: string;
} {
  const settings = loadSettings();
  const c = settings.discountCodes?.find(
    (d) => d.code.toUpperCase() === code.trim().toUpperCase() && d.active
  );
  if (!c) return { ok: false, percent: 0, earlyAccess: false, message: "Codice non valido" };
  if (c.maxUses != null && (c.used ?? 0) >= c.maxUses) {
    return { ok: false, percent: 0, earlyAccess: false, message: "Codice esaurito" };
  }
  return {
    ok: true,
    percent: c.percent,
    earlyAccess: !!c.earlyAccess,
    message: c.earlyAccess
      ? "Early access sbloccato"
      : `Sconto ${c.percent}% applicato`,
  };
}

export function markDiscountUsed(code: string): void {
  const settings = loadSettings();
  const discountCodes = (settings.discountCodes || []).map((d) =>
    d.code.toUpperCase() === code.toUpperCase()
      ? { ...d, used: (d.used ?? 0) + 1 }
      : d
  );
  saveSettings({ ...settings, discountCodes });
}

// ——— WhatsApp staff notify ———
export function staffWhatsAppUrl(text: string): string {
  const settings = loadSettings();
  const num = (settings.store?.staffWhatsApp || "").replace(/\D/g, "");
  if (!num) return "";
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

export function openStaffWhatsApp(text: string): void {
  const url = staffWhatsAppUrl(text);
  if (url && typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
