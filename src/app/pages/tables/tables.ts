import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { DiningTable, TableState } from '../../models/table.model';
import { AuthService } from '../../services/auth';
import { TableService } from '../../services/table';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule],
  selector: 'app-tables',
  templateUrl: './tables.html',
  styleUrl: './tables.scss'
})
export class TablesComponent implements OnInit {
  tables: DiningTable[] = [];
  isLoading = true;
  isSubmitting = false;

  stateFilter: 'all' | 'abierta' | 'cerrada' = 'all';

  showCreateModal = false;
  tableForm: FormGroup;

  toast: { message: string; type: 'success' | 'error' | 'info' } | null = null;

  // Capacidades frecuentes para selección rápida
  capacityPresets: number[] = [2, 4, 6, 8];

  constructor(
    private fb: FormBuilder,
    private tableService: TableService,
    public authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.tableForm = this.fb.group({
      numero: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(20)]],
      capacidad: [4, [Validators.required, Validators.min(1), Validators.max(30)]],
      estado: ['cerrada', [Validators.required]]
    });
  }

  ngOnInit(): void {
    this.loadTables();
  }

  loadTables(): void {
    this.isLoading = true;
    this.tableService.getTables().subscribe({
      next: (data) => {
        this.tables = data;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.tables = [];
        this.isLoading = false;
        this.showToast('No se pudieron cargar las mesas desde el backend', 'error');
        this.cdr.markForCheck();
      }
    });
  }

  get filteredTables(): DiningTable[] {
    if (this.stateFilter === 'all') return this.tables;
    return this.tables.filter((t) => t.estado === this.stateFilter);
  }

  get openTablesCount(): number {
    return this.tables.filter((t) => t.estado === 'abierta').length;
  }

  get closedTablesCount(): number {
    return this.tables.filter((t) => t.estado === 'cerrada').length;
  }

  openCreateModal(): void {
    const nextNum = `M${this.tables.length + 1}`;
    this.tableForm.reset({
      numero: nextNum,
      capacidad: 4,
      estado: 'cerrada'
    });
    this.showCreateModal = true;
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
  }

  setCapacityPreset(cap: number): void {
    this.tableForm.patchValue({ capacidad: cap });
  }

  createTable(): void {
    if (this.tableForm.invalid) {
      this.tableForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const val = this.tableForm.value;

    this.tableService
      .createTable({
        numero: val.numero,
        capacidad: Number(val.capacidad),
        estado: val.estado as TableState
      })
      .subscribe({
        next: (created) => {
          this.isSubmitting = false;
          this.showCreateModal = false;
          this.showToast(`Mesa "${created.numero}" registrada exitosamente en estado ${created.estado.toUpperCase()}`, 'success');
          this.loadTables();
        },
        error: (err) => {
          this.isSubmitting = false;
          this.showToast(err?.error?.error || 'Error al registrar la mesa (verifica que el número sea único)', 'error');
          this.cdr.markForCheck();
        }
      });
  }

  /**
   * Alterna estrictamente el estado de la mesa entre 'abierta' y 'cerrada'.
   */
  toggleTableState(table: DiningTable): void {
    if (!table.id) return;
    const nextState: TableState = table.estado === 'abierta' ? 'cerrada' : 'abierta';

    const obs =
      nextState === 'cerrada'
        ? this.tableService.releaseTable(table.id)
        : this.tableService.updateTableStatus(table.id, 'abierta');

    obs.subscribe({
      next: () => {
        table.estado = nextState;
        if (nextState === 'cerrada') {
          table.orden_activa_id = null;
        }
        this.showToast(`Mesa "${table.numero}" cambiada a estado ${nextState.toUpperCase()}`, 'info');
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.showToast(err?.error?.error || 'No se pudo cambiar el estado de la mesa', 'error');
      }
    });
  }

  toggleBypass(): void {
    const active = this.authService.toggleBypassPermissions();
    this.showToast(
      active
        ? '⚡ Bypass de Permisos ACTIVADO: Acceso libre para pruebas entre Admin y Cajero'
        : '🔒 Seguridad Estricta ACTIVADA: Permisos validados por rol',
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
    }, 3500);
    this.cdr.markForCheck();
  }
}
