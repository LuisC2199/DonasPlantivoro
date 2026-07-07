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

type CostingSection = "receta" | "glaseado";

type CostingIngredient = {
  id: string;
  nombre: string;
  unidad: string;
  unidadesPorEnvase: number;
  costoEnvase: number;
  costoUnidad: number;
  proveedor?: string;
  marca?: string;
};

type CostingIngredientHistoryEntry = {
  ingredientId: string;
  ingredientName: string;
  previousNombre?: string;
  newNombre?: string;
  previousCostoEnvase?: number | null;
  newCostoEnvase?: number | null;
  previousUnidadesPorEnvase?: number | null;
  newUnidadesPorEnvase?: number | null;
  previousCostoUnidad?: number | null;
  newCostoUnidad?: number | null;
  previousProveedor?: string;
  newProveedor?: string;
  previousMarca?: string;
  newMarca?: string;
  changedFields: string[];
  changedAt: string;
  changedBy: string;
  source: "manual" | "import";
};

type CostingRecipeLine = {
  id: string;
  section: CostingSection;
  ingredientId?: string;
  ingrediente: string;
  cantidad: number;
  unidad?: string;
  costoUnidad?: number;
  costoLinea: number;
};

type CostingRecipe = {
  id: string;
  nombre: string;
  producto: string;
  rendimientoReceta: number;
  rendimientoGlaseado: number;
  costoReceta: number;
  costoGlaseado: number;
  costoUnitario: number;
  lines: CostingRecipeLine[];
};

type CostingIndirectItem = {
  id: string;
  categoria: string;
  concepto: string;
  frecuencia: string;
  costo: number;
  costoMensual: number;
};

type CostingData = {
  importedAt?: string;
  sourceFileName?: string;
  ingredients: CostingIngredient[];
  recipes: CostingRecipe[];
  indirectCosts: {
    items: CostingIndirectItem[];
    monthlyTotal: number;
    unitsPerMonth: number;
    overheadPerUnit: number;
    averageSellingPrice: number;
    averageIngredientCost: number;
    expectedGrossProfit: number;
    expectedNetProfit: number;
  };
};

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

const assertAdminEnvOnly = (request: any) => {
  const email = (request.auth?.token?.email || "").toLowerCase();
  if (!email) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const allowlist = getAdminAllowlist();
  if (!allowlist.includes(email)) throw new HttpsError("permission-denied", "No autorizado.");
  return email;
};

const assertAdmin = async (request: any) => {
  try {
    return assertAdminEnvOnly(request);
  } catch (err: any) {
    if (err?.code !== "permission-denied") throw err;
  }

  const email = (request.auth?.token?.email || "").toLowerCase();
  if (!email) throw new HttpsError("unauthenticated", "Debes iniciar sesion.");

  const snap = await db.collection("config").doc("admins").get();
  const firestoreAllowlist = (snap.data()?.emails || []).map((e: any) => String(e).toLowerCase());
  if (firestoreAllowlist.includes(email)) return email;

  throw new HttpsError("permission-denied", "No autorizado.");
};

const cleanId = (value: unknown, fallback: string) =>
  String(value || fallback)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || fallback;

const cleanText = (value: unknown, max = 160) => String(value || "").trim().slice(0, max);

const normalizeIngredientKey = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const INGREDIENT_ALIASES: Record<string, string> = {
  "cafe tasters choice": "cafe",
  "chispas de chocolate": "chispas chocolate",
  "leche almendra silk": "leche almendra",
  "leche de soya": "leche soya",
  "polvo para hornear": "baking powder",
};

const ingredientLookupKey = (value: unknown) => {
  const normalized = normalizeIngredientKey(value);
  return INGREDIENT_ALIASES[normalized] || normalized;
};

const cleanCostNumber = (value: unknown, field: string, allowZero = true) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n <= 0)) {
    throw new HttpsError("invalid-argument", `Numero invalido: ${field}`);
  }
  return Math.round(n * 1_000_000) / 1_000_000;
};

