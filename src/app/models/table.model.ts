export type TableState = 'abierta' | 'cerrada';

export interface DiningTable {
  id?: number;
  numero: string;
  capacidad: number;
  estado: TableState;
  estado_db?: string;
  orden_activa_id?: number | null;
  created_at?: string;
}
