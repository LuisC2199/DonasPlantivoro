import React from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import { adminGetCostingData, adminGetIngredientCostHistory, adminImportCostingData, adminSaveCostingData } from "../api";
import { Button } from "../components/Button";
import type {
  CostingData,
  CostingIngredientHistoryEntry,
  CostingIndirectItem,
  CostingIngredient,
  CostingRecipe,
  CostingRecipeLine,
  CostingSection,
} from "../types";

const EXCLUDED_RECIPE_SHEETS = new Set(["COSTOS", "Costos por año", "C. Indirectos 300"]);

const slug = (value: string, fallback = "item") =>
  (value || fallback)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || fallback;

const normalizeIngredientKey = (value: string) =>
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

const ingredientLookupKey = (value: string) => {
  const normalized = normalizeIngredientKey(value);
  return INGREDIENT_ALIASES[normalized] || normalized;
};

const cell = (sheet: XLSX.WorkSheet, address: string) => sheet[address]?.v;

const textCell = (sheet: XLSX.WorkSheet, address: string) => String(cell(sheet, address) ?? "").trim();

const numberCell = (sheet: XLSX.WorkSheet, address: string) => {
  const value = cell(sheet, address);
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const money = (value?: number) =>
  (value ?? 0).toLocaleString("es-MX", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });

const recipeImage = (name: string) => {
  const key = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (key.includes("oreo")) return "/images/flavors/oreo.png";
  if (key.includes("azucar") || key.includes("canela")) return "/images/flavors/azucar.png";
  if (key.includes("cafe")) return "/images/flavors/cafe.png";
  if (key.includes("cheesecake")) return "/images/flavors/cheesecake.png";
  if (key.includes("chocolate")) return "/images/flavors/chocolate.png";
  if (key.includes("zanahoria")) return "/images/flavors/zanahoria.png";
  if (key.includes("red velvet")) return "/images/flavors/redvelvet.png";
  if (key.includes("blueberry")) return "/images/flavors/blueberry.png";
  if (key.includes("chai")) return "/images/flavors/chaibiscoff.png";
  if (key.includes("pumpkin")) return "/images/flavors/pumpkin.png";
  if (key.includes("snickers")) return "/images/flavors/snickers.png";
  return "/images/brand/icon.png";
};

const recipeDisplayName = (recipe: Pick<CostingRecipe, "id" | "nombre">) => {
  const id = recipe.id.toLowerCase();
  const name = recipe.nombre.trim();

  if (id.includes("chocolate-prote") && !name.toLowerCase().includes("prote")) {
    return "Chocolate Proteina";
  }
  if (id.includes("chai-proteina") && !name.toLowerCase().includes("prote")) {
    return "Chai Proteina";
  }

  return name;
};

const productDisplayName = (product?: string) => {
  const normalized = String(product || "Donas").trim().toLowerCase();
  if (normalized.includes("brownie")) return "Brownies";
  if (normalized.includes("galleta")) return "Galletas";
  if (normalized.includes("dona")) return "Donas";
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Donas";
};

const ingredientCountLabel = (count: number) =>
  `${count} ingrediente${count === 1 ? "" : "s"}`;

const isDuplicateWorkbookRecipe = (recipe: CostingRecipe) => {
  const id = recipe.id.toLowerCase();
  const name = recipe.nombre.toLowerCase();

  return (
    id.includes("prote") &&
    id.includes("chocolate") &&
    !id.includes("chocolate-prote") &&
    name === "chocolate" &&
    recipe.costoUnitario < 10
  );
};

const roundCost = (value: number) => Math.round((Number(value) || 0) * 1_000_000) / 1_000_000;

const recalculateCosting = (costing: CostingData): CostingData => {
  const ingredients = costing.ingredients.map((ingredient) => ({
    ...ingredient,
    unidadesPorEnvase: Number(ingredient.unidadesPorEnvase) || 0,
    costoEnvase: Number(ingredient.costoEnvase) || 0,
    costoUnidad:
      Number(ingredient.unidadesPorEnvase) > 0
        ? roundCost((Number(ingredient.costoEnvase) || 0) / Number(ingredient.unidadesPorEnvase))
        : 0,
  }));

  const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const ingredientByName = new Map(ingredients.map((ingredient) => [ingredientLookupKey(ingredient.nombre), ingredient]));

  const recipes = costing.recipes.map((recipe) => {
    const lines = recipe.lines.map((line) => {
      const ingredient =
        ingredientById.get(line.ingredientId || "") ||
        ingredientByName.get(ingredientLookupKey(line.ingrediente));
      const cantidad = Number(line.cantidad) || 0;
      const costoUnidad = ingredient?.costoUnidad ?? Number(line.costoUnidad) ?? 0;

      return {
        ...line,
        ingredientId: ingredient?.id || line.ingredientId || "",
        ingrediente: ingredient?.nombre || line.ingrediente,
        unidad: ingredient?.unidad || line.unidad,
        cantidad,
        costoUnidad,
        costoLinea: roundCost(cantidad * costoUnidad),
      };
    });

    const rendimientoReceta = Number(recipe.rendimientoReceta) || 1;
    const rendimientoGlaseado = Number(recipe.rendimientoGlaseado) || rendimientoReceta;
    const costoReceta = lines
      .filter((line) => line.section === "receta")
      .reduce((sum, line) => sum + line.costoLinea, 0);
    const costoGlaseado = lines
      .filter((line) => line.section === "glaseado")
      .reduce((sum, line) => sum + line.costoLinea, 0);

    return {
      ...recipe,
      rendimientoReceta,
      rendimientoGlaseado,
      costoReceta: roundCost(costoReceta),
      costoGlaseado: roundCost(costoGlaseado),
      costoUnitario: roundCost((costoReceta / rendimientoReceta) + (costoGlaseado / rendimientoGlaseado)),
      lines,
    };
  });

  const monthlyTotal = costing.indirectCosts.items.reduce((sum, item) => sum + (Number(item.costoMensual) || 0), 0);
  const unitsPerMonth = Number(costing.indirectCosts.unitsPerMonth) || 1;

  return {
    ...costing,
    ingredients,
    recipes,
    indirectCosts: {
      ...costing.indirectCosts,
      monthlyTotal: roundCost(monthlyTotal),
      unitsPerMonth,
      overheadPerUnit: roundCost(monthlyTotal / unitsPerMonth),
    },
  };
};

