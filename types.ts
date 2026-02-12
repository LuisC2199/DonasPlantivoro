
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
