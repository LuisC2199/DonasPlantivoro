import * as admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

admin.initializeApp();
const db = getFirestore();

type TipoPedido = "Personal" | "Punto de venta";

type OrderQuantities = {
  azucar: number;
  cafe: number;
  seasonal: number;
  cheesecake: number;
  chocolate: number;
  oreo: number;
  zanahoria: number;
};

type OrderInput = {
  tipoPedido: TipoPedido;
  nombre: string;
  email: string;
  telefono?: string;

  puntoRecoleccion?: "Tipi'Oka Lomas" | "Vegandra";
  puntoVenta?: string;

  fechaEntrega: string; // "YYYY-MM-DD"
  quantities: OrderQuantities;

  userAgent?: string;
  adminOverrides?: AdminOverrides;
};

type AdminOverrides = {
  allowPastDates?: boolean;
  allowSunday?: boolean;
};

type BlockRange = { start: string; end: string };

const isISODate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

const normalizeRange = (r: BlockRange): BlockRange => {
  const start = String(r.start || "").trim();
  const end = String(r.end || "").trim();
  if (!isISODate(start) || !isISODate(end)) {
    throw new HttpsError("invalid-argument", "Rango inválido. Usa formato YYYY-MM-DD.");
  }
  if (start > end) {
    throw new HttpsError("invalid-argument", "El inicio no puede ser después del fin.");
  }
  return { start, end };
};

const getAdminAllowlist = (): string[] => {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
};

const assertAdmin = (request: any) => {
  const email = (request.auth?.token?.email || "").toLowerCase();
  if (!email) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const allowlist = getAdminAllowlist();
  if (!allowlist.includes(email)) throw new HttpsError("permission-denied", "No autorizado.");
  return email;
};

const calculatePriceServer = (tipoPedido: TipoPedido, puntoVenta: string | undefined, total: number) => {
  if (puntoVenta === "Karen Donas") return total * 15;
  if (tipoPedido === "Punto de venta") return total * 20;

  const tiers: Record<number, number> = { 6: 160, 7: 190, 8: 220, 9: 250, 10: 280, 11: 310 };
  return tiers[total] ?? total * 25;
};

const assertString = (v: unknown, field: string) => {
  if (typeof v !== "string" || !v.trim()) throw new HttpsError("invalid-argument", `Campo inválido: ${field}`);
  return v.trim();
};

const assertNumber = (v: unknown, field: string) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
    throw new HttpsError("invalid-argument", `Cantidad inválida: ${field}`);
  return v;
};

