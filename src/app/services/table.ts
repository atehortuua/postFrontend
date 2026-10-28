import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of, switchMap } from 'rxjs';
import { DiningTable, TableState } from '../models/table.model';

@Injectable({
  providedIn: 'root'
})
export class TableService {
  private apiUrl = 'http://localhost:3000/api/tables';

  constructor(private http: HttpClient) {}

  /**
   * Normaliza cualquier estado proveniente de SQLite al estándar estricto
   * de negocio: 'abierta' (con orden activa / en atención) o 'cerrada' (sin orden / disponible).
   */
  normalizeState(rawState?: string, ordenActivaId?: number | null): TableState {
    if (rawState === 'abierta' || rawState === 'ocupada' || rawState === 'en_cobro' || Boolean(ordenActivaId)) {
      return 'abierta';
    }
    return 'cerrada';
  }

  /**
   * Obtiene todas las mesas registradas en el backend y normaliza su estado
   * estrictamente a 'abierta' o 'cerrada'.
   */
  getTables(): Observable<DiningTable[]> {
    return this.http.get<any[]>(`${this.apiUrl}?t=${Date.now()}`).pipe(
      map((rows) =>
        (Array.isArray(rows) ? rows : []).map((r) => ({
          id: r.id,
          numero: r.numero,
          capacidad: r.capacidad ?? 4,
          estado: this.normalizeState(r.estado, r.orden_activa_id),
          estado_db: r.estado,
          orden_activa_id: r.orden_activa_id ?? null,
          created_at: r.created_at
        }))
      )
    );
  }

  /**
   * Crea una nueva mesa en el backend (Operación de Administrador).
   */
  createTable(payload: { numero: string; capacidad: number; estado?: TableState }): Observable<DiningTable> {
    return this.http.post<any>(this.apiUrl, {
      numero: payload.numero.trim(),
      capacidad: payload.capacidad
    }).pipe(
      switchMap((created) => {
        const tableId = created.id;
        if (payload.estado === 'abierta' && tableId) {
          return this.updateTableStatus(tableId, 'abierta').pipe(
            map(() => ({
              id: tableId,
              numero: payload.numero.trim(),
              capacidad: payload.capacidad,
              estado: 'abierta' as TableState,
              orden_activa_id: null
            }))
          );
        }
        return of({
          id: tableId,
          numero: payload.numero.trim(),
          capacidad: payload.capacidad,
          estado: 'cerrada' as TableState,
          orden_activa_id: null
        });
      })
    );
  }

  /**
   * Actualiza el estado de una mesa entre 'abierta' y 'cerrada'.
   * Soporta tanto el esquema SQLite nuevo ('abierta'/'cerrada') como el legacy ('ocupada'/'libre').
   */
  updateTableStatus(id: number, targetState: TableState): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/status`, { estado: targetState }).pipe(
      catchError(() => {
        // Fallback automático si el CHECK constraint de SQLite aún espera 'ocupada' / 'libre'
        const legacyStatus = targetState === 'abierta' ? 'ocupada' : 'libre';
        return this.http.patch(`${this.apiUrl}/${id}/status`, { estado: legacyStatus });
      })
    );
  }

  /**
   * Cierra/libera una mesa y limpia su orden activa, dejándola en estado 'cerrada'.
   */
  releaseTable(id: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/release`, {}).pipe(
      catchError(() => this.updateTableStatus(id, 'cerrada'))
    );
  }
}
