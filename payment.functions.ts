import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type CheckoutItemInput = {
  productId: string;
  size: string;
  qty: number;
};

export type CreateSessionInput = {
  items: CheckoutItemInput[];
  customer: {
    name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    zip: string;
    country: string;
  };
  discountCode?: string;
  referralCode?: string;
  successUrl: string;
  cancelUrl: string;
};

async function getStripe() {
  // Dynamic import so node:fs never lands in the client bundle
  const { envGet, loadLocalEnv } = await import("@/lib/load-env.server");
  loadLocalEnv();
  const key = envGet("STRIPE_SECRET_KEY");
  if (!key || !key.startsWith("sk_")) {
    throw new Error(
      "STRIPE_SECRET_KEY missing. Set it in server .env only (never VITE_STRIPE_SECRET_KEY).",
    );
  }
  const { default: Stripe } = await import("stripe");
  return new Stripe(key, { apiVersion: "2024-11-20.acacia" });
}

async function db() {
  return import("@/lib/plab-db.server");
}

/**
 * Client must NOT send prices/shipping/discount amounts.
 * Server quotes from catalog, reserves stock (30 min), creates pending order,
 * then opens Stripe Checkout with server-calculated amounts + coupon for discount.
 *
 * Discount rules: promo and referral never stack (promo wins); owner cannot use own referral;
 * maxUses incremented only when order becomes paid.
 */