export const submitOrder = onCall(async (request) => {
  // ✅ v2: data lives on request.data
  const data = request.data as OrderInput;

  const tipoPedido = assertString(data?.tipoPedido, "tipoPedido") as TipoPedido;
  const nombre = assertString(data?.nombre, "nombre");
  const email = assertString(data?.email, "email");
  const fechaEntrega = assertString(data?.fechaEntrega, "fechaEntrega");

  const q = data?.quantities;
  if (!q || typeof q !== "object") throw new HttpsError("invalid-argument", "quantities inválido");

  const quantities: OrderQuantities = {
    azucar: assertNumber((q as any).azucar, "azucar"),
    cafe: assertNumber((q as any).cafe, "cafe"),
    seasonal: assertNumber((q as any).seasonal, "seasonal"),
    cheesecake: assertNumber((q as any).cheesecake, "cheesecake"),
    chocolate: assertNumber((q as any).chocolate, "chocolate"),
    oreo: assertNumber((q as any).oreo, "oreo"),
    zanahoria: assertNumber((q as any).zanahoria, "zanahoria"),
  };

  const totalDonas = Object.values(quantities).reduce((a, b) => a + b, 0);
  if (totalDonas < 6) throw new HttpsError("invalid-argument", "El pedido mínimo es de 6 donas.");

  // Enforce “no singles” + “min 2 if chosen”
  for (const [flavor, qty] of Object.entries(quantities)) {
    if (qty === 1) throw new HttpsError("invalid-argument", `No se permiten donas individuales (${flavor}).`);
    if (qty > 0 && qty < 2) throw new HttpsError("invalid-argument", `Mínimo 2 donas por sabor si eliges (${flavor}).`);
  }

  // Date validation
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaEntrega);
  if (!match) throw new HttpsError("invalid-argument", "fechaEntrega debe ser YYYY-MM-DD");

  const [_, y, m, d] = match;
  const selected = new Date(Number(y), Number(m) - 1, Number(d)); // local midnight

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // ✅ admin override (only if caller is admin)
  let isAdmin = false;
  try {
    assertAdmin(request);
    isAdmin = true;
  } catch {
    isAdmin = false;
  }
  logger.info("submitOrder flags", { isAdmin, overrides: data?.adminOverrides });
  const allowSunday = Boolean(data?.adminOverrides?.allowSunday) && isAdmin;
  const allowPastDates = Boolean(data?.adminOverrides?.allowPastDates) && isAdmin;

  if (!allowSunday && selected.getDay() === 0) {
    throw new HttpsError("invalid-argument", "No recibimos pedidos en domingo.");
  }

  if (!allowPastDates && selected <= today) {
    throw new HttpsError("invalid-argument", "El pedido debe ser solicitado con al menos un día de anticipación.");
  }

  // ✅ Blocked date ranges (from config/app)
  const cfgSnap = await db.collection("config").doc("app").get();
  const cfg = cfgSnap.data() || {};
  const blocked = cfg.blocked || { enabled: false, message: "", ranges: [] };

  if (blocked.enabled && Array.isArray(blocked.ranges)) {
    const iso = fechaEntrega; // "YYYY-MM-DD"
    const isBlocked = blocked.ranges.some((r: any) => {
      const start = String(r?.start || "");
      const end = String(r?.end || "");
      return /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)
        ? iso >= start && iso <= end
        : false;
    });

    if (isBlocked) {
      const msg = String(blocked.message || "⚠️ No estamos recibiendo pedidos en esas fechas.");
      throw new HttpsError("failed-precondition", msg);
    }
  }

  // Conditional fields
  if (tipoPedido === "Personal") {
    assertString(data?.telefono, "telefono");
    const pr = assertString(data?.puntoRecoleccion, "puntoRecoleccion");
    if (pr !== "Tipi'Oka Lomas" && pr !== "Vegandra") throw new HttpsError("invalid-argument", "puntoRecoleccion inválido");
  } else {
    assertString(data?.puntoVenta, "puntoVenta");
  }

  const precioTotal = calculatePriceServer(tipoPedido, data?.puntoVenta, totalDonas);

  const doc = {
    tipoPedido,
    nombre,
    email,
    telefono: data?.telefono ?? null,
    puntoRecoleccion: data?.puntoRecoleccion ?? null,
    puntoVenta: data?.puntoVenta ?? null,
    fechaEntrega,
    quantities,
    totalDonas,
    precioTotal,
    statusPagado: "No pagado",
    statusOrder: "Recibido",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdByIp: null,
    userAgent: data?.userAgent ?? null,
  };

  const orderRef = await db.collection("orders").add(doc);
  logger.info("Order created", { orderId: orderRef.id, email });

    // ✅ Build a human-friendly summary
  const niceFlavorLabel: Record<string, string> = {
    azucar: "Azúcar Canela",
    cafe: "Café Cold Brew",
    seasonal: "Sabor de temporada",
    cheesecake: "Cheesecake",
    chocolate: "Chocolate",
    oreo: "Oreo",
    zanahoria: "Zanahoria",
  };

  const seasonalLabel = String(cfg?.seasonalLabel || "Sabor de temporada");

  const items = Object.entries(quantities)
    .filter(([, qty]) => qty > 0)
    .map(([key, qty]) => ({
      label: key === "seasonal" ? seasonalLabel : (niceFlavorLabel[key] ?? key),
      qty,
    }));
  
    await db.collection("mail").add({
      to: email,
      template: "orderConfirmation",
      data: {
        year: new Date().getFullYear(),
        order: {
          nombre,
          fechaEntrega,
          tipoPedido,
          puntoRecoleccion: data?.puntoRecoleccion ?? null,
          puntoVenta: data?.puntoVenta ?? null,
          precioTotal,
        },
        items,
      },
    });

  return { id: orderRef.id, price: precioTotal, total: totalDonas };
});

