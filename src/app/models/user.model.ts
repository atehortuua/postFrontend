export type UserRole = 'admin' | 'cajero' | 'cocinero' | 'mesero';

export interface User {
  id: number;
  username: string;
  nombre: string;
  rol: UserRole;
  activo?: number | boolean;
  created_at?: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

export interface CashShift {
  id: number;
  cajero_id: number;
  monto_inicial: number;
  monto_final?: number;
  total_ventas_efectivo: number;
  total_ventas_tarjeta: number;
  total_ventas_transferencia: number;
  total_ventas_otros: number;
  estado: 'abierta' | 'cerrada';
  fecha_apertura: string;
  fecha_cierre?: string;
}
