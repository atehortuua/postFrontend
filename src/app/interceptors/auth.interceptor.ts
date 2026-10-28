import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth';

/**
 * Interceptor funcional HTTP que adjunta el token JWT en la cabecera Authorization.
 * Si el modo Bypass está activo y aún no hay token (o expiró con 401/403), obtiene un
 * token válido del backend automáticamente y reintenta la petición hacia SQLite.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();
  const isBypass = authService.bypassPermissionsSignal();

  if (!token && isBypass && !req.url.includes('/auth/login') && !req.url.includes('/auth/operators')) {
    return authService.ensureValidToken$().pipe(
      switchMap((newToken) => {
        const cloned = newToken
          ? req.clone({
              setHeaders: {
                Authorization: `Bearer ${newToken}`
              }
            })
          : req;
        return next(cloned);
      }),
      catchError(() => next(req))
    );
  }

  const authReq = token
    ? req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      })
    : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if ((error.status === 401 || error.status === 403) && !req.url.includes('/auth/login')) {
        if (isBypass) {
          return authService.ensureValidToken$(true).pipe(
            switchMap((refreshedToken) => {
              const retried = refreshedToken
                ? req.clone({
                    setHeaders: {
                      Authorization: `Bearer ${refreshedToken}`
                    }
                  })
                : req;
              return next(retried);
            })
          );
        } else {
          authService.logout();
          router.navigate(['/start-day']);
        }
      }
      return throwError(() => error);
    })
  );
};