export const adminGetOrders = onCall(async (request) => {
  try {
    assertAdmin(request);

    const data = (request.data ?? {}) as {
      mode?: "Hoy" | "Mañana" | "Todos";
      month?: string;
      puntoVenta?: string;
    };

    const mode = data.mode ?? "Hoy";
    const puntoVenta = (data.puntoVenta ?? "ALL").trim();

    let query: FirebaseFirestore.Query = db.collection("orders");

    if (puntoVenta && puntoVenta !== "ALL") {
      query = query.where("puntoVenta", "==", puntoVenta);
    }

    const now = new Date();
    const todayStr = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    if (mode === "Hoy") {
      query = query.where("fechaEntrega", "==", todayStr);
    } else if (mode === "Mañana") {
      query = query.where("fechaEntrega", "==", tomorrowStr);
    } else {
      if (data.month && /^\d{4}-\d{2}$/.test(data.month)) {
        const [yy, mm] = data.month.split("-").map(Number);
        const start = `${data.month}-01`;
        const next = new Date(yy, mm, 1);
        const nextMonthStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;

        query = query
          .where("fechaEntrega", ">=", start)
          .where("fechaEntrega", "<", nextMonthStr)
          .orderBy("fechaEntrega", "desc");
      } else {
        query = query.orderBy("fechaEntrega", "desc");
      }
    }

    const snap = await query.get();
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return { orders };
  } catch (err: any) {
    logger.error("adminGetOrders failed", { message: err?.message, code: err?.code, stack: err?.stack });
    throw new HttpsError("internal", err?.message || "Error cargando pedidos");
  }
});