const normalizeCostingData = (raw: any): CostingData => {
  if (!raw || typeof raw !== "object") {
    throw new HttpsError("invalid-argument", "Payload de costeo invalido.");
  }

  const ingredientsRaw = Array.isArray(raw.ingredients) ? raw.ingredients : [];
  const recipesRaw = Array.isArray(raw.recipes) ? raw.recipes : [];
  const indirectRaw = raw.indirectCosts && typeof raw.indirectCosts === "object" ? raw.indirectCosts : {};
  const indirectItemsRaw = Array.isArray(indirectRaw.items) ? indirectRaw.items : [];

  if (ingredientsRaw.length === 0) throw new HttpsError("invalid-argument", "Faltan ingredientes.");
  if (recipesRaw.length === 0) throw new HttpsError("invalid-argument", "Faltan recetas.");
  if (ingredientsRaw.length > 500 || recipesRaw.length > 100) {
    throw new HttpsError("invalid-argument", "El archivo de costeo es demasiado grande.");
  }

  const ingredients: CostingIngredient[] = ingredientsRaw.map((item: any, index: number) => {
    const nombre = cleanText(item.nombre);
    if (!nombre) throw new HttpsError("invalid-argument", `Ingrediente sin nombre en fila ${index + 1}.`);
    const unidadesPorEnvase = cleanCostNumber(item.unidadesPorEnvase, `${nombre}.unidadesPorEnvase`, false);
    const costoEnvase = cleanCostNumber(item.costoEnvase, `${nombre}.costoEnvase`);
    return {
      id: cleanId(item.id || nombre, `ingrediente-${index + 1}`),
      nombre,
      unidad: cleanText(item.unidad, 24),
      unidadesPorEnvase,
      costoEnvase,
      costoUnidad: Math.round((costoEnvase / unidadesPorEnvase) * 1_000_000) / 1_000_000,
      proveedor: cleanText(item.proveedor),
      marca: cleanText(item.marca),
    };
  });

  let ingredientById = new Map(ingredients.map((i) => [i.id, i]));
  const catalogIngredientIds = new Set(ingredients.map((i) => i.id));
  const rebuildIngredientIdMap = () => {
    ingredientById = new Map(ingredients.map((i) => [i.id, i]));
  };
  const ingredientMatches = (nombre: string) =>
    ingredients.filter((i) => ingredientLookupKey(i.nombre) === ingredientLookupKey(nombre));
  const uniqueIngredientId = (value: string, fallback: string) => {
    const base = cleanId(value, fallback);
    let id = base;
    let suffix = 2;
    while (ingredientById.has(id)) id = `${base}-${suffix++}`;
    return id;
  };

  const recipes: CostingRecipe[] = recipesRaw.map((recipe: any, recipeIndex: number) => {
    const nombre = cleanText(recipe.nombre);
    if (!nombre) throw new HttpsError("invalid-argument", `Receta sin nombre en posicion ${recipeIndex + 1}.`);
    const rendimientoReceta = cleanCostNumber(recipe.rendimientoReceta, `${nombre}.rendimientoReceta`, false);
    const rendimientoGlaseado = cleanCostNumber(recipe.rendimientoGlaseado || recipe.rendimientoReceta, `${nombre}.rendimientoGlaseado`, false);
    const linesRaw = Array.isArray(recipe.lines) ? recipe.lines : [];
    if (linesRaw.length === 0) throw new HttpsError("invalid-argument", `La receta ${nombre} no tiene ingredientes.`);
    if (linesRaw.length > 120) throw new HttpsError("invalid-argument", `La receta ${nombre} tiene demasiadas lineas.`);

    const lines: CostingRecipeLine[] = linesRaw.map((line: any, lineIndex: number) => {
      const ingrediente = cleanText(line.ingrediente);
      const section: CostingSection = line.section === "glaseado" ? "glaseado" : "receta";
      const cantidad = cleanCostNumber(line.cantidad, `${nombre}.${ingrediente}.cantidad`);
      const fallbackCostoUnidad = cleanCostNumber(line.costoUnidad ?? 0, `${nombre}.${ingrediente}.costoUnidad`);
      const requested = ingredientById.get(cleanText(line.ingredientId));
      const matches = ingredientMatches(ingrediente);
      const catalogMatch = matches.find((i) => catalogIngredientIds.has(i.id));
      const exactCostMatch = matches.find((i) => Math.abs(i.costoUnidad - fallbackCostoUnidad) < 0.000001);
      let ingredient = requested || catalogMatch || exactCostMatch;

      if (!ingredient && ingrediente) {
        ingredient = {
          id: uniqueIngredientId(ingrediente, `ingrediente-${ingredients.length + 1}`),
          nombre: ingrediente,
          unidad: cleanText(line.unidad, 24),
          unidadesPorEnvase: 1,
          costoEnvase: fallbackCostoUnidad,
          costoUnidad: fallbackCostoUnidad,
          proveedor: "",
          marca: "",
        };
        ingredients.push(ingredient);
        rebuildIngredientIdMap();
      }

      const costoUnidad = ingredient?.costoUnidad ?? fallbackCostoUnidad;
      return {
        id: cleanId(line.id || `${section}-${ingrediente}-${lineIndex + 1}`, `linea-${lineIndex + 1}`),
        section,
        ingredientId: ingredient?.id ?? "",
        ingrediente: ingredient?.nombre ?? ingrediente,
        cantidad,
        unidad: ingredient?.unidad ?? cleanText(line.unidad, 24),
        costoUnidad,
        costoLinea: Math.round(cantidad * costoUnidad * 1_000_000) / 1_000_000,
      };
    });

    const costoReceta = lines
      .filter((line) => line.section === "receta")
      .reduce((sum, line) => sum + line.costoLinea, 0);
    const costoGlaseado = lines
      .filter((line) => line.section === "glaseado")
      .reduce((sum, line) => sum + line.costoLinea, 0);
    const costoUnitario = (costoReceta / rendimientoReceta) + (costoGlaseado / rendimientoGlaseado);

    return {
      id: cleanId(recipe.id || nombre, `receta-${recipeIndex + 1}`),
      nombre,
      producto: cleanText(recipe.producto || "Donas", 48),
      rendimientoReceta,
      rendimientoGlaseado,
      costoReceta: Math.round(costoReceta * 1_000_000) / 1_000_000,
      costoGlaseado: Math.round(costoGlaseado * 1_000_000) / 1_000_000,
      costoUnitario: Math.round(costoUnitario * 1_000_000) / 1_000_000,
      lines,
    };
  });

  const indirectItems: CostingIndirectItem[] = indirectItemsRaw.slice(0, 300).map((item: any, index: number) => ({
    id: cleanId(item.id || `${item.categoria}-${item.concepto}-${index + 1}`, `indirecto-${index + 1}`),
    categoria: cleanText(item.categoria || "General", 80),
    concepto: cleanText(item.concepto, 120),
    frecuencia: cleanText(item.frecuencia, 40),
    costo: cleanCostNumber(item.costo ?? 0, `indirecto.${index + 1}.costo`),
    costoMensual: cleanCostNumber(item.costoMensual ?? 0, `indirecto.${index + 1}.costoMensual`),
  })).filter((item: CostingIndirectItem) => item.concepto);

  const computedMonthlyTotal = indirectItems.reduce((sum, item) => sum + item.costoMensual, 0);
  const unitsPerMonth = cleanCostNumber(indirectRaw.unitsPerMonth || 7800, "indirectCosts.unitsPerMonth", false);
  const monthlyTotal = cleanCostNumber(indirectRaw.monthlyTotal || computedMonthlyTotal, "indirectCosts.monthlyTotal");

  return {
    importedAt: new Date().toISOString(),
    sourceFileName: cleanText(raw.sourceFileName || "Costeo Donas 2025.xlsx", 180),
    ingredients,
    recipes,
    indirectCosts: {
      items: indirectItems,
      monthlyTotal: Math.round(monthlyTotal * 100) / 100,
      unitsPerMonth,
      overheadPerUnit: Math.round((monthlyTotal / unitsPerMonth) * 1_000_000) / 1_000_000,
      averageSellingPrice: cleanCostNumber(indirectRaw.averageSellingPrice ?? 0, "indirectCosts.averageSellingPrice"),
      averageIngredientCost: cleanCostNumber(indirectRaw.averageIngredientCost ?? 0, "indirectCosts.averageIngredientCost"),
      expectedGrossProfit: cleanCostNumber(indirectRaw.expectedGrossProfit ?? 0, "indirectCosts.expectedGrossProfit"),
      expectedNetProfit: cleanCostNumber(indirectRaw.expectedNetProfit ?? 0, "indirectCosts.expectedNetProfit"),
    },
  };
};

