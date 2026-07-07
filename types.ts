
export type TipoPedido = 'Personal' | 'Punto de venta';

export interface OrderQuantities {
  azucar: number;
  cafe: number;
  seasonal: number;
  cheesecake: number;
  chocolate: number;
  oreo: number;
  zanahoria: number;
}

export type StatusPagado = 'No pagado' | 'Pagado';
export type StatusOrder = 'Recibido' | 'Entregado';

export interface Order {
  id?: string;
  tipoPedido: TipoPedido;
  nombre: string;
  email: string;
  telefono?: string;
  puntoRecoleccion?: string;
  puntoVenta?: string;
  fechaEntrega: string; // ISO String
  quantities: OrderQuantities;
  totalDonas: number;
  precioTotal: number;
  statusPagado: StatusPagado;
  statusOrder: StatusOrder;
  createdAt: string;
  updatedAt: string;
}

export interface SeasonalConfig {
  currentSeasonalFlavor: string;
  blockedDateRanges: { start: string; end: string; message: string }[];
  defaultBlockedMessage: string;
}

export type CostingSection = 'receta' | 'glaseado';

export interface CostingIngredient {
  id: string;
  nombre: string;
  unidad: string;
  unidadesPorEnvase: number;
  costoEnvase: number;
  costoUnidad: number;
  proveedor?: string;
  marca?: string;
}

export interface CostingIngredientHistoryEntry {
  id: string;
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
  source: 'manual' | 'import';
}

export interface CostingRecipeLine {
  id: string;
  section: CostingSection;
  ingredientId?: string;
  ingrediente: string;
  cantidad: number;
  unidad?: string;
  costoUnidad?: number;
  costoLinea: number;
}

export interface CostingRecipe {
  id: string;
  nombre: string;
  producto: string;
  rendimientoReceta: number;
  rendimientoGlaseado: number;
  costoReceta: number;
  costoGlaseado: number;
  costoUnitario: number;
  lines: CostingRecipeLine[];
}

export interface CostingIndirectItem {
  id: string;
  categoria: string;
  concepto: string;
  frecuencia: string;
  costo: number;
  costoMensual: number;
}

export interface CostingData {
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
}
