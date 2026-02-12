import { Order, OrderQuantities, TipoPedido } from "./types";
import { PRICING_RULES } from "./constants";
import { functions } from "./firebase";
import { httpsCallable } from "firebase/functions";

const isDateBlocked = ( iso: string, ranges: Array<{ start: string; end: string }>) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return ranges.some(r => iso >= r.start && iso <= r.end);
};

export const calculateOrderPrice = (
  tipoPedido: TipoPedido,
  puntoVenta: string | undefined,
  quantities: OrderQuantities
): { total: number; price: number } => {
  const total = Object.values(quantities).reduce((sum, q) => sum + q, 0);

  if (puntoVenta === "Karen Donas") {
    return { total, price: total * PRICING_RULES.karenDonas };
  }

  if (tipoPedido === "Punto de venta") {
    return { total, price: total * PRICING_RULES.puntoVentaGeneral };
  }

  const tiers = PRICING_RULES.personalTiers as Record<string | number, number>;
  const price = tiers[total] || total * (tiers.default || 25);

  return { total, price };
};

export const validateOrderDate = (
  date: string,
  isAdmin: boolean = false,
  blocked?: { enabled: boolean; message: string; ranges: Array<{ start: string; end: string }> }
): { valid: boolean; message?: string } => {
  if (!date) return { valid: false, message: "Selecciona una fecha." };

  // Parse YYYY-MM-DD safely (local date)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return { valid: false, message: "Fecha inválida." };

  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  const day = Number(m[3]);

  const selectedDay = new Date(year, month - 1, day); // local midnight
  if (Number.isNaN(selectedDay.getTime())) return { valid: false, message: "Fecha inválida." };

  // Disallow Sundays
  if (selectedDay.getDay() === 0) {
    return { valid: false, message: "No recibimos pedidos en domingo." };
  }

  // Compare against TODAY as local date (midnight)
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (blocked?.enabled && isDateBlocked(date, blocked.ranges)) {
    return { valid: false, message: blocked.message || "No estamos recibiendo pedidos en esa fecha." };
  }

  // "Next-day until the last minute" means:
  // - Today is NOT allowed (unless admin)
  // - Tomorrow and later ARE allowed, regardless of current time
  if (!isAdmin && selectedDay <= today) {
    return {
      valid: false,
      message: "El pedido debe ser solicitado con al menos un día de anticipación.",
    };
  }

  return { valid: true };
};

type SubmitOrderRequest = Order & { allowPastDates?: boolean; allowSunday?: boolean };
type SubmitOrderResponse = { id: string; price: number; total: number };
type AdminOverrides = { allowPastDates?: boolean; allowSunday?: boolean };

export const createOrder = async (order: Order, overrides?: AdminOverrides) => {
  const submitOrder = httpsCallable<any, SubmitOrderResponse>(functions, "submitOrder");
  const res = await submitOrder({
    ...order,
    adminOverrides: overrides ?? undefined,
  });
  return res.data;
};

export const getOrders = async (
  mode: "Hoy" | "Mañana" | "Todos" = "Hoy",
  opts?: { month?: string; puntoVenta?: string;}
) => {
  const fn = httpsCallable(functions, "adminGetOrders");
  const res = await fn({
    mode,
    month: opts?.month,
    puntoVenta: opts?.puntoVenta,
  });
  const data = res.data as any;
  return (data.orders ?? []) as Order[];
};

export const updateOrderStatus = async (id: string, updates: any) => {
  // For now only toggling paid. We'll ignore `updates` and use callable.
  const fn = httpsCallable(functions, "adminTogglePaid");
  const res = await fn({ id });
  return res.data as any;
};

export const updateSeasonalLabel = async (seasonalLabel: string) => {
  const fn = httpsCallable(functions, "adminUpdateSeasonalLabel");
  const res = await fn({ seasonalLabel });
  return res.data as { ok: boolean; seasonalLabel: string };
};

export type PublicConfig = {
  seasonalLabel: string;
  seasonalSlug?: string;
  blocked: {
    enabled: boolean;
    message: string;
    ranges: Array<{ start: string; end: string }>;
  };
};

export const getPublicConfig = async () => {
  const fn = httpsCallable(functions, "getPublicConfig");
  const res = await fn();
  return res.data as PublicConfig;
};

export const updateBlockedDates = async (payload: PublicConfig["blocked"]) => {
  const fn = httpsCallable(functions, "adminUpdateBlockedDates");
  const res = await fn(payload);
  return res.data as any;
};

export const updateAdminConfig = async (payload: Partial<PublicConfig>) => {
  const fn = httpsCallable(functions, "adminUpdateConfig");
  const res = await fn(payload);
  return res.data as { ok: boolean; config: Partial<PublicConfig> };
};

export const deleteOrder = async (id: string) => {
  const fn = httpsCallable(functions, "adminDeleteOrder");
  const res = await fn({ id });
  return res.data as { ok: boolean; id: string };
};

export const adminUpdateOrderQuantities = async (id: string, quantities: any) => {
  const fn = httpsCallable(functions, "adminUpdateOrderQuantities");
  const res = await fn({ id, quantities });
  return res.data as { ok: boolean; id: string; totalDonas: number; precioTotal: number; quantities: any };
};

export const adminMe = async () => {
  const fn = httpsCallable(functions, "adminMe");
  const res = await fn();
  return res.data as { isAdmin: boolean; email: string };
};