export const adminTogglePaid = onCall(async (request) => {
  assertAdmin(request);

  const data = request.data as { id: string };
  if (!data?.id) throw new HttpsError("invalid-argument", "Falta id");

  const ref = db.collection("orders").doc(data.id);
  const docSnap = await ref.get();
  if (!docSnap.exists) throw new HttpsError("not-found", "Pedido no encontrado");

  const current = (docSnap.data()?.statusPagado ?? "No pagado") as "Pagado" | "No pagado";
  const next = current === "Pagado" ? "No pagado" : "Pagado";

  await ref.update({
    statusPagado: next,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: data.id, statusPagado: next };
});

export const adminUpdateSeasonalLabel = onCall(async (request) => {
  assertAdmin(request);

  logger.info("adminUpdateSeasonalLabel payload", { data: request.data});

  const seasonalLabel = String(request.data?.seasonalLabel || "").trim();
  if (!seasonalLabel) throw new HttpsError("invalid-argument", "Etiqueta inválida.");

  await db.collection("config").doc("app").set(
    {
      seasonalLabel,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  logger.info("Seasonal label updated", { seasonalLabel });
  return { ok: true, seasonalLabel };
});

export const getPublicConfig = onCall(async () => {
  const snap = await db.collection("config").doc("app").get();

  const defaults = {
    seasonalLabel: "Seasonal",
    blocked: { enabled: false, message: "", ranges: [] as any[] },
  };

  return snap.exists ? { ...defaults, ...snap.data() } : defaults;
});

export const adminUpdateBlockedDates = onCall(async (request) => {
  assertAdmin(request);

  const enabled = Boolean(request.data?.enabled);
  const message = String(request.data?.message || "").trim();

  const rangesRaw = request.data?.ranges;
  const ranges: BlockRange[] = Array.isArray(rangesRaw)
    ? rangesRaw.map((r: any) => normalizeRange({ start: r?.start, end: r?.end }))
    : [];

  const safeMessage =
    message || "⚠️ Por el momento no estamos recibiendo pedidos en estas fechas. Gracias por tu paciencia.";

  await db.collection("config").doc("app").set(
    {
      blocked: {
        enabled,
        message: safeMessage,
        ranges,
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true, blocked: { enabled, message: safeMessage, ranges } };
});

export const adminUpdateConfig = onCall(async (request) => {
  assertAdmin(request);

  const data = (request.data ?? {}) as {
    seasonalLabel?: string;
    blocked?: {
      enabled?: boolean;
      message?: string;
      ranges?: Array<{ start: string; end: string }>;
    };
  };

  const updates: any = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  // seasonalLabel
  if (typeof data.seasonalLabel === "string") {
    const seasonalLabel = data.seasonalLabel.trim();
    if (!seasonalLabel) throw new HttpsError("invalid-argument", "Etiqueta inválida.");
    updates.seasonalLabel = seasonalLabel;
  }

  // blocked
  if (data.blocked && typeof data.blocked === "object") {
    const enabled = Boolean(data.blocked.enabled);

    const message =
      typeof data.blocked.message === "string"
        ? data.blocked.message.trim()
        : "";

    const ranges = Array.isArray(data.blocked.ranges) ? data.blocked.ranges : [];

    // Validate ranges if enabled (or always — your choice)
    const cleanRanges = ranges
      .map((r) => ({
        start: String(r?.start || "").trim(),
        end: String(r?.end || "").trim(),
      }))
      .filter((r) => r.start && r.end);

    for (const r of cleanRanges) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.start) || !/^\d{4}-\d{2}-\d{2}$/.test(r.end)) {
        throw new HttpsError("invalid-argument", "Rango de fechas inválido.");
      }
      if (r.end < r.start) {
        throw new HttpsError("invalid-argument", "En un rango, 'end' no puede ser menor que 'start'.");
      }
    }

    updates.blocked = {
      enabled,
      message: message || "Estas fechas están bloqueadas. Elige otra fecha 🙏",
      ranges: cleanRanges,
    };
  }

  // Prevent empty update payload
  const keys = Object.keys(updates).filter((k) => k !== "updatedAt");
  if (keys.length === 0) {
    throw new HttpsError("invalid-argument", "No hay cambios para guardar.");
  }

  await db.collection("config").doc("app").set(updates, { merge: true });

  const snap = await db.collection("config").doc("app").get();
  const cfg = snap.exists ? snap.data() : {};

  return { ok: true, config: cfg };
});

export const adminDeleteOrder = onCall(async (request) => {
  assertAdmin(request);

  const id = String(request.data?.id || "").trim();
  if (!id) throw new HttpsError("invalid-argument", "Falta id");

  const ref = db.collection("orders").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Pedido no encontrado");

  await ref.delete();

  logger.info("Order deleted", { id });
  return { ok: true, id };
});

export const adminUpdateOrderQuantities = onCall(async (request) => {
  assertAdmin(request);

  const data = request.data as { id: string; quantities: Partial<OrderQuantities> };
  if (!data?.id) throw new HttpsError("invalid-argument", "Falta id");

  const ref = db.collection("orders").doc(data.id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Pedido no encontrado");

  const prev = snap.data() as any;

  const q = data.quantities || {};
  const quantities: OrderQuantities = {
    azucar: Number(q.azucar ?? prev.quantities?.azucar ?? 0) || 0,
    cafe: Number(q.cafe ?? prev.quantities?.cafe ?? 0) || 0,
    seasonal: Number(q.seasonal ?? prev.quantities?.seasonal ?? 0) || 0,
    cheesecake: Number(q.cheesecake ?? prev.quantities?.cheesecake ?? 0) || 0,
    chocolate: Number(q.chocolate ?? prev.quantities?.chocolate ?? 0) || 0,
    oreo: Number(q.oreo ?? prev.quantities?.oreo ?? 0) || 0,
    zanahoria: Number(q.zanahoria ?? prev.quantities?.zanahoria ?? 0) || 0,
  };

  // ✅ Validate same business rules
  const totalDonas = Object.values(quantities).reduce((a, b) => a + b, 0);
  if (totalDonas < 6) throw new HttpsError("invalid-argument", "El pedido mínimo es de 6 donas.");

  for (const [flavor, qty] of Object.entries(quantities)) {
    if (qty === 1) throw new HttpsError("invalid-argument", `No se permiten donas individuales (${flavor}).`);
    if (qty > 0 && qty < 2) throw new HttpsError("invalid-argument", `Mínimo 2 por sabor si eliges (${flavor}).`);
  }

  // ✅ Recalculate price on server (source of truth)
  const tipoPedido = prev.tipoPedido as TipoPedido;
  const puntoVenta = prev.puntoVenta as string | undefined;
  const precioTotal = calculatePriceServer(tipoPedido, puntoVenta, totalDonas);

  await ref.update({
    quantities,
    totalDonas,
    precioTotal,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, id: data.id, quantities, totalDonas, precioTotal };
});

export const adminMe = onCall(async (request) => {
  const email = String(request.auth?.token?.email || "").toLowerCase();
  if (!email) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const snap = await db.collection("config").doc("admins").get();
  const emails = (snap.data()?.emails || []).map((e: any) => String(e).toLowerCase());

  return { isAdmin: emails.includes(email), email };
});





