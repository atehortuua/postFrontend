import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

/**
 * Guard de autorización por roles (RBAC) con soporte para Bypass de Permisos temporal.
 */
export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Regla 5: Salto temporal de permisos para facilitar pruebas y validaciones de flujos
  if (authService.bypassPermissionsSignal()) {
    authService.ensureBypassSession();
    return true;
  }

  const user = authService.currentUserSignal();
  if (!user || !authService.isAuthenticated()) {
    return router.createUrlTree(['/start-day']);
  }

  const expectedRoles: string[] = route.data['roles'] || [route.data['expectedRole']];

  if (expectedRoles.includes(user.rol)) {
    return true;
  }

  if (user.rol === 'cajero') {
    return router.createUrlTree(['/pos/terminal']);
  }

  if (user.rol === 'admin') {
    return router.createUrlTree(['/admin/catalog']);
  }

  return router.createUrlTree(['/start-day']);
};