const numberChanged = (a: unknown, b: unknown) =>
  Math.abs((Number(a) || 0) - (Number(b) || 0)) > 0.000001;

const textChanged = (a: unknown, b: unknown) =>
  String(a || "").trim() !== String(b || "").trim();

const buildIngredientHistoryEntries = (
  before: CostingData | null,
  after: CostingData,
  changedBy: string,
  source: "manual" | "import",
): CostingIngredientHistoryEntry[] => {
  const beforeById = new Map((before?.ingredients || []).map((ingredient) => [ingredient.id, ingredient]));
  const changedAt = new Date().toISOString();

  return after.ingredients.flatMap((ingredient) => {
    const previous = beforeById.get(ingredient.id);
    if (!previous && !before) return [];

    const changedFields: string[] = [];
    if (!previous || textChanged(previous.nombre, ingredient.nombre)) changedFields.push("nombre");
    if (!previous || numberChanged(previous.costoEnvase, ingredient.costoEnvase)) changedFields.push("costoEnvase");
    if (!previous || numberChanged(previous.unidadesPorEnvase, ingredient.unidadesPorEnvase)) changedFields.push("unidadesPorEnvase");
    if (!previous || numberChanged(previous.costoUnidad, ingredient.costoUnidad)) changedFields.push("costoUnidad");
    if (!previous || textChanged(previous.proveedor, ingredient.proveedor)) changedFields.push("proveedor");
    if (!previous || textChanged(previous.marca, ingredient.marca)) changedFields.push("marca");

    if (changedFields.length === 0) return [];

    return [{
      ingredientId: ingredient.id,
      ingredientName: ingredient.nombre,
      previousNombre: previous?.nombre || "",
      newNombre: ingredient.nombre,
      previousCostoEnvase: previous?.costoEnvase ?? null,
      newCostoEnvase: ingredient.costoEnvase,
      previousUnidadesPorEnvase: previous?.unidadesPorEnvase ?? null,
      newUnidadesPorEnvase: ingredient.unidadesPorEnvase,
      previousCostoUnidad: previous?.costoUnidad ?? null,
      newCostoUnidad: ingredient.costoUnidad,
      previousProveedor: previous?.proveedor || "",
      newProveedor: ingredient.proveedor || "",
      previousMarca: previous?.marca || "",
      newMarca: ingredient.marca || "",
      changedFields,
      changedAt,
      changedBy,
      source,
    }];
  });
};

