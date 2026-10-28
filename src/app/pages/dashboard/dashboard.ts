import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { TableService } from '../../services/table';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  selector: 'app-dashboard',
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class DashboardComponent implements OnInit {
  isLoading = true;
  summary: any = {
    fecha: new Date().toISOString().split('T')[0],
    total_ventas: 0,
    total_ordenes: 0,
    ventas_por_metodo: [],
    top_productos: [],
    mesas_ocupadas: 0
  };

  cashClosures: any[] = [];
  fechaInicio = '';
  fechaFin = '';

  openTablesCount = 0;
  closedTablesCount = 0;

  constructor(
    public authService: AuthService,
    private tableService: TableService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadDashboard();
    this.loadCashClosures();
  }

  loadDashboard(): void {
    this.isLoading = true;
    this.authService.getDashboardSummary().subscribe({
      next: (data) => {
        if (data) {
          this.summary = data;
        }
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });

    this.tableService.getTables().subscribe({
      next: (tables) => {
        this.openTablesCount = tables.filter((t) => t.estado === 'abierta').length;
        this.closedTablesCount = tables.filter((t) => t.estado === 'cerrada').length;
        this.cdr.markForCheck();
      }
    });
  }

  loadCashClosures(): void {
    this.authService.getCashClosuresReport(this.fechaInicio, this.fechaFin).subscribe({
      next: (rows) => {
        this.cashClosures = Array.isArray(rows) ? rows : [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.cashClosures = [];
        this.cdr.markForCheck();
      }
    });
  }

  filterClosures(): void {
    this.loadCashClosures();
  }

  clearDateFilter(): void {
    this.fechaInicio = '';
    this.fechaFin = '';
    this.loadCashClosures();
  }

  absVal(val: number): number {
    return Math.abs(val || 0);
  }

  toggleBypass(): void {
    this.authService.toggleBypassPermissions();
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/start-day']);
  }
}
