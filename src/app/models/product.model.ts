export interface Product {
  id?: number;
  categoria_id: number | null;
  categoria_nombre?: string;
  nombre: string;
  descripcion?: string | null;
  precio_venta: number;
  precio_costo?: number;
  stock_actual: number;
  control_stock?: boolean | number;
  es_combo?: boolean | number;
  activo?: boolean | number;
}
