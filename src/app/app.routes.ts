import { Routes } from '@angular/router';
import { CategoriesComponent } from './pages/categories/categories';

export const routes: Routes = [
  { path: '', redirectTo: 'categories', pathMatch: 'full' },
  { path: 'categories', component: CategoriesComponent },
];
