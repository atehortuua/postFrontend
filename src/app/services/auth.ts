import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Observable, finalize, map, of, shareReplay, tap } from 'rxjs';
import { AuthResponse, CashShift, User } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private baseUrl = 'http://localhost:3000/api';
  private readonly TOKEN_KEY = 'artisan_pos_token';
  private readonly USER_KEY = 'artisan_pos_user';
  private readonly BYPASS_KEY = 'artisan_pos_bypass_permissions';
  private pendingLogin$: Observable<string | null> | null = null;

  // Estado reactivo con Signals de Angular
  currentUserSignal = signal<User | null>(this.getStoredUser());
  activeShiftSignal = signal<CashShift | null>(null);

  // Regla 5: Mecanismo de Bypass de Permisos para pruebas y validaciones ágiles
  bypassPermissionsSignal = signal<boolean>(this.getStoredBypass());

  constructor(private http: HttpClient) {
    // Si el bypass está activo y no hay token JWT, aprovisionar sesión real con el backend automáticamente
    if (this.bypassPermissionsSignal() && !this.getToken()) {
      this.ensureBypassSession();
    }
  }

  /**
   * Activa o desactiva el modo Bypass de Permisos en tiempo real.
   */
  toggleBypassPermissions(forceValue?: boolean): boolean {
    const nextVal = forceValue !== undefined ? forceValue : !this.bypassPermissionsSignal();
    this.bypassPermissionsSignal.set(nextVal);
    localStorage.setItem(this.BYPASS_KEY, JSON.stringify(nextVal));

    if (nextVal && !this.getToken()) {
      this.ensureBypassSession();
    }
    return nextVal;
  }

  /**
   * Garantiza un token JWT válido del backend cuando está activo el modo Bypass,
   * compartiendo la misma petición entre llamadas concurrentes.
   */
  ensureValidToken$(forceRefresh = false): Observable<string | null> {
    const existing = this.getToken();
    if (existing && !forceRefresh) {
      return of(existing);
    }

    if (this.pendingLogin$) {
      return this.pendingLogin$;
    }

    this.pendingLogin$ = this.login('admin', 'admin123').pipe(
      map((res) => res.token),
      finalize(() => {
        this.pendingLogin$ = null;
      }),
      shareReplay(1)
    );

    return this.pendingLogin$;
  }

  /**
   * Obtiene un token válido automáticamente en modo Bypass para que las llamadas
   * al backend pasen sin bloqueos durante las pruebas.
   */
  ensureBypassSession(): void {
    const fallbackAdmin: User = {
      id: 1,
      username: 'admin',
      nombre: 'Administrador (Modo Bypass)',
      rol: 'admin',
      activo: 1
    };

    if (!this.currentUserSignal()) {
      this.currentUserSignal.set(fallbackAdmin);
      localStorage.setItem(this.USER_KEY, JSON.stringify(fallbackAdmin));
    }

    if (!this.getToken()) {
      this.ensureValidToken$().subscribe({
        error: () => {
          // Mantiene el usuario local en modo bypass si el backend aún no está encendido
        }
      });
    }
  }

  private getStoredBypass(): boolean {
    const raw = localStorage.getItem(this.BYPASS_KEY);
    if (raw === null) {
      // Activado por defecto para facilitar pruebas de los flujos de mesas, órdenes y domicilios
      localStorage.setItem(this.BYPASS_KEY, 'true');
      return true;
    }
    try {
      return JSON.parse(raw) === true;
    } catch {
      return true;
    }
  }

  /**
   * Obtiene los operadores activos para la pantalla de "Iniciar el Día".
   */
  getOperators(): Observable<User[]> {
    return this.http.get<User[]>(`${this.baseUrl}/auth/operators?t=${Date.now()}`);
  }

  /**
   * Autentica un operador con su username y contraseña/PIN.
   */
  login(username: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/login`, { username, password }).pipe(
      tap((res) => {
        localStorage.setItem(this.TOKEN_KEY, res.token);
        localStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
        this.currentUserSignal.set(res.user);
      })
    );
  }

  /**
   * Cierra la sesión actual del operador.
   */
  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.currentUserSignal.set(null);
    this.activeShiftSignal.set(null);
  }

  /**
   * Obtiene el token JWT almacenado.
   */
  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  private getStoredUser(): User | null {
    const raw = localStorage.getItem(this.USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }

  /**
   * Verifica si hay un usuario autenticado o si el Bypass de Permisos está habilitado.
   */
  isAuthenticated(): boolean {
    if (this.bypassPermissionsSignal()) {
      return true;
    }
    const token = this.getToken();
    const user = this.currentUserSignal();
    return Boolean(token && user);
  }

  isAdmin(): boolean {
    if (this.bypassPermissionsSignal()) return true;
    return this.currentUserSignal()?.rol === 'admin';
  }

  isCashier(): boolean {
    return this.currentUserSignal()?.rol === 'cajero';
  }

  // ==========================================================
  // GESTIÓN DE TURNOS DE CAJA ("INICIAR EL DÍA")
  // ==========================================================
  getActiveShift(): Observable<{ message?: string; turno: CashShift | null }> {
    return this.http.get<{ message?: string; turno: CashShift | null }>(`${this.baseUrl}/cash/active?t=${Date.now()}`).pipe(
      tap((res) => {
        this.activeShiftSignal.set(res.turno || null);
      })
    );
  }

  openShift(monto_inicial: number, cajero_id: number): Observable<{ turno_id: number; monto_inicial: number; estado: string }> {
    return this.http.post<{ turno_id: number; monto_inicial: number; estado: string }>(
      `${this.baseUrl}/cash/open`,
      { monto_inicial, cajero_id }
    );
  }

  closeShift(turno_id: number, monto_real_contado: number, fondo_manana: number = 0): Observable<any> {
    return this.http.post(`${this.baseUrl}/cash/close`, {
      turno_id,
      monto_real_contado,
      fondo_manana
    }).pipe(
      tap(() => this.activeShiftSignal.set(null))
    );
  }

  registerCashMovement(turno_id: number, tipo: 'entrada' | 'salida', motivo: string, monto: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/cash/movement`, { turno_id, tipo, motivo, monto });
  }

  // ==========================================================
  // GESTIÓN DE PERSONAL / CAJEROS Y REPORTES (ADMIN)
  // ==========================================================
  getAllUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.baseUrl}/admin/cashiers?t=${Date.now()}`);
  }

  createUser(data: { username: string; nombre: string; password: string; rol: string }): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/admin/cashiers`, data);
  }

  updateUser(id: number, data: Partial<User> & { password?: string }): Observable<User> {
    return this.http.patch<User>(`${this.baseUrl}/admin/cashiers/${id}`, data);
  }

  deleteUser(id: number): Observable<string> {
    return this.http.delete(`${this.baseUrl}/admin/cashiers/${id}`, { responseType: 'text' });
  }

  getDashboardSummary(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/admin/dashboard?t=${Date.now()}`);
  }

  getCashClosuresReport(fechaInicio?: string, fechaFin?: string): Observable<any[]> {
    let url = `${this.baseUrl}/admin/reports/cash-closures?t=${Date.now()}`;
    if (fechaInicio && fechaFin) {
      url += `&fecha_inicio=${encodeURIComponent(fechaInicio)}&fecha_fin=${encodeURIComponent(fechaFin)}`;
    }
    return this.http.get<any[]>(url);
  }
}
