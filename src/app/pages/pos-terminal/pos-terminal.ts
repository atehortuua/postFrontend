import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Product } from '../../models/product.model';
import { DiningTable } from '../../models/table.model';
import { CashShift } from '../../models/user.model';
import { AuthService } from '../../services/auth';
import { CategoryService } from '../../services/category';
import { ProductService } from '../../services/product';
import { TableService } from '../../services/table';
import { Category } from '../categories/category.model';

export interface CartItem {
  product: Product;
  quantity: number;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  selector: 'app-pos-terminal',
  templateUrl: './pos-terminal.html',
  styleUrl: './pos-terminal.scss'
})
export class PosTerminalComponent implements OnInit {
  categories: Category[] = [];
  products: Product[] = [];
  tables: DiningTable[] = [];

  selectedCategoryId: number | null = null;
  searchTerm = '';

  isLoading = true;
  activeShift: CashShift | null = null;

  // Carrito / Comanda y Asignación de Mesa vs Domicilio
  cart: CartItem[] = [];
  orderType: 'mesa' | 'delivery' | 'para_llevar' = 'mesa';
  selectedTableId: number | null = null;
  deliveryAddress = '';
  keepTableOpenOnOrder = false; // Si true, crea la orden dejando la mesa en estado 'abierta'; si false, cobra y cierra o mantiene según acción

  paymentMethod: 'efectivo' | 'tarjeta_debito' | 'transferencia' = 'efectivo';
  cashReceived = 0;
  isProcessingSale = false;

  // Seguimiento local de movimientos de efectivo del turno para el Arqueo exacto (Paso 5)
  cashInTotal = 0;
  cashOutTotal = 0;

  // Modal de Apertura de Turno si no hay uno activo
  showOpenShiftPrompt = false;
  initialCashAmount = 100000;

  // Modal de Movimiento de Caja (Entrada / Salida)
  showMovementModal = false;
  movementType: 'entrada' | 'salida' = 'salida';
  movementReason = '';
  movementAmount = 0;

  // Modal de Cierre de Turno (Cierre Z)
  showCloseShiftModal = false;
  countedCash = 0;
  nextDayFund = 50000;

  toast: { message: string; type: 'success' | 'error' | 'info' } | null = null;

  constructor(
    public authService: AuthService,
    private categoryService: CategoryService,
    private productService: ProductService,
    private tableService: TableService,
    private http: HttpClient,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadTerminalData();
  }