const parseCostingWorkbook = (fileName: string, buffer: ArrayBuffer): CostingData => {
  const workbook = XLSX.read(buffer, { type: "array", cellFormula: true, cellNF: false, cellText: false });
  const costos = workbook.Sheets.COSTOS;
  if (!costos) throw new Error("No encontré la hoja COSTOS.");

  const ingredients: CostingIngredient[] = [];
  for (let row = 20; row <= 180; row++) {
    const nombre = textCell(costos, `B${row}`);
    if (!nombre) continue;

    const unidadesPorEnvase = numberCell(costos, `D${row}`);
    const costoEnvase = numberCell(costos, `E${row}`);
    if (!unidadesPorEnvase || !costoEnvase) continue;

    ingredients.push({
      id: slug(nombre, `ingrediente-${row}`),
      nombre,
      unidad: textCell(costos, `C${row}`),
      unidadesPorEnvase,
      costoEnvase,
      costoUnidad: costoEnvase / unidadesPorEnvase,
      proveedor: textCell(costos, `G${row}`),
      marca: textCell(costos, `H${row}`),
    });
  }

  const ingredientByName = new Map(ingredients.map((ingredient) => [ingredientLookupKey(ingredient.nombre), ingredient]));

  const parseRecipeLines = (
    sheet: XLSX.WorkSheet,
    recipeName: string,
    section: CostingSection,
    startCol: "B" | "K",
    qtyCol: "C" | "L",
    unitCol: "D" | "M",
    unitCostCol: "G" | "P",
    lineCostCol: "I" | "R",
  ) => {
    const lines: CostingRecipeLine[] = [];

    for (let row = 6; row <= 18; row++) {
      const ingrediente = textCell(sheet, `${startCol}${row}`);
      if (!ingrediente || ingrediente.toLowerCase().includes("costo")) continue;

      const cantidad = numberCell(sheet, `${qtyCol}${row}`);
      if (!cantidad) continue;

      const ingredient = ingredientByName.get(ingredientLookupKey(ingrediente));
      const costoUnidad = ingredient?.costoUnidad ?? numberCell(sheet, `${unitCostCol}${row}`);
      const costoLinea = cantidad * costoUnidad || numberCell(sheet, `${lineCostCol}${row}`);

      lines.push({
        id: slug(`${recipeName}-${section}-${ingrediente}-${row}`, `linea-${row}`),
        section,
        ingredientId: ingredient?.id || "",
        ingrediente,
        cantidad,
        unidad: ingredient?.unidad || textCell(sheet, `${unitCol}${row}`),
        costoUnidad,
        costoLinea,
      });
    }

    return lines;
  };

  const recipes: CostingRecipe[] = workbook.SheetNames
    .filter((sheetName) => !EXCLUDED_RECIPE_SHEETS.has(sheetName))
    .filter((sheetName) => {
      const normalized = sheetName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return normalized !== "proteina chocolate";
    })
    .map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const title = textCell(sheet, "B3") || sheetName;
      const titleName = title.replace(/^RECETA\s+/i, "").replace(/^Receta\s+/i, "").trim();
      const nombre =
        sheetName.toLowerCase().includes("prote") && !titleName.toLowerCase().includes("prote")
          ? sheetName
          : titleName || sheetName;
      const rendimientoReceta = numberCell(sheet, "F3") || 1;
      const rendimientoGlaseado = numberCell(sheet, "O3") || rendimientoReceta;
      const producto = productDisplayName(textCell(sheet, "G3") || "Donas");
      const lines = [
        ...parseRecipeLines(sheet, nombre, "receta", "B", "C", "D", "G", "I"),
        ...parseRecipeLines(sheet, nombre, "glaseado", "K", "L", "M", "P", "R"),
      ];
      const costoReceta = lines.filter((line) => line.section === "receta").reduce((sum, line) => sum + line.costoLinea, 0);
      const costoGlaseado = lines.filter((line) => line.section === "glaseado").reduce((sum, line) => sum + line.costoLinea, 0);

      return {
        id: slug(sheetName, `receta-${sheetName}`),
        nombre,
        producto,
        rendimientoReceta,
        rendimientoGlaseado,
        costoReceta,
        costoGlaseado,
        costoUnitario: (costoReceta / rendimientoReceta) + (costoGlaseado / rendimientoGlaseado),
        lines,
      };
    })
    .filter((recipe) => recipe.lines.length > 0);

  const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const catalogIngredientIds = new Set(ingredients.map((ingredient) => ingredient.id));
  const ingredientMatches = (nombre: string) =>
    ingredients.filter((ingredient) => ingredientLookupKey(ingredient.nombre) === ingredientLookupKey(nombre));
  const ensureIngredientId = (line: CostingRecipeLine) => {
    const requested = ingredientById.get(line.ingredientId || "");
    const matches = ingredientMatches(line.ingrediente);
    const catalogMatch = matches.find((ingredient) => catalogIngredientIds.has(ingredient.id));
    const exactCostMatch = matches.find(
      (ingredient) => Math.abs((ingredient.costoUnidad || 0) - (line.costoUnidad || 0)) < 0.000001
    );
    const existing = requested || catalogMatch || exactCostMatch;

    if (existing) {
      line.ingredientId = existing.id;
      line.ingrediente = existing.nombre;
      line.unidad = existing.unidad;
      line.costoUnidad = existing.costoUnidad;
      line.costoLinea = line.cantidad * existing.costoUnidad;
      return;
    }

    const baseId = slug(line.ingrediente, `ingrediente-${ingredients.length + 1}`);
    let id = baseId;
    let suffix = 2;
    while (ingredientById.has(id)) id = `${baseId}-${suffix++}`;
    const ingredient: CostingIngredient = {
      id,
      nombre: line.ingrediente,
      unidad: line.unidad || "",
      unidadesPorEnvase: 1,
      costoEnvase: line.costoUnidad || 0,
      costoUnidad: line.costoUnidad || 0,
      proveedor: "",
      marca: "",
    };
    ingredients.push(ingredient);
    ingredientById.set(ingredient.id, ingredient);
    line.ingredientId = ingredient.id;
    line.ingrediente = ingredient.nombre;
  };

  recipes.forEach((recipe) => {
    recipe.lines.forEach(ensureIngredientId);
    recipe.costoReceta = recipe.lines
      .filter((line) => line.section === "receta")
      .reduce((sum, line) => sum + line.costoLinea, 0);
    recipe.costoGlaseado = recipe.lines
      .filter((line) => line.section === "glaseado")
      .reduce((sum, line) => sum + line.costoLinea, 0);
    recipe.costoUnitario =
      (recipe.costoReceta / recipe.rendimientoReceta) + (recipe.costoGlaseado / recipe.rendimientoGlaseado);
  });

  const indirectSheet = workbook.Sheets["C. Indirectos 300"];
  const indirectItems: CostingIndirectItem[] = [];
  let categoria = "General";

  if (indirectSheet) {
    for (let row = 7; row <= 29; row++) {
      const concepto = textCell(indirectSheet, `A${row}`);
      const frecuencia = textCell(indirectSheet, `B${row}`);
      const costo = numberCell(indirectSheet, `C${row}`);
      const costoMensual = numberCell(indirectSheet, `D${row}`);

      if (concepto && !frecuencia && !costo && !costoMensual) {
        categoria = concepto;
        continue;
      }

      if (!concepto || !frecuencia) continue;

      indirectItems.push({
        id: slug(`${categoria}-${concepto}-${row}`, `indirecto-${row}`),
        categoria,
        concepto,
        frecuencia,
        costo,
        costoMensual,
      });
    }
  }

  const monthlyTotal = indirectSheet ? numberCell(indirectSheet, "D33") : indirectItems.reduce((sum, item) => sum + item.costoMensual, 0);
  const unitsPerMonth = indirectSheet ? numberCell(indirectSheet, "H34") || 7800 : 7800;

  return {
    sourceFileName: fileName,
    ingredients,
    recipes,
    indirectCosts: {
      items: indirectItems,
      monthlyTotal,
      unitsPerMonth,
      overheadPerUnit: unitsPerMonth ? monthlyTotal / unitsPerMonth : 0,
      averageSellingPrice: indirectSheet ? numberCell(indirectSheet, "D36") : 0,
      averageIngredientCost: indirectSheet ? numberCell(indirectSheet, "D37") : 0,
      expectedGrossProfit: indirectSheet ? numberCell(indirectSheet, "D38") : 0,
      expectedNetProfit: indirectSheet ? numberCell(indirectSheet, "D39") : 0,
    },
  };
};

