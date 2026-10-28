import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

/**
 * Guard de autenticación con soporte para Bypass de Permisos temporal en pruebas.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Regla 5: Si el Bypass de Permisos está activo, garantiza sesión de pruebas y permite acceso inmediato
  if (authService.bypassPermissionsSignal()) {
    authService.ensureBypassSession();
    return true;
  }

  if (authService.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/start-day']);
};