  loadTerminalData(): void {
    this.isLoading = true;
    this.authService.getActiveShift().subscribe({
      next: (res) => {
        this.activeShift = res.turno;
        if (this.activeShift) {
          this.cashInTotal = (this.activeShift as any).total_entradas ?? this.cashInTotal;
          this.cashOutTotal = (this.activeShift as any).total_salidas ?? this.cashOutTotal;
        }
        if (!this.activeShift && !this.authService.bypassPermissionsSignal()) {
          this.showOpenShiftPrompt = true;
        }
        this.cdr.markForCheck();
      }
    });

    this.tableService.getTables().subscribe({
      next: (tbls) => {
        this.tables = tbls;
        // Si estamos en modalidad 'mesa' y no hay mesa seleccionada, preseleccionar la primera mesa 'cerrada' (disponible)
        if (this.orderType === 'mesa' && !this.selectedTableId) {
          const firstAvailable = this.tables.find((t) => t.estado === 'cerrada');
          this.selectedTableId = firstAvailable?.id ?? null;
        }
        this.cdr.markForCheck();
      }
    });

    this.categoryService.getCategories().subscribe({
      next: (cats) => {
        this.categories = Array.isArray(cats) ? cats : [];
        this.cdr.markForCheck();
      }
    });

    this.productService.getProducts().subscribe({
      next: (prods) => {
        this.products = Array.isArray(prods) ? prods : [];
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Regla 2 y Regla 3:
   * Cambia el tipo de orden. Si es 'delivery' (Domicilio) o 'para_llevar',
   * anula inmediatamente cualquier mesa seleccionada (selectedTableId = null).
   */
  setOrderType(type: 'mesa' | 'delivery' | 'para_llevar'): void {
    this.orderType = type;
    if (type === 'delivery' || type === 'para_llevar') {
      // Regla 3: Excepción estricta para Domicilios -> se anula la mesa
      this.selectedTableId = null;
    } else if (type === 'mesa' && !this.selectedTableId) {
      const available = this.tables.find((t) => t.estado === 'cerrada');
      this.selectedTableId = available?.id ?? null;
    }
  }

  selectTableForOrder(table: DiningTable): void {
    if (this.orderType !== 'mesa') return;
    this.selectedTableId = table.id ?? null;
  }

  get selectedTableObj(): DiningTable | undefined {
    if (!this.selectedTableId) return undefined;
    return this.tables.find((t) => t.id === this.selectedTableId);
  }

  get openTables(): DiningTable[] {
    return this.tables.filter((t) => t.estado === 'abierta');
  }

  selectCategory(catId: number | null): void {
    this.selectedCategoryId = catId;
  }

  get filteredProducts(): Product[] {
    return this.products.filter((p) => {
      if (this.selectedCategoryId !== null && p.categoria_id !== this.selectedCategoryId) {
        return false;
      }
      if (this.searchTerm.trim()) {
        const term = this.searchTerm.toLowerCase();
        return p.nombre.toLowerCase().includes(term) || (p.descripcion?.toLowerCase().includes(term) ?? false);
      }
      return true;
    });
  }

  getProductCountForCategory(catId: number): number {
    return this.products.filter((p) => p.categoria_id === catId).length;
  }

  // ==========================================
  // OPERACIÓN DE CARRITO / COMANDA
  // ==========================================
  addToCart(product: Product): void {
    if (product.control_stock && product.stock_actual <= 0) {
      this.showToast(`"${product.nombre}" está agotado`, 'error');
      return;
    }

    const existing = this.cart.find((item) => item.product.id === product.id);
    if (existing) {
      if (product.control_stock && existing.quantity + 1 > product.stock_actual) {
        this.showToast(`Stock máximo alcanzado (${product.stock_actual} disp.)`, 'info');
        return;
      }
      existing.quantity++;
    } else {
      this.cart.push({ product, quantity: 1 });
    }
    this.cashReceived = this.cartTotal;
  }

  updateQuantity(item: CartItem, delta: number): void {
    const nextQty = item.quantity + delta;
    if (nextQty <= 0) {
      this.cart = this.cart.filter((i) => i.product.id !== item.product.id);
    } else if (item.product.control_stock && nextQty > item.product.stock_actual) {
      this.showToast(`Solo hay ${item.product.stock_actual} unidades disponibles`, 'info');
      return;
    } else {
      item.quantity = nextQty;
    }
    this.cashReceived = this.cartTotal;
  }

  clearCart(): void {
    this.cart = [];
    this.cashReceived = 0;
  }

  get cartTotal(): number {
    return this.cart.reduce((sum, item) => sum + item.product.precio_venta * item.quantity, 0);
  }

  get changeDue(): number {
    if (this.paymentMethod !== 'efectivo') return 0;
    return Math.max(0, (this.cashReceived || 0) - this.cartTotal);
  }

  // ==========================================
  // CREAR ORDEN EN MESA (DEJAR MESA 'ABIERTA') O COBRAR Y CERRAR
  // ==========================================
  async processOrderAndState(onlyOpenOrderOnTable: boolean = false): Promise<void> {
    if (this.cart.length === 0) return;

    // Validar selección de mesa si el pedido es En Mesa
    if (this.orderType === 'mesa' && !this.selectedTableId) {
      this.showToast('Selecciona una mesa para asociar a la orden (o elige Domicilio)', 'error');
      return;
    }

    // Si no hay turno activo, abrimos uno automático si está en modo Bypass o pedimos apertura
    if (!this.activeShift) {
      if (this.authService.bypassPermissionsSignal()) {
        try {
          const user = this.authService.currentUserSignal();
          await firstValueFrom(this.authService.openShift(100000, user?.id || 1));
          const shiftRes = await firstValueFrom(this.authService.getActiveShift());
          this.activeShift = shiftRes.turno;
        } catch {
          // Si ya existía turno o falla, continuamos
        }
      } else {
        this.showOpenShiftPrompt = true;
        return;
      }
    }

    if (!onlyOpenOrderOnTable && this.paymentMethod === 'efectivo' && this.cashReceived < this.cartTotal) {
      this.showToast('El monto recibido es menor al total de la orden', 'error');
      return;
    }

    this.isProcessingSale = true;
    try {
      // Regla 2 y 3: Si es 'mesa', enviamos el selectedTableId; si es 'delivery' (Domicilio) o 'para_llevar', mesa_id es estrictamente null
      const mesaIdPayload = this.orderType === 'mesa' ? this.selectedTableId : null;

      // Si la mesa estaba en estado 'abierta', liberarla primero en el backend si se va a reemplazar la orden
      const targetTable = this.selectedTableObj;
      if (mesaIdPayload && targetTable && targetTable.estado === 'abierta') {
        await firstValueFrom(this.tableService.releaseTable(mesaIdPayload));
      }

      // 1. Crear la orden en el backend (cambia la mesa a 'abierta' / 'ocupada' en BD)
      const orderRes: any = await firstValueFrom(
        this.http.post('http://localhost:3000/api/orders', {
          mesa_id: mesaIdPayload,
          tipo: this.orderType
        })
      );
      const ordenId = orderRes.orden_id;

      // 2. Insertar los ítems de la orden
      for (const item of this.cart) {
        await firstValueFrom(
          this.http.post('http://localhost:3000/api/orders/items', {
            orden_id: ordenId,
            producto_id: item.product.id,
            cantidad: item.quantity,
            precio_unitario: item.product.precio_venta,
            notas: this.orderType === 'delivery' && this.deliveryAddress ? `Domicilio: ${this.deliveryAddress}` : null
          })
        );
      }

      if (onlyOpenOrderOnTable && this.orderType === 'mesa' && mesaIdPayload) {
        // Regla 4: Dejar la mesa en estado estricto 'abierta' con la orden activa
        await firstValueFrom(this.tableService.updateTableStatus(mesaIdPayload, 'abierta'));
        this.showToast(
          `🍽️ Orden #${ordenId} enviada a Mesa ${targetTable?.numero}. Estado de mesa: ABIERTA`,
          'success'
        );
      } else {
        // 3. Procesar el pago y dejar la mesa en estado 'cerrada' (si aplicaba mesa)
        if (this.activeShift) {
          await firstValueFrom(
            this.http.post('http://localhost:3000/api/cash/pay', {
              orden_id: ordenId,
              turno_caja_id: this.activeShift.id,
              metodo: this.paymentMethod,
              monto: this.cartTotal,
              monto_recibido: this.paymentMethod === 'efectivo' ? this.cashReceived : this.cartTotal
            })
          );
        }

        if (mesaIdPayload) {
          await firstValueFrom(this.tableService.releaseTable(mesaIdPayload));
        }

        const msgPrefix =
          this.orderType === 'delivery'
            ? `🛵 Pedido a Domicilio #${ordenId} cobrado (Sin mesa asignada)`
            : this.orderType === 'mesa'
              ? `✅ Orden #${ordenId} (Mesa ${targetTable?.numero}) cobrada • Mesa CERRADA`
              : `🛍️ Orden Para Llevar #${ordenId} cobrada con éxito`;

        this.showToast(msgPrefix, 'success');
      }

      this.clearCart();
      this.deliveryAddress = '';
      this.loadTerminalData();
    } catch (err: any) {
      this.showToast(err?.error?.error || 'Error al procesar la orden', 'error');
    } finally {
      this.isProcessingSale = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Permite al cajero cerrar/liberar una mesa que estaba 'abierta' cuando el cliente termina y paga.
   */
  closeActiveTable(table: DiningTable): void {
    if (!table.id) return;
    this.tableService.releaseTable(table.id).subscribe({
      next: () => {
        table.estado = 'cerrada';
        table.orden_activa_id = null;
        this.showToast(`Mesa ${table.numero} cambiada a estado CERRADA`, 'success');
        this.loadTerminalData();
      },
      error: () => {
        this.showToast('No se pudo cerrar la mesa', 'error');
      }
    });
  }

  // ==========================================
  // OPERACIONES DE TURNO DE CAJA Y ARQUEO (PASO 5)
  // ==========================================
  get expectedDrawerCash(): number {
    if (!this.activeShift) return 0;
    return (
      (this.activeShift.monto_inicial || 0) +
      (this.activeShift.total_ventas_efectivo || 0) +
      this.cashInTotal -
      this.cashOutTotal
    );
  }

  get cashDifference(): number {
    return (this.countedCash || 0) - this.expectedDrawerCash;
  }

  openShiftNow(): void {
    const user = this.authService.currentUserSignal();
    this.authService.openShift(this.initialCashAmount, user?.id || 1).subscribe({
      next: () => {
        this.showOpenShiftPrompt = false;
        this.showToast('Turno de caja abierto exitosamente', 'success');
        this.loadTerminalData();
      },
      error: (err) => {
        if (err?.status === 409) {
          this.showOpenShiftPrompt = false;
          this.loadTerminalData();
        } else {
          this.showToast(err?.error?.error || 'No se pudo abrir turno', 'error');
        }
      }
    });
  }

  submitMovement(): void {
    if (!this.activeShift || !this.movementReason.trim() || this.movementAmount <= 0) {
      this.showToast('Completa el motivo y un monto válido', 'error');
      return;
    }

    const type = this.movementType;
    const amt = Number(this.movementAmount);

    this.authService.registerCashMovement(
      this.activeShift.id,
      type,
      this.movementReason.trim(),
      amt
    ).subscribe({
      next: () => {
        if (type === 'entrada') this.cashInTotal += amt;
        if (type === 'salida') this.cashOutTotal += amt;
        this.showMovementModal = false;
        this.movementReason = '';
        this.movementAmount = 0;
        this.showToast('Movimiento de caja registrado e incluido en el arqueo', 'success');
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.showToast(err?.error?.error || 'Error al registrar movimiento', 'error');
      }
    });
  }

  openCloseShiftModal(): void {
    if (!this.activeShift) return;
    this.countedCash = this.expectedDrawerCash;
    this.showCloseShiftModal = true;
  }

  confirmCloseShift(): void {
    if (!this.activeShift) return;
    this.authService.closeShift(this.activeShift.id, this.countedCash, this.nextDayFund).subscribe({
      next: () => {
        this.showCloseShiftModal = false;
        this.authService.logout();
        this.router.navigate(['/start-day']);
      },
      error: (err) => {
        this.showToast(err?.error?.error || 'Error al cerrar turno', 'error');
      }
    });
  }

  toggleBypass(): void {
    const active = this.authService.toggleBypassPermissions();
    this.showToast(
      active ? '🔓 Bypass de Permisos ACTIVADO' : '🔒 Bypass de Permisos DESACTIVADO',
      'info'
    );
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/start-day']);
  }

  showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    this.toast = { message, type };
    setTimeout(() => {
      this.toast = null;
      this.cdr.markForCheck();
    }, 3800);
    this.cdr.markForCheck();
  }
}