export default function AdminCosting() {
  const [costing, setCosting] = React.useState<CostingData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [importing, setImporting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [selectedRecipeId, setSelectedRecipeId] = React.useState("");
  const [recipeModalOpen, setRecipeModalOpen] = React.useState(false);
  const [historyIngredient, setHistoryIngredient] = React.useState<CostingIngredient | null>(null);
  const [historyEntries, setHistoryEntries] = React.useState<CostingIngredientHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"resumen" | "recetas" | "ingredientes" | "indirectos">("resumen");
  const [inlineIngredient, setInlineIngredient] = React.useState({
    nombre: "",
    unidad: "g",
    unidadesPorEnvase: 1,
    costoEnvase: 0,
    proveedor: "",
    marca: "",
  });
  const inputRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminGetCostingData();
      setCosting(res.costing);
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar el costeo.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const sortedRecipes = React.useMemo(
    () => [...(costing?.recipes ?? [])]
      .filter((recipe) => !isDuplicateWorkbookRecipe(recipe))
      .sort((a, b) => b.costoUnitario - a.costoUnitario),
    [costing],
  );

  React.useEffect(() => {
    if (!costing?.recipes.length) {
      setSelectedRecipeId("");
      return;
    }
    if (!selectedRecipeId || !costing.recipes.some((recipe) => recipe.id === selectedRecipeId)) {
      setSelectedRecipeId(costing.recipes[0].id);
    }
  }, [costing, selectedRecipeId]);

  const topIngredients = React.useMemo(
    () => [...(costing?.ingredients ?? [])].sort((a, b) => b.costoUnidad - a.costoUnidad).slice(0, 8),
    [costing],
  );

  const avgRecipeCost = React.useMemo(() => {
    if (!costing?.recipes.length) return 0;
    return costing.recipes.reduce((sum, recipe) => sum + recipe.costoUnitario, 0) / costing.recipes.length;
  }, [costing]);

  const selectedRecipe = React.useMemo(
    () => costing?.recipes.find((recipe) => recipe.id === selectedRecipeId) ?? null,
    [costing, selectedRecipeId],
  );

  const updateCosting = (updater: (current: CostingData) => CostingData) => {
    setMessage("");
    setCosting((current) => (current ? recalculateCosting(updater(current)) : current));
  };

  const updateIngredient = (id: string, patch: Partial<CostingIngredient>) => {
    updateCosting((current) => ({
      ...current,
      ingredients: current.ingredients.map((ingredient) =>
        ingredient.id === id ? { ...ingredient, ...patch } : ingredient
      ),
    }));
  };

  const addIngredient = () => {
    const id = `ingrediente-${Date.now()}`;
    updateCosting((current) => ({
      ...current,
      ingredients: [
        ...current.ingredients,
        {
          id,
          nombre: "Nuevo ingrediente",
          unidad: "g",
          unidadesPorEnvase: 1,
          costoEnvase: 0,
          costoUnidad: 0,
          proveedor: "",
          marca: "",
        },
      ],
    }));
  };

  const removeIngredient = (id: string) => {
    const ok = window.confirm("Eliminar ingrediente del costeo?");
    if (!ok) return;
    updateCosting((current) => ({
      ...current,
      ingredients: current.ingredients.filter((ingredient) => ingredient.id !== id),
      recipes: current.recipes.map((recipe) => ({
        ...recipe,
        lines: recipe.lines.map((line) =>
          line.ingredientId === id ? { ...line, ingredientId: "" } : line
        ),
      })),
    }));
  };

  const openIngredientHistory = async (ingredient: CostingIngredient) => {
    setHistoryIngredient(ingredient);
    setHistoryEntries([]);
    setHistoryLoading(true);
    setError("");

    try {
      const res = await adminGetIngredientCostHistory(ingredient.id);
      setHistoryEntries(res.history);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "No se pudo cargar el historial del ingrediente.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const updateRecipe = (id: string, patch: Partial<CostingRecipe>) => {
    updateCosting((current) => ({
      ...current,
      recipes: current.recipes.map((recipe) =>
        recipe.id === id ? { ...recipe, ...patch } : recipe
      ),
    }));
  };

  const openRecipe = (id: string) => {
    setSelectedRecipeId(id);
    setRecipeModalOpen(true);
  };

  const addRecipe = () => {
    const id = `receta-${Date.now()}`;
    const firstIngredient = costing?.ingredients[0];
    updateCosting((current) => ({
      ...current,
      recipes: [
        ...current.recipes,
        {
          id,
          nombre: "Nueva receta",
          producto: "Donas",
          rendimientoReceta: 8,
          rendimientoGlaseado: 8,
          costoReceta: 0,
          costoGlaseado: 0,
          costoUnitario: 0,
          lines: firstIngredient
            ? [
                {
                  id: `receta-${Date.now()}-linea`,
                  section: "receta",
                  ingredientId: firstIngredient.id,
                  ingrediente: firstIngredient.nombre,
                  cantidad: 0,
                  unidad: firstIngredient.unidad,
                  costoUnidad: firstIngredient.costoUnidad,
                  costoLinea: 0,
                },
              ]
            : [],
        },
      ],
    }));
    setSelectedRecipeId(id);
    setRecipeModalOpen(true);
    setActiveTab("recetas");
  };

  const removeRecipe = (id: string) => {
    const recipe = costing?.recipes.find((item) => item.id === id);
    const ok = window.confirm(`Eliminar la receta "${recipeDisplayName(recipe || { id, nombre: "esta receta" })}"? Esta accion no se puede deshacer.`);
    if (!ok) return;

    updateCosting((current) => {
      const recipes = current.recipes.filter((item) => item.id !== id);
      const nextSelected = recipes[0]?.id || "";
      setSelectedRecipeId(nextSelected);
      setRecipeModalOpen(false);
      return {
        ...current,
        recipes,
      };
    });
  };

  const updateRecipeLine = (recipeId: string, lineId: string, patch: Partial<CostingRecipeLine>) => {
    updateCosting((current) => ({
      ...current,
      recipes: current.recipes.map((recipe) =>
        recipe.id === recipeId
          ? {
              ...recipe,
              lines: recipe.lines.map((line) =>
                line.id === lineId ? { ...line, ...patch } : line
              ),
            }
          : recipe
      ),
    }));
  };

  const addRecipeLine = (recipeId: string, section: CostingSection) => {
    const firstIngredient = costing?.ingredients[0];
    updateCosting((current) => ({
      ...current,
      recipes: current.recipes.map((recipe) =>
        recipe.id === recipeId
          ? {
              ...recipe,
              lines: [
                ...recipe.lines,
                {
                  id: `${section}-${Date.now()}`,
                  section,
                  ingredientId: firstIngredient?.id || "",
                  ingrediente: firstIngredient?.nombre || "Ingrediente",
                  cantidad: 0,
                  unidad: firstIngredient?.unidad || "g",
                  costoUnidad: firstIngredient?.costoUnidad || 0,
                  costoLinea: 0,
                },
              ],
            }
          : recipe
      ),
    }));
  };

  const addInlineIngredientToRecipe = (recipeId: string, section: CostingSection) => {
    const nombre = inlineIngredient.nombre.trim();
    if (!nombre) {
      setError("Escribe el nombre del ingrediente.");
      return;
    }

    const ingredientId = slug(nombre, `ingrediente-${Date.now()}`);
    const unidadesPorEnvase = Number(inlineIngredient.unidadesPorEnvase) || 1;
    const costoEnvase = Number(inlineIngredient.costoEnvase) || 0;
    const costoUnidad = unidadesPorEnvase > 0 ? costoEnvase / unidadesPorEnvase : 0;

    updateCosting((current) => ({
      ...current,
      ingredients: [
        ...current.ingredients,
        {
          id: ingredientId,
          nombre,
          unidad: inlineIngredient.unidad || "g",
          unidadesPorEnvase,
          costoEnvase,
          costoUnidad,
          proveedor: inlineIngredient.proveedor,
          marca: inlineIngredient.marca,
        },
      ],
      recipes: current.recipes.map((recipe) =>
        recipe.id === recipeId
          ? {
              ...recipe,
              lines: [
                ...recipe.lines,
                {
                  id: `${section}-${ingredientId}-${Date.now()}`,
                  section,
                  ingredientId,
                  ingrediente: nombre,
                  cantidad: 0,
                  unidad: inlineIngredient.unidad || "g",
                  costoUnidad,
                  costoLinea: 0,
                },
              ],
            }
          : recipe
      ),
    }));

    setInlineIngredient({
      nombre: "",
      unidad: "g",
      unidadesPorEnvase: 1,
      costoEnvase: 0,
      proveedor: "",
      marca: "",
    });
    setError("");
  };

  const removeRecipeLine = (recipeId: string, lineId: string) => {
    updateCosting((current) => ({
      ...current,
      recipes: current.recipes.map((recipe) =>
        recipe.id === recipeId
          ? { ...recipe, lines: recipe.lines.filter((line) => line.id !== lineId) }
          : recipe
      ),
    }));
  };

  const saveCosting = async () => {
    if (!costing) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await adminSaveCostingData(recalculateCosting(costing));
      setCosting(res.costing);
      setMessage("Costeo guardado.");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "No se pudo guardar el costeo.");
    } finally {
      setSaving(false);
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError("");

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseCostingWorkbook(file.name, buffer);
      const res = await adminImportCostingData(parsed);
      setCosting(res.costing);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "No se pudo importar el archivo.");
    } finally {
      setImporting(false);
      if (event.target) event.target.value = "";
    }
  };

  if (loading) {
    return <div className="p-12 text-center font-black text-[#40068B]">Cargando costeo...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 min-h-screen">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".xlsx,.xls"
        onChange={handleFile}
      />

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-black text-[#40068B]">Costeo</h1>
          <p className="text-[#28CD7E] font-bold uppercase tracking-widest text-xs mt-1">
            Recetas, insumos y costos indirectos
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin">
            <Button variant="outline" size="sm">Volver</Button>
          </Link>
          {costing && (
            <Button variant="secondary" size="sm" disabled={saving} onClick={saveCosting}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          )}
          <Button size="sm" disabled={importing} onClick={() => inputRef.current?.click()}>
            {importing ? "Importando..." : "Importar Excel"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 font-bold text-sm">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-6 p-4 rounded-2xl bg-[#28CD7E]/10 border border-[#28CD7E]/20 text-[#168a55] font-black text-sm">
          {message}
        </div>
      )}

      {!costing ? (
        <div className="bg-white border border-stone-100 rounded-[2rem] p-10 text-center">
          <div className="text-2xl font-black text-[#40068B]">No hay costeo importado</div>
          <p className="mt-2 text-sm font-bold text-stone-500">
            Importa el archivo de costeo para cargar ingredientes, recetas y costos indirectos.
          </p>
          <Button className="mt-6" onClick={() => inputRef.current?.click()} disabled={importing}>
            Importar Excel
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white border border-stone-100 rounded-2xl p-5">
              <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Ingredientes</div>
              <div className="mt-2 text-3xl font-black text-stone-900">{costing.ingredients.length}</div>
            </div>
            <div className="bg-white border border-stone-100 rounded-2xl p-5">
              <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Recetas</div>
              <div className="mt-2 text-3xl font-black text-stone-900">{costing.recipes.length}</div>
            </div>
            <div className="bg-white border border-stone-100 rounded-2xl p-5">
              <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Costo prom. receta</div>
              <div className="mt-2 text-3xl font-black text-[#40068B]">${money(avgRecipeCost)}</div>
            </div>
            <div className="bg-white border border-stone-100 rounded-2xl p-5">
              <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Indirecto por dona</div>
              <div className="mt-2 text-3xl font-black text-[#40068B]">${money(costing.indirectCosts.overheadPerUnit)}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 bg-stone-100 p-1 rounded-2xl w-fit">
            {[
              ["resumen", "Resumen"],
              ["recetas", "Recetas"],
              ["ingredientes", "Ingredientes"],
              ["indirectos", "Indirectos"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key as typeof activeTab)}
                className={`px-5 py-2.5 rounded-xl font-black text-sm transition-all ${
                  activeTab === key
                    ? "bg-white text-[#40068B] shadow-sm"
                    : "text-stone-400 hover:text-stone-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === "resumen" && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <section className="xl:col-span-2 bg-white border border-stone-100 rounded-[2rem] p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-4 gap-4">
                <h2 className="text-xl font-black text-[#40068B]">Costo por receta</h2>
                <div className="text-xs font-bold text-stone-400">{costing.sourceFileName}</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-widest text-stone-400 border-b">
                      <th className="py-3 pr-4">Receta</th>
                      <th className="py-3 pr-4 text-right">Rend.</th>
                      <th className="py-3 pr-4 text-right">Insumos</th>
                      <th className="py-3 pr-4 text-right">Glaseado</th>
                      <th className="py-3 text-right">Unitario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRecipes.map((recipe) => (
                      <tr
                        key={recipe.id}
                        onClick={() => {
                          setActiveTab("recetas");
                          openRecipe(recipe.id);
                        }}
                        className={`border-b border-stone-100 last:border-0 cursor-pointer ${
                          selectedRecipeId === recipe.id ? "bg-[#40068B]/5" : "hover:bg-stone-50"
                        }`}
                      >
                        <td className="py-3 pr-4 font-black text-stone-800">{recipeDisplayName(recipe)}</td>
                        <td className="py-3 pr-4 text-right font-bold text-stone-500">{recipe.rendimientoReceta}</td>
                        <td className="py-3 pr-4 text-right font-bold">${money(recipe.costoReceta)}</td>
                        <td className="py-3 pr-4 text-right font-bold">${money(recipe.costoGlaseado)}</td>
                        <td className="py-3 text-right font-black text-[#40068B]">${money(recipe.costoUnitario)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-white border border-stone-100 rounded-[2rem] p-6">
              <h2 className="text-xl font-black text-[#40068B] mb-4">Insumos caros</h2>
              <div className="space-y-3">
                {topIngredients.map((ingredient) => (
                  <div key={ingredient.id} className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-stone-50 border border-stone-100">
                    <div className="min-w-0">
                      <div className="font-black text-stone-800 truncate">{ingredient.nombre}</div>
                      <div className="text-xs font-bold text-stone-400 truncate">{ingredient.proveedor || "Sin proveedor"}</div>
                    </div>
                    <div className="font-black text-[#40068B] whitespace-nowrap">
                      ${money(ingredient.costoUnidad)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          )}

          {activeTab === "recetas" && (
            <section className="bg-white border border-stone-100 rounded-[2rem] p-6 overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-xl font-black text-[#40068B]">Recetas</h2>
                  <p className="text-xs font-bold text-stone-400 mt-1">
                    Selecciona una receta para editarla en una ventana.
                  </p>
                </div>
                <Button size="sm" onClick={addRecipe}>
                  Nueva receta
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sortedRecipes.map((recipe) => (
                  <button
                    key={recipe.id}
                    type="button"
                    onClick={() => openRecipe(recipe.id)}
                    className="text-left p-5 rounded-2xl bg-stone-50 border border-stone-100 hover:border-[#40068B]/30 hover:bg-[#40068B]/5 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-3">
                        <img
                          src={recipeImage(recipeDisplayName(recipe))}
                          alt=""
                          className="h-12 w-12 rounded-2xl object-cover border border-white shadow-sm bg-white shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-black text-stone-900 truncate">{recipeDisplayName(recipe)}</div>
                          <div className="mt-1 text-xs font-bold text-stone-400">
                            {productDisplayName(recipe.producto)} · {ingredientCountLabel(recipe.lines.length)}
                          </div>
                        </div>
                      </div>
                      <div className="font-black text-[#40068B] whitespace-nowrap">
                        ${money(recipe.costoUnitario)}
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-xl bg-white border border-stone-100 p-2">
                        <div className="font-black text-stone-400 uppercase">Rend.</div>
                        <div className="font-black text-stone-800">{recipe.rendimientoReceta}</div>
                      </div>
                      <div className="rounded-xl bg-white border border-stone-100 p-2">
                        <div className="font-black text-stone-400 uppercase">Insumos</div>
                        <div className="font-black text-stone-800">${money(recipe.costoReceta)}</div>
                      </div>
                      <div className="rounded-xl bg-white border border-stone-100 p-2">
                        <div className="font-black text-stone-400 uppercase">Glaseado</div>
                        <div className="font-black text-stone-800">${money(recipe.costoGlaseado)}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {activeTab === "ingredientes" && (
          <section className="bg-white border border-stone-100 rounded-[2rem] p-6 overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-black text-[#40068B]">Editar ingredientes</h2>
                <p className="text-xs font-bold text-stone-400 mt-1">
                  El costo por unidad se recalcula con costo envase / unidades por envase.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={addIngredient}>
                + Ingrediente
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[980px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-stone-400 border-b">
                    <th className="py-3 pr-3">Nombre</th>
                    <th className="py-3 pr-3">Unidad</th>
                    <th className="py-3 pr-3 text-right">Unid. envase</th>
                    <th className="py-3 pr-3 text-right">Costo envase</th>
                    <th className="py-3 pr-3 text-right">Costo unidad</th>
                    <th className="py-3 pr-3">Proveedor</th>
                    <th className="py-3 pr-3">Marca</th>
                    <th className="py-3 text-right">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {costing.ingredients
                    .slice()
                    .sort((a, b) => a.nombre.localeCompare(b.nombre))
                    .map((ingredient) => (
                      <tr key={ingredient.id} className="border-b border-stone-100 last:border-0">
                        <td className="py-2 pr-3">
                          <input
                            value={ingredient.nombre}
                            onChange={(e) => updateIngredient(ingredient.id, { nombre: e.target.value })}
                            className="w-full h-10 px-3 rounded-xl bg-stone-50 border border-stone-100 font-bold outline-none"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            value={ingredient.unidad}
                            onChange={(e) => updateIngredient(ingredient.id, { unidad: e.target.value })}
                            className="w-24 h-10 px-3 rounded-xl bg-stone-50 border border-stone-100 font-bold outline-none"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="number"
                            min="0"
                            value={ingredient.unidadesPorEnvase}
                            onChange={(e) => updateIngredient(ingredient.id, { unidadesPorEnvase: Number(e.target.value) })}
                            className="w-32 h-10 px-3 rounded-xl bg-stone-50 border border-stone-100 font-bold outline-none text-right"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="number"
                            min="0"
                            value={ingredient.costoEnvase}
                            onChange={(e) => updateIngredient(ingredient.id, { costoEnvase: Number(e.target.value) })}
                            className="w-32 h-10 px-3 rounded-xl bg-stone-50 border border-stone-100 font-bold outline-none text-right"
                          />
                        </td>
                        <td className="py-2 pr-3 text-right font-black text-[#40068B]">
                          ${money(ingredient.costoUnidad)}
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            value={ingredient.proveedor || ""}
                            onChange={(e) => updateIngredient(ingredient.id, { proveedor: e.target.value })}
                            className="w-full h-10 px-3 rounded-xl bg-stone-50 border border-stone-100 font-bold outline-none"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            value={ingredient.marca || ""}
                            onChange={(e) => updateIngredient(ingredient.id, { marca: e.target.value })}
                            className="w-full h-10 px-3 rounded-xl bg-stone-50 border border-stone-100 font-bold outline-none"
                          />
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openIngredientHistory(ingredient)}
                            className="h-10 px-3 rounded-xl bg-stone-50 border border-stone-100 text-[#40068B] font-black text-xs"
                          >
                            Historial
                          </button>
                          <button
                            type="button"
                            onClick={() => removeIngredient(ingredient.id)}
                            className="h-10 px-3 rounded-xl bg-red-50 border border-red-100 text-red-600 font-black text-xs"
                          >
                            Eliminar
                          </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
          )}

          {activeTab === "indirectos" && (
          <section className="bg-white border border-stone-100 rounded-[2rem] p-6 overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-black text-[#40068B]">Costos indirectos</h2>
                <p className="text-xs font-bold text-stone-400 mt-1">
                  Total mensual ${money(costing.indirectCosts.monthlyTotal)} sobre {costing.indirectCosts.unitsPerMonth.toLocaleString("es-MX")} unidades
                </p>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Utilidad esperada</div>
                <div className="text-2xl font-black text-[#28CD7E]">${money(costing.indirectCosts.expectedNetProfit)}</div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-stone-400 border-b">
                    <th className="py-3 pr-4">Categoria</th>
                    <th className="py-3 pr-4">Concepto</th>
                    <th className="py-3 pr-4">Frecuencia</th>
                    <th className="py-3 pr-4 text-right">Costo</th>
                    <th className="py-3 text-right">Mensual</th>
                  </tr>
                </thead>
                <tbody>
                  {costing.indirectCosts.items.map((item) => (
                    <tr key={item.id} className="border-b border-stone-100 last:border-0">
                      <td className="py-3 pr-4 font-bold text-stone-500">{item.categoria}</td>
                      <td className="py-3 pr-4 font-black text-stone-800">{item.concepto}</td>
                      <td className="py-3 pr-4 font-bold text-stone-500">{item.frecuencia}</td>
                      <td className="py-3 pr-4 text-right font-bold">${money(item.costo)}</td>
                      <td className="py-3 text-right font-black text-[#40068B]">${money(item.costoMensual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          )}
        </div>
      )}

      {historyIngredient && (
        <div className="fixed inset-0 z-[999]">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/40"
            onClick={() => setHistoryIngredient(null)}
          />
          <div className="absolute inset-x-4 top-8 bottom-8 mx-auto max-w-4xl bg-white rounded-[2rem] shadow-2xl border border-stone-100 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-stone-100 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-[#40068B]">Historial de costo</h2>
                <p className="text-sm font-bold text-stone-500 mt-1">{historyIngredient.nombre}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setHistoryIngredient(null)}>
                Cerrar
              </Button>
            </div>

            <div className="p-6 overflow-auto">
              {historyLoading ? (
                <div className="text-sm font-bold text-stone-500">Cargando historial...</div>
              ) : historyEntries.length === 0 ? (
                <div className="rounded-2xl bg-stone-50 border border-stone-100 p-5">
                  <div className="font-black text-stone-900">Sin cambios guardados todavía</div>
                  <p className="text-sm font-bold text-stone-500 mt-1">
                    El historial empieza a llenarse cuando guardes cambios de costo, envase, proveedor o marca.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-widest text-stone-400 border-b">
                        <th className="py-3 pr-4">Fecha</th>
                        <th className="py-3 pr-4">Cambio</th>
                        <th className="py-3 pr-4 text-right">Costo envase</th>
                        <th className="py-3 pr-4 text-right">Unid. envase</th>
                        <th className="py-3 pr-4 text-right">Costo unidad</th>
                        <th className="py-3 pr-4">Proveedor</th>
                        <th className="py-3 pr-4">Marca</th>
                        <th className="py-3">Admin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyEntries.map((entry) => (
                        <tr key={entry.id} className="border-b border-stone-100 last:border-0">
                          <td className="py-3 pr-4 font-bold text-stone-600 whitespace-nowrap">
                            {entry.changedAt ? new Date(entry.changedAt).toLocaleString("es-MX") : "-"}
                            <div className="text-[10px] font-black uppercase text-stone-400">{entry.source === "import" ? "Importacion" : "Manual"}</div>
                          </td>
                          <td className="py-3 pr-4 font-black text-stone-800">
                            {entry.changedFields.join(", ")}
                          </td>
                          <td className="py-3 pr-4 text-right font-bold">
                            ${money(entry.previousCostoEnvase ?? 0)} {"->"} ${money(entry.newCostoEnvase ?? 0)}
                          </td>
                          <td className="py-3 pr-4 text-right font-bold">
                            {entry.previousUnidadesPorEnvase ?? "-"} {"->"} {entry.newUnidadesPorEnvase ?? "-"}
                          </td>
                          <td className="py-3 pr-4 text-right font-black text-[#40068B]">
                            ${money(entry.previousCostoUnidad ?? 0)} {"->"} ${money(entry.newCostoUnidad ?? 0)}
                          </td>
                          <td className="py-3 pr-4 font-bold text-stone-600">
                            {entry.previousProveedor || "-"} {"->"} {entry.newProveedor || "-"}
                          </td>
                          <td className="py-3 pr-4 font-bold text-stone-600">
                            {entry.previousMarca || "-"} {"->"} {entry.newMarca || "-"}
                          </td>
                          <td className="py-3 font-bold text-stone-500">{entry.changedBy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {recipeModalOpen && selectedRecipe && costing && (
        <div className="fixed inset-0 z-[999]">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/40"
            onClick={() => setRecipeModalOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 sm:inset-6 sm:flex sm:items-center sm:justify-center">
            <div className="relative w-full sm:max-w-6xl bg-white rounded-t-[2rem] sm:rounded-[2rem] border border-stone-100 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-5 md:p-6 border-b border-stone-100 flex items-start justify-between gap-4">
                <div className="min-w-0 flex items-center gap-3">
                  <img
                    src={recipeImage(recipeDisplayName(selectedRecipe))}
                    alt=""
                    className="h-12 w-12 rounded-2xl object-cover border border-stone-100 bg-white shrink-0"
                  />
                  <div className="min-w-0">
                    <h2 className="text-xl font-black text-[#40068B] truncate">Editar receta</h2>
                    <p className="text-xs font-bold text-stone-400 mt-1 truncate">{recipeDisplayName(selectedRecipe)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRecipeModalOpen(false)}
                  className="h-10 w-10 rounded-2xl bg-stone-50 border border-stone-100 font-black text-stone-500"
                >
                  X
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <label className="block md:col-span-2">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">
                      Receta
                    </span>
                    <select
                      value={selectedRecipeId}
                      onChange={(e) => setSelectedRecipeId(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl bg-stone-50 border border-stone-100 font-bold outline-none"
                    >
                      {sortedRecipes.map((recipe) => (
                        <option key={recipe.id} value={recipe.id}>
                          {recipeDisplayName(recipe)} - ${money(recipe.costoUnitario)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">
                      Nombre
                    </span>
                    <input
                      value={recipeDisplayName(selectedRecipe)}
                      onChange={(e) => updateRecipe(selectedRecipe.id, { nombre: e.target.value })}
                      className="w-full h-11 px-3 rounded-xl bg-stone-50 border border-stone-100 font-bold outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">
                      Rend. receta
                    </span>
                    <input
                      type="number"
                      min="1"
                      value={selectedRecipe.rendimientoReceta}
                      onChange={(e) => updateRecipe(selectedRecipe.id, { rendimientoReceta: Number(e.target.value) })}
                      className="w-full h-11 px-3 rounded-xl bg-stone-50 border border-stone-100 font-bold outline-none text-right"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">
                      Rend. glaseado
                    </span>
                    <input
                      type="number"
                      min="1"
                      value={selectedRecipe.rendimientoGlaseado}
                      onChange={(e) => updateRecipe(selectedRecipe.id, { rendimientoGlaseado: Number(e.target.value) })}
                      className="w-full h-11 px-3 rounded-xl bg-stone-50 border border-stone-100 font-bold outline-none text-right"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-[#40068B]/5 border border-[#40068B]/10 p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Unitario</div>
                    <div className="mt-1 text-2xl font-black text-[#40068B]">${money(selectedRecipe.costoUnitario)}</div>
                  </div>
                  <div className="rounded-2xl bg-stone-50 border border-stone-100 p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Insumos</div>
                    <div className="mt-1 text-2xl font-black text-stone-900">${money(selectedRecipe.costoReceta)}</div>
                  </div>
                  <div className="rounded-2xl bg-stone-50 border border-stone-100 p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Glaseado</div>
                    <div className="mt-1 text-2xl font-black text-stone-900">${money(selectedRecipe.costoGlaseado)}</div>
                  </div>
                </div>

                <div className="rounded-2xl bg-stone-50 border border-stone-100 p-4">
                  <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 flex-1">
                      <label className="block md:col-span-2">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">
                          Nuevo ingrediente
                        </span>
                        <input
                          value={inlineIngredient.nombre}
                          onChange={(e) => setInlineIngredient((prev) => ({ ...prev, nombre: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl bg-white border border-stone-100 font-bold outline-none"
                          placeholder="Nombre"
                        />
                      </label>
                      <label className="block">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">
                          Unidad
                        </span>
                        <input
                          value={inlineIngredient.unidad}
                          onChange={(e) => setInlineIngredient((prev) => ({ ...prev, unidad: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl bg-white border border-stone-100 font-bold outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">
                          Envase
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={inlineIngredient.unidadesPorEnvase}
                          onChange={(e) => setInlineIngredient((prev) => ({ ...prev, unidadesPorEnvase: Number(e.target.value) }))}
                          className="w-full h-10 px-3 rounded-xl bg-white border border-stone-100 font-bold outline-none text-right"
                        />
                      </label>
                      <label className="block">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">
                          Costo
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={inlineIngredient.costoEnvase}
                          onChange={(e) => setInlineIngredient((prev) => ({ ...prev, costoEnvase: Number(e.target.value) }))}
                          className="w-full h-10 px-3 rounded-xl bg-white border border-stone-100 font-bold outline-none text-right"
                        />
                      </label>
                      <label className="block">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">
                          Proveedor
                        </span>
                        <input
                          value={inlineIngredient.proveedor}
                          onChange={(e) => setInlineIngredient((prev) => ({ ...prev, proveedor: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl bg-white border border-stone-100 font-bold outline-none"
                        />
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => addInlineIngredientToRecipe(selectedRecipe.id, "receta")}>
                        Crear en receta
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => addInlineIngredientToRecipe(selectedRecipe.id, "glaseado")}>
                        Crear en glaseado
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap justify-between items-center gap-3">
                  <div className="font-black text-[#40068B]">Ingredientes de la receta</div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => addRecipeLine(selectedRecipe.id, "receta")}>
                      + Linea receta
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => addRecipeLine(selectedRecipe.id, "glaseado")}>
                      + Linea glaseado
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-widest text-stone-400 border-b">
                        <th className="py-3 pr-3">Seccion</th>
                        <th className="py-3 pr-3">Ingrediente</th>
                        <th className="py-3 pr-3 text-right">Cantidad</th>
                        <th className="py-3 pr-3">Unidad</th>
                        <th className="py-3 pr-3 text-right">Costo unidad</th>
                        <th className="py-3 pr-3 text-right">Costo linea</th>
                        <th className="py-3 text-right">Accion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRecipe.lines.map((line) => (
                        <tr key={line.id} className="border-b border-stone-100 last:border-0">
                          <td className="py-2 pr-3">
                            <select
                              value={line.section}
                              onChange={(e) => updateRecipeLine(selectedRecipe.id, line.id, { section: e.target.value as CostingSection })}
                              className="w-32 h-10 px-3 rounded-xl bg-stone-50 border border-stone-100 font-bold outline-none"
                            >
                              <option value="receta">Receta</option>
                              <option value="glaseado">Glaseado</option>
                            </select>
                          </td>
                          <td className="py-2 pr-3">
                            <select
                              value={line.ingredientId || ""}
                              onChange={(e) => {
                                const ingredient = costing.ingredients.find((item) => item.id === e.target.value);
                                updateRecipeLine(selectedRecipe.id, line.id, {
                                  ingredientId: ingredient?.id || "",
                                  ingrediente: ingredient?.nombre || line.ingrediente,
                                  unidad: ingredient?.unidad || line.unidad,
                                  costoUnidad: ingredient?.costoUnidad ?? line.costoUnidad,
                                });
                              }}
                              className="w-full h-10 px-3 rounded-xl bg-stone-50 border border-stone-100 font-bold outline-none"
                            >
                              <option value="">Sin vincular</option>
                              {costing.ingredients.map((ingredient) => (
                                <option key={ingredient.id} value={ingredient.id}>
                                  {ingredient.nombre}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              min="0"
                              value={line.cantidad}
                              onChange={(e) => updateRecipeLine(selectedRecipe.id, line.id, { cantidad: Number(e.target.value) })}
                              className="w-28 h-10 px-3 rounded-xl bg-stone-50 border border-stone-100 font-bold outline-none text-right"
                            />
                          </td>
                          <td className="py-2 pr-3 font-bold text-stone-500">{line.unidad || "-"}</td>
                          <td className="py-2 pr-3 text-right font-bold">${money(line.costoUnidad)}</td>
                          <td className="py-2 pr-3 text-right font-black text-[#40068B]">${money(line.costoLinea)}</td>
                          <td className="py-2 text-right">
                            <button
                              type="button"
                              onClick={() => removeRecipeLine(selectedRecipe.id, line.id)}
                              className="h-10 px-3 rounded-xl bg-red-50 border border-red-100 text-red-600 font-black text-xs"
                            >
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-5 md:p-6 border-t border-stone-100 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <Button variant="danger" onClick={() => removeRecipe(selectedRecipe.id)}>
                  Eliminar receta
                </Button>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setRecipeModalOpen(false)}>
                    Cerrar
                  </Button>
                  <Button variant="secondary" disabled={saving} onClick={saveCosting}>
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
