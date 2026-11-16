import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function auth() {
  return import("@/lib/admin-auth.server");
}

async function db() {
  return import("@/lib/plab-db.server");
}

async function requireAdmin() {
  const { getWebRequest } = await import("@tanstack/react-start/server");
  const { getSessionIdFromRequest, isValidSession } = await auth();
  const request = getWebRequest();
  const sid = getSessionIdFromRequest(request);
  if (!isValidSession(sid)) {
    throw new Error("Unauthorized");
  }
}

export const adminCheckSession = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const { getWebRequest } = await import("@tanstack/react-start/server");
      const { getSessionIdFromRequest, isValidSession } = await auth();
      const request = getWebRequest();
      const sid = getSessionIdFromRequest(request);
      return { authenticated: isValidSession(sid) };
    } catch {
      return { authenticated: false };
    }
  },
);

export const adminListOrders = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAdmin();
    const { listOrders, sweepExpiredOrders } = await db();
    await sweepExpiredOrders();
    return { orders: listOrders() };
  },
);

export const adminMarkOrderPaid = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ orderId: z.string().min(3).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const { adminMarkBankPaid } = await db();
    const order = await adminMarkBankPaid(data.orderId);
    return { order };
  });

export const adminExpireOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ orderId: z.string().min(3).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const { expireOrCancelOrder } = await db();
    const order = await expireOrCancelOrder(data.orderId, "cancelled");
    return { order };
  });

const productSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  price: z.number().nonnegative(),
  discountPrice: z.number().nonnegative().optional(),
  category: z.enum(["hoodies", "tees", "cargo", "accessories"]),
  sizes: z.array(
    z.object({ size: z.string(), stock: z.number().int().nonnegative() }),
  ),
  description: z.string(),
  materials: z.string().optional(),
  status: z.enum(["draft", "teaser", "live", "soldout"]),
  images: z.array(z.string()),
  dropDate: z.string().optional(),
  limited: z.boolean().optional(),
});

export const adminSaveProducts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ products: z.array(productSchema) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const { saveServerProducts } = await db();
    await saveServerProducts(data.products as never);
    return { ok: true as const };
  });

export const adminSaveSettings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ settings: z.any() }).parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { saveServerSettings } = await db();
    await saveServerSettings(data.settings);
    return { ok: true as const };
  });

export const adminGetCatalog = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAdmin();
    const {
      getServerProducts,
      getServerSettings,
      listOrders,
      listStoreHolds,
      expireStoreHolds,
      sweepExpiredOrders,
    } = await db();
    await expireStoreHolds();
    await sweepExpiredOrders();
    return {
      products: getServerProducts(),
      settings: getServerSettings(),
      orders: listOrders(),
      holds: listStoreHolds(),
    };
  },
);

export const adminUpdateHold = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string(),
        status: z.enum(["pending", "ready", "picked_up", "cancelled", "expired"]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const { updateStoreHoldStatus, listStoreHolds } = await db();
    await updateStoreHoldStatus(data.id, data.status);
    return { holds: listStoreHolds() };
  });

/** Public catalog — no auth. Used by shop/home/PDP so stock matches checkout. */
export const publicGetCatalog = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getServerProducts, getServerSettings, expireStoreHolds, sweepExpiredOrders } =
      await db();
    try {
      await expireStoreHolds();
      await sweepExpiredOrders();
    } catch {
      /* ignore */
    }
    return {
      products: getServerProducts(),
      settings: getServerSettings(),
    };
  },
);


export const adminPosSale = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        productId: z.string().min(1),
        size: z.string().min(1),
        qty: z.number().int().positive().max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const { posDecrementStock, getServerProducts } = await db();
    const result = await posDecrementStock(
      data.productId,
      data.size,
      data.qty ?? 1,
    );
    if (!result.ok) throw new Error(result.message);
    return {
      ...result,
      products: getServerProducts(),
    };
  });