export const createStripeCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((input: CreateSessionInput) => {
    if (!input.items?.length) throw new Error("Cart is empty");
    if (!input.customer?.email?.includes("@")) throw new Error("Valid email required");
    if (!input.successUrl || !input.cancelUrl) throw new Error("Missing redirect URLs");
    return input;
  })
  .handler(async ({ data }) => {
    const {
      sweepExpiredOrders,
      createPendingOrder,
      setOrderStripeSession,
      expireOrCancelOrder,
    } = await db();

    await sweepExpiredOrders();

    const order = await createPendingOrder({
      items: data.items.map((i) => ({
        productId: i.productId,
        size: i.size,
        qty: Math.trunc(i.qty),
      })),
      customer: data.customer,
      discountCode: data.discountCode,
      referralCode: data.referralCode,
      paymentMethod: "stripe",
      holdMinutes: 30,
    });

    const stripe = await getStripe();

    const line_items = order.items.map((item) => ({
      quantity: item.qty,
      price_data: {
        currency: "eur" as const,
        unit_amount: Math.round(item.unitPrice * 100),
        product_data: {
          name: `${item.title} · ${item.size}`,
        },
      },
    }));

    if (order.shipping > 0) {
      line_items.push({
        quantity: 1,
        price_data: {
          currency: "eur" as const,
          unit_amount: Math.round(order.shipping * 100),
          product_data: { name: "Shipping" },
        },
      });
    }

    const discounts: { coupon: string }[] = [];
    if (order.discountAmount > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: Math.round(order.discountAmount * 100),
        currency: "eur",
        duration: "once",
        name: (order.discountCode ?? `OFF${order.appliedPercent}`).slice(0, 40),
      });
      discounts.push({ coupon: coupon.id });
    }

    const sessionParams = {
      mode: "payment" as const,
      customer_email: data.customer.email,
      line_items,
      ...(discounts.length ? { discounts } : {}),
      success_url: `${data.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: data.cancelUrl,
      metadata: { orderId: order.id },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      locale: "auto" as const,
    };

    let session;
    try {
      session = await stripe.checkout.sessions.create({
        ...sessionParams,
        payment_method_types: ["card", "paypal"],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (/paypal/i.test(message)) {
        session = await stripe.checkout.sessions.create({
          ...sessionParams,
          payment_method_types: ["card"],
        });
      } else {
        await expireOrCancelOrder(order.id, "cancelled");
        throw err;
      }
    }

    if (!session.url) {
      await expireOrCancelOrder(order.id, "cancelled");
      throw new Error("Stripe did not return a checkout URL");
    }

    await setOrderStripeSession(order.id, session.id);

    return {
      sessionId: session.id,
      url: session.url as string,
      orderId: order.id,
      total: order.total,
    };
  });

export const createBankTransferOrder = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      items: CheckoutItemInput[];
      customer: CreateSessionInput["customer"];
      discountCode?: string;
      referralCode?: string;
    }) => {
      if (!input.items?.length) throw new Error("Cart is empty");
      if (!input.customer?.email?.includes("@")) throw new Error("Valid email required");
      return input;
    },
  )
  .handler(async ({ data }) => {
    const {
      sweepExpiredOrders,
      createPendingOrder,
      notifyStaff,
      markStaffNotified,
    } = await db();
    await sweepExpiredOrders();
    const order = await createPendingOrder({
      items: data.items,
      customer: data.customer,
      discountCode: data.discountCode,
      referralCode: data.referralCode,
      paymentMethod: "bank",
      holdMinutes: 48 * 60,
    });
    await notifyStaff(
      `BANK ORDER ${order.id} pending €${order.total.toFixed(2)} — ${order.customer.name} ${order.customer.email}`,
    );
    await markStaffNotified(order.id);
    return {
      orderId: order.id,
      total: order.total,
      expiresAt: order.expiresAt,
      status: order.status,
      receiptToken: order.receiptToken,
    };
  });


/** Test mode: reserve stock, create order, mark paid immediately — no Stripe */
export const createTestPaymentOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        items: z.array(
          z.object({
            productId: z.string(),
            size: z.string(),
            qty: z.number().int().positive(),
          }),
        ),
        customer: z.object({
          name: z.string().min(1),
          email: z.string().email(),
          phone: z.string().min(1),
          address: z.string().min(1),
          city: z.string().min(1),
          zip: z.string().min(1),
          country: z.string().min(1),
        }),
        discountCode: z.string().optional(),
        referralCode: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getServerSettings, createPendingOrder, markOrderPaid, sweepExpiredOrders } =
      await db();
    await sweepExpiredOrders();
    const settings = getServerSettings();
    if (!settings.payment?.testMode) {
      throw new Error("Test payment is disabled. Enable it in Admin → Impostazioni.");
    }
    const pending = await createPendingOrder({
      items: data.items,
      customer: data.customer,
      discountCode: data.discountCode,
      referralCode: data.referralCode,
      paymentMethod: "bank",
      holdMinutes: 60,
    });
    const paid = await markOrderPaid(pending.id);
    if (!paid) throw new Error("Test payment failed");
    return {
      orderId: paid.id,
      receiptToken: paid.receiptToken,
      total: paid.total,
      test: true as const,
    };
  });

export const getOrderBySession = createServerFn({ method: "GET" })
  .inputValidator((input: { sessionId: string }) => {
    if (!input.sessionId?.trim()) throw new Error("Missing session id");
    return { sessionId: input.sessionId.trim() };
  })
  .handler(async ({ data }) => {
    const {
      sweepExpiredOrders,
      getOrderByStripeSession,
      getOrderById,
      markOrderPaid,
    } = await db();
    await sweepExpiredOrders();
    let order = getOrderByStripeSession(data.sessionId);
    if (!order) {
      try {
        const stripe = await getStripe();
        const session = await stripe.checkout.sessions.retrieve(data.sessionId);
        const orderId = session.metadata?.orderId;
        if (orderId && session.payment_status === "paid") {
          await markOrderPaid(orderId);
          order = getOrderById(orderId);
        } else if (orderId) {
          order = getOrderById(orderId);
        }
      } catch {
        /* ignore */
      }
    }
    if (!order) return { found: false as const };
    return {
      found: true as const,
      order: {
        id: order.id,
        status: order.status,
        total: order.total,
        customerEmail: order.customer.email,
        items: order.items,
        paymentMethod: order.paymentMethod,
        receiptToken: order.receiptToken,
      },
    };
  });

export const getOrderStatus = createServerFn({ method: "GET" })
  .inputValidator((input: { orderId: string }) => {
    if (!input.orderId?.trim()) throw new Error("Missing order id");
    return { orderId: input.orderId.trim() };
  })
  .handler(async ({ data }) => {
    const { sweepExpiredOrders, getOrderById } = await db();
    await sweepExpiredOrders();
    const order = getOrderById(data.orderId);
    if (!order) return { found: false as const };
    return {
      found: true as const,
      order: {
        id: order.id,
        status: order.status,
        total: order.total,
        expiresAt: order.expiresAt,
        paymentMethod: order.paymentMethod,
        items: order.items,
      },
    };
  });

export const quoteCheckout = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      items: CheckoutItemInput[];
      discountCode?: string;
      referralCode?: string;
      customerEmail?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { rateLimit } = await import("@/lib/admin-auth.server");
    let ip = "unknown";
    try {
      const { getWebRequest } = await import("@tanstack/react-start/server");
      const { clientIp } = await import("@/lib/admin-auth.server");
      ip = clientIp(getWebRequest());
    } catch { /* ignore */ }
    const key = `quote:${ip}`;
    const rl = rateLimit(key, 30, 60_000);
    if (!rl.ok) throw new Error("Too many quote requests. Slow down.");
    const { sweepExpiredOrders, quoteOrder } = await db();
    await sweepExpiredOrders();
    return quoteOrder({
      items: data.items,
      discountCode: data.discountCode,
      referralCode: data.referralCode,
      customerEmail: data.customerEmail,
    });
  });

export const checkStock = createServerFn({ method: "GET" })
  .inputValidator((input: { productId: string; size: string }) => input)
  .handler(async ({ data }) => {
    const { getAvailableStock } = await db();
    return { stock: getAvailableStock(data.productId, data.size) };
  });



const receiptSchema = z.object({
  orderId: z.string().min(3).max(64),
  /** Required secret from order confirmation email / success page */
  token: z.string().min(16).max(128),
});

export const getReceiptOrder = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => receiptSchema.parse(input))
  .handler(async ({ data }) => {
    const { rateLimit, clientIp } = await import("@/lib/admin-auth.server");
    try {
      const { getWebRequest } = await import("@tanstack/react-start/server");
      const rl = rateLimit(`receipt:${clientIp(getWebRequest())}`, 20, 60_000);
      if (!rl.ok) throw new Error("Too many requests");
    } catch (e) {
      if (e instanceof Error && e.message === "Too many requests") throw e;
    }
    const { getOrderForReceipt } = await db();
    const order = getOrderForReceipt(data.orderId, data.token, undefined);
    if (!order) return { found: false as const };
    return {
      found: true as const,
      order: {
        id: order.id,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
        items: order.items,
        customer: {
          name: order.customer.name,
          email: order.customer.email,
        },
        receiptToken: order.receiptToken,
      },
    };
  });

const returnsSchema = z.object({
  orderId: z.string().min(3).max(64),
  email: z.string().email(),
  reason: z.string().min(5).max(2000),
  items: z.string().min(1).max(2000),
});

export const createReturnRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => returnsSchema.parse(input))
  .handler(async ({ data }) => {
    const { rateLimit } = await import("@/lib/admin-auth.server");
    const rl = rateLimit(`returns:${data.email.toLowerCase()}`, 5, 60 * 60_000);
    if (!rl.ok) throw new Error(`Too many return requests. Retry in ${rl.retryAfterSec}s`);

    const { getPaidOrderByIdAndEmail, notifyStaff } = await db();
    const order = getPaidOrderByIdAndEmail(data.orderId, data.email);
    if (!order) {
      throw new Error("No paid order found for this ID and email");
    }

    // Store RMA in server db file under rmas key
    const { existsSync, mkdirSync, readFileSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const path = join(process.cwd(), "data", "plab-rmas.json");
    const dir = join(process.cwd(), "data");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    let list: unknown[] = [];
    if (existsSync(path)) {
      try {
        list = JSON.parse(readFileSync(path, "utf8")) as unknown[];
      } catch {
        list = [];
      }
    }
    const id = `RMA-${Date.now().toString(36).toUpperCase()}`;
    const row = {
      id,
      orderId: data.orderId,
      email: data.email,
      reason: data.reason,
      items: data.items,
      createdAt: new Date().toISOString(),
      status: "requested",
    };
    list.unshift(row);
    writeFileSync(path, JSON.stringify(list, null, 2), "utf8");
    await notifyStaff(`RMA ${id} for order ${data.orderId} — ${data.email}`);
    return { id };
  });


const storeHoldSchema = z.object({
  productId: z.string().min(1),
  size: z.string().min(1),
  customerName: z.string().min(2).max(120),
  phone: z.string().min(6).max(40),
  email: z.string().email().or(z.literal("")).optional(),
  note: z.string().max(500).optional(),
});

/** In-store hold: reserves 1 unit server-side for 48h */
export const createStoreReservation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => storeHoldSchema.parse(input))
  .handler(async ({ data }) => {
    const { rateLimit, clientIp } = await import("@/lib/admin-auth.server");
    let ip = "unknown";
    try {
      const { getWebRequest } = await import("@tanstack/react-start/server");
      ip = clientIp(getWebRequest());
    } catch {
      /* ignore */
    }
    // Max 5 holds per IP per hour — prevents stock drain
    const rl = rateLimit(`store-hold:${ip}`, 5, 60 * 60_000);
    if (!rl.ok) {
      throw new Error(
        `Too many reservations. Retry in ${rl.retryAfterSec ?? 3600}s`,
      );
    }
    const phoneKey = data.phone.replace(/\D/g, "").slice(-10);
    const rlPhone = rateLimit(`store-hold-phone:${phoneKey}`, 3, 60 * 60_000);
    if (!rlPhone.ok) {
      throw new Error("Too many reservations for this phone number");
    }

    const { createStoreHold, notifyStaff } = await db();
    const hold = await createStoreHold({
      productId: data.productId,
      size: data.size,
      customerName: data.customerName,
      phone: data.phone,
      email: data.email || "hold@local",
      note: data.note,
      holdHours: 48,
    });
    await notifyStaff(
      `STORE HOLD ${hold.id} — ${hold.productTitle} · ${hold.size} — ${hold.customerName} ${hold.phone}`,
    );
    return hold;
  });

export const listAdminStoreHolds = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getWebRequest } = await import("@tanstack/react-start/server");
    const {
      getSessionIdFromRequest,
      isValidSession,
    } = await import("@/lib/admin-auth.server");
    const req = getWebRequest();
    const sid = getSessionIdFromRequest(req);
    if (!isValidSession(sid)) {
      throw new Error("Unauthorized");
    }
    const { listStoreHolds } = await db();
    return { holds: listStoreHolds() };
  },
);