const writeIngredientHistory = async (entries: CostingIngredientHistoryEntry[]) => {
  if (entries.length === 0) return;

  for (let i = 0; i < entries.length; i += 450) {
    const batch = db.batch();
    entries.slice(i, i + 450).forEach((entry) => {
      const ref = db.collection("costingIngredientHistory").doc();
      batch.set(ref, {
        ...entry,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }
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

  const isoDateInTz = (date: Date, timeZone = "America/Mexico_City") => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const y = parts.find(p => p.type === "year")?.value;
    const m = parts.find(p => p.type === "month")?.value;
    const d = parts.find(p => p.type === "day")?.value;

    return `${y}-${m}-${d}`;
  };

  const now = new Date();
  const todayStr = isoDateInTz(now); // CDMX today (strict midnight CDMX)

  // fechaEntrega is already YYYY-MM-DD
  const selectedStr = fechaEntrega;

  // ✅ admin override (only if caller is admin)
  let isAdmin = false;
  try {
    await assertAdmin(request);
    isAdmin = true;
  } catch {
    isAdmin = false;
  }
  logger.info("submitOrder flags", { isAdmin, overrides: data?.adminOverrides });
  const allowSunday = Boolean(data?.adminOverrides?.allowSunday) && isAdmin;
  const allowPastDates = Boolean(data?.adminOverrides?.allowPastDates) && isAdmin;

  if (!allowSunday) {
    const dayOfWeek = new Date(fechaEntrega + "T00:00:00-06:00").getDay();
    if (dayOfWeek === 0) {
      throw new HttpsError("invalid-argument", "No recibimos pedidos en domingo.");
    }
  }

  if (!allowPastDates && selectedStr <= todayStr) {
    throw new HttpsError(
      "invalid-argument",
      "El pedido debe ser solicitado con al menos un día de anticipación."
    );
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
    await assertAdmin(request);

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

    // ✅ NO timezone conversion
    const toISODateLocal = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const isoInTz = (date: Date, timeZone = "America/Mexico_City") => {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);

      const y = parts.find(p => p.type === "year")?.value;
      const m = parts.find(p => p.type === "month")?.value;
      const d = parts.find(p => p.type === "day")?.value;

      return `${y}-${m}-${d}`;
    };

    const now = new Date();
    const todayStr = isoInTz(now, "America/Mexico_City");

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = isoInTz(tomorrow, "America/Mexico_City");
    logger.info("adminGetOrders dates", { mode, todayStr, tomorrowStr });
    if (mode === "Hoy") {
      query = query.where("fechaEntrega", "==", todayStr);
    } else if (mode === "Mañana") {
      query = query.where("fechaEntrega", "==", tomorrowStr);
    } else {
      if (data.month && /^\d{4}-\d{2}$/.test(data.month)) {
        const [yy, mm] = data.month.split("-").map(Number);
        const start = `${data.month}-01`;
        const next = new Date(yy, mm, 1); // mm is 1-12, Date expects 0-11; BUT here mm is 2 for Feb, so this is actually next month already ✅
        const nextMonthStr = toISODateLocal(next);

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

    // Optional: log bad docs once so you can clean data
    const missing = orders.filter((o: any) => !o.fechaEntrega);
    if (missing.length) {
      logger.warn("Orders missing fechaEntrega", { count: missing.length, ids: missing.map((x: any) => x.id) });
    }

    return { orders };
  } catch (err: any) {
    logger.error("adminGetOrders failed", { message: err?.message, code: err?.code, stack: err?.stack });
    throw new HttpsError("internal", err?.message || "Error cargando pedidos");
  }
});

export const adminTogglePaid = onCall(async (request) => {
  await assertAdmin(request);

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
  await assertAdmin(request);

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
  // add puntosVenta default
  const defaults = {
    seasonalLabel: "Seasonal",
    blocked: { enabled: false, message: "", ranges: [] as any[] },
    puntosVenta: [] as string[],
  };

  return snap.exists ? { ...defaults, ...snap.data() } : defaults;
});

export const adminUpdateBlockedDates = onCall(async (request) => {
  await assertAdmin(request);

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
  await assertAdmin(request);

  const data = (request.data ?? {}) as {
    seasonalLabel?: string;
    blocked?: {
      enabled?: boolean;
      message?: string;
      ranges?: Array<{ start: string; end: string }>;
    };
    puntosVenta?: string[];
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

  // puntosVenta (list of strings)
  if (Array.isArray(data.puntosVenta)) {
    const clean = (data.puntosVenta as any[])
      .map((x) => String(x || "").trim())
      .filter((s) => s.length > 0)
      .slice(0, 200); // safety cap
    const unique = Array.from(new Set(clean));
    updates.puntosVenta = unique;
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
  await assertAdmin(request);

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
  await assertAdmin(request);

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

export const adminGetCostingData = onCall(async (request) => {
  await assertAdmin(request);

  const snap = await db.collection("costing").doc("current").get();
  if (!snap.exists) return { costing: null };

  const costing = { ...(snap.data() || {}) };
  delete (costing as any).updatedAt;
  return { costing };
});

export const adminImportCostingData = onCall(async (request) => {
  const email = await assertAdmin(request);
  const costing = normalizeCostingData(request.data);
  const currentSnap = await db.collection("costing").doc("current").get();
  const previousCosting = currentSnap.exists ? currentSnap.data() as CostingData : null;
  const history = buildIngredientHistoryEntries(previousCosting, costing, email, "import");

  await db.collection("costing").doc("current").set({
    ...costing,
    importedBy: email,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await writeIngredientHistory(history);

  logger.info("Costing data imported", {
    email,
    ingredients: costing.ingredients.length,
    recipes: costing.recipes.length,
    historyEntries: history.length,
    sourceFileName: costing.sourceFileName,
  });

  return { ok: true, costing };
});

export const adminSaveCostingData = onCall(async (request) => {
  const email = await assertAdmin(request);
  const costing = normalizeCostingData(request.data);
  const currentSnap = await db.collection("costing").doc("current").get();
  const previousCosting = currentSnap.exists ? currentSnap.data() as CostingData : null;
  const history = buildIngredientHistoryEntries(previousCosting, costing, email, "manual");

  await db.collection("costing").doc("current").set({
    ...costing,
    editedBy: email,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await writeIngredientHistory(history);

  logger.info("Costing data saved", {
    email,
    ingredients: costing.ingredients.length,
    recipes: costing.recipes.length,
    historyEntries: history.length,
  });

  return { ok: true, costing };
});

export const adminGetIngredientCostHistory = onCall(async (request) => {
  await assertAdmin(request);

  const ingredientId = cleanText(request.data?.ingredientId, 120);
  if (!ingredientId) throw new HttpsError("invalid-argument", "Falta ingredientId.");

  const snap = await db.collection("costingIngredientHistory")
    .where("ingredientId", "==", ingredientId)
    .get();

  return {
    history: snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
      .sort((a: any, b: any) => String(b.changedAt || "").localeCompare(String(a.changedAt || "")))
      .slice(0, 100),
  };
});

export const adminMe = onCall(async (request) => {
  try {
    const allowedEmail = await assertAdmin(request);
    return { isAdmin: true, email: allowedEmail };
  } catch (err: any) {
    if (err?.code !== "permission-denied") throw err;
  }

  const email = String(request.auth?.token?.email || "").toLowerCase();
  if (!email) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const snap = await db.collection("config").doc("admins").get();
  const emails = (snap.data()?.emails || []).map((e: any) => String(e).toLowerCase());

  return { isAdmin: emails.includes(email), email };
});
