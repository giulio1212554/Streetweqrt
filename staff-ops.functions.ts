import { createServerFn } from "@tanstack/react-start";
import {
  addOrderItem,
  createStaffUser,
  deleteMenuItem,
  deleteSolution,
  getMenuItems,
  getTables,
  listMessages,
  listOrders,
  listSolutions,
  listStaff,
  loginStaff,
  markTablePaid,
  sendMessage,
  setStaffActive,
  tableBill,
  updateOrderStatus,
  upsertMenuItem,
  upsertSolution,
  weekSalesStats,
  type MenuItemRow,
  type OrderStatus,
  type StaffRole,
} from "./local-db";

export const staffLogin = createServerFn({ method: "POST" })
  .inputValidator((input: { username: string; password: string }) => ({
    username: input.username.trim(),
    password: input.password,
  }))
  .handler(async ({ data }) => {
    const user = loginStaff(data.username, data.password);
    if (!user) throw new Error("Credenziali non valide");
    return { user };
  });

export const staffListUsers = createServerFn({ method: "POST" })
  .inputValidator((input: { role: string }) => input)
  .handler(async () => {
    return { staff: listStaff() };
  });

export const staffCreateUser = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      role: string;
      username: string;
      password: string;
      name: string;
      newRole: StaffRole;
    }) => input,
  )
  .handler(async ({ data }) => {
    if (data.role !== "dirigente") throw new Error("Solo il dirigente");
    if (data.username.trim().length < 3) throw new Error("Username troppo corto");
    if (data.password.length < 4) throw new Error("Password troppo corta");
    const user = createStaffUser({
      username: data.username,
      password: data.password,
      name: data.name || data.username,
      role: data.newRole,
    });
    return {
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        active: user.active,
      },
    };
  });

export const staffToggleUser = createServerFn({ method: "POST" })
  .inputValidator((input: { role: string; userId: string; active: boolean }) => input)
  .handler(async ({ data }) => {
    if (data.role !== "dirigente") throw new Error("Solo il dirigente");
    setStaffActive(data.userId, data.active);
    return { ok: true };
  });

export const opsGetMenu = createServerFn({ method: "GET" }).handler(async () => {
  return { menu: getMenuItems(), tables: getTables() };
});

export const opsSaveMenuItem = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      role: string;
      id?: string;
      section: string;
      name: string;
      price: number;
      desc?: string;
      available?: boolean;
    }) => input,
  )
  .handler(async ({ data }) => {
    if (data.role !== "dirigente") throw new Error("Solo il dirigente");
    const item = upsertMenuItem({
      id: data.id,
      section: data.section,
      name: data.name,
      price: data.price,
      desc: data.desc ?? "",
      available: data.available ?? true,
    });
    return { item };
  });

export const opsDeleteMenuItem = createServerFn({ method: "POST" })
  .inputValidator((input: { role: string; id: string }) => input)
  .handler(async ({ data }) => {
    if (data.role !== "dirigente") throw new Error("Solo il dirigente");
    deleteMenuItem(data.id);
    return { ok: true };
  });

export const opsAddOrder = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      role: string;
      userName: string;
      tableId: number;
      tableLabel: string;
      dishId: string;
      dishName: string;
      basePrice: number;
      qty: number;
      mods: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    if (!["cameriere", "dirigente"].includes(data.role)) {
      throw new Error("Solo cameriere o dirigente");
    }
    const order = addOrderItem({
      tableId: data.tableId,
      tableLabel: data.tableLabel,
      dishId: data.dishId,
      dishName: data.dishName,
      basePrice: data.basePrice,
      qty: Math.max(1, data.qty),
      mods: data.mods,
      createdBy: data.userName,
    });
    return { order };
  });

export const opsListOrders = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      role: string;
      tableId?: number;
      kitchen?: boolean;
      openOnly?: boolean;
    }) => input,
  )
  .handler(async ({ data }) => {
    if (data.kitchen) {
      return {
        orders: listOrders({
          status: ["pending", "preparing", "ready"],
        }),
      };
    }
    return {
      orders: listOrders({
        tableId: data.tableId,
        openOnly: data.openOnly ?? true,
      }),
    };
  });

export const opsSetOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { role: string; orderId: string; status: OrderStatus }) => input)
  .handler(async ({ data }) => {
    const allowed: Record<string, OrderStatus[]> = {
      cuoco: ["preparing", "ready"],
      cameriere: ["served", "cancelled"],
      cassiere: ["paid", "cancelled"],
      dirigente: ["pending", "preparing", "ready", "served", "paid", "cancelled"],
    };
    const ok = allowed[data.role] ?? [];
    if (!ok.includes(data.status)) throw new Error("Azione non consentita per il tuo ruolo");
    const order = updateOrderStatus(data.orderId, data.status);
    return { order };
  });

export const opsTableBill = createServerFn({ method: "POST" })
  .inputValidator((input: { role: string; tableId: number }) => input)
  .handler(async ({ data }) => {
    if (!["cassiere", "dirigente", "cameriere"].includes(data.role)) {
      throw new Error("Non autorizzato");
    }
    return tableBill(data.tableId);
  });

export const opsPayTable = createServerFn({ method: "POST" })
  .inputValidator((input: { role: string; tableId: number }) => input)
  .handler(async ({ data }) => {
    if (!["cassiere", "dirigente"].includes(data.role)) {
      throw new Error("Solo cassiere o dirigente");
    }
    const n = markTablePaid(data.tableId);
    return { paid: n };
  });

export const opsStats = createServerFn({ method: "POST" })
  .inputValidator((input: { role: string }) => input)
  .handler(async ({ data }) => {
    if (data.role !== "dirigente") throw new Error("Solo il dirigente");
    return weekSalesStats(7);
  });

export const opsListMessages = createServerFn({ method: "POST" })
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data }) => {
    return { messages: listMessages(data.userId) };
  });

export const opsSendMessage = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { fromId: string; fromName: string; toId: string; text: string }) => {
      if (!input.text.trim()) throw new Error("Messaggio vuoto");
      return input;
    },
  )
  .handler(async ({ data }) => {
    const msg = sendMessage(data);
    return { message: msg };
  });

export const opsListSolutions = createServerFn({ method: "GET" })
  .inputValidator((input: { activeOnly?: boolean } | undefined) => ({
    activeOnly: input?.activeOnly !== false,
  }))
  .handler(async ({ data }) => {
    return { solutions: listSolutions(Boolean(data?.activeOnly)) };
  });

export const opsSaveSolution = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      role: string;
      id?: string;
      title: string;
      description: string;
      price: string;
      active?: boolean;
    }) => input,
  )
  .handler(async ({ data }) => {
    if (data.role !== "dirigente") throw new Error("Solo il dirigente");
    if (!data.title.trim()) throw new Error("Titolo obbligatorio");
    const solution = upsertSolution({
      id: data.id,
      title: data.title,
      description: data.description,
      price: data.price,
      active: data.active,
    });
    return { solution };
  });

export const opsDeleteSolution = createServerFn({ method: "POST" })
  .inputValidator((input: { role: string; id: string }) => input)
  .handler(async ({ data }) => {
    if (data.role !== "dirigente") throw new Error("Solo il dirigente");
    deleteSolution(data.id);
    return { ok: true };
  });

export type { MenuItemRow };
