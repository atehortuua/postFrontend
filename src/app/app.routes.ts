import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';
import { CashiersComponent } from './pages/cashiers/cashiers';
import { CategoriesComponent } from './pages/categories/categories';
import { DashboardComponent } from './pages/dashboard/dashboard';
import { PosTerminalComponent } from './pages/pos-terminal/pos-terminal';
import { StartDayComponent } from './pages/start-day/start-day';
import { TablesComponent } from './pages/tables/tables';

export const routes: Routes = [
  { path: '', redirectTo: 'start-day', pathMatch: 'full' },
  { path: 'start-day', component: StartDayComponent },

  // ==========================================================
  // ZONA DE ADMINISTRADOR (Catálogo, Mesas, Personal y Dashboard)
  // ==========================================================
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard],
    data: { expectedRole: 'admin' },
    children: [
      { path: '', redirectTo: 'catalog', pathMatch: 'full' },
      { path: 'catalog', component: CategoriesComponent },
      { path: 'tables', component: TablesComponent },
      { path: 'cashiers', component: CashiersComponent },
      { path: 'dashboard', component: DashboardComponent }
    ]
  },

  // Rutas directas de compatibilidad
  { path: 'categories', redirectTo: 'admin/catalog', pathMatch: 'full' },
  { path: 'tables', redirectTo: 'admin/tables', pathMatch: 'full' },

  // ==========================================================
  // ZONA OPERATIVA DE CAJERO (Caja, Asignación de Mesas y Domicilios)
  // ==========================================================
  {
    path: 'pos',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['cajero', 'admin'] },
    children: [
      { path: '', redirectTo: 'terminal', pathMatch: 'full' },
      { path: 'terminal', component: PosTerminalComponent }
    ]
  },

  { path: '**', redirectTo: 'start-day' }
];
