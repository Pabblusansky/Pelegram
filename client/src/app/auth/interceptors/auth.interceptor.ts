import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { AuthService } from '../auth.service';
import { TokenService } from '../../services/token.service';
import { ToastService } from '../../utils/toast-service';

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {

  const authService = inject(AuthService);
  const tokenService = inject(TokenService);
  const toastService = inject(ToastService);

  // Don't attach token to refresh requests to avoid circular issues
  const isRefreshRequest = req.url.includes('/auth/refresh');

  const token = tokenService.getToken();
  let authReq = req;

  if (token && !isRefreshRequest) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Only attempt refresh on 401 with TOKEN_EXPIRED code, and not on refresh/login requests
      if (
        error.status === 401 &&
        error.error?.code === 'TOKEN_EXPIRED' &&
        !isRefreshRequest &&
        !req.url.includes('/auth/login')
      ) {
        return handleTokenExpired(req, next, authService, tokenService, toastService);
      }

      // For other 401s (invalid token, no token), force logout
      if (error.status === 401 && !isRefreshRequest && !req.url.includes('/auth/login')) {
        toastService.showToast('Your session has expired. Please log in again.', 5000, 'error');
        authService.logout();
      }

      return throwError(() => error);
    })
  );
};

function handleTokenExpired(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService,
  tokenService: TokenService,
  toastService: ToastService
): Observable<HttpEvent<unknown>> {
  // If already refreshing, queue this request — wait for the refresh to complete
  if (authService.isRefreshingToken) {
    return authService.refreshToken$.pipe(
      filter((token): token is string => token !== null),
      take(1),
      switchMap(newToken => {
        const retryReq = req.clone({
          setHeaders: { Authorization: `Bearer ${newToken}` },
        });
        return next(retryReq);
      })
    );
  }

  // First request to detect expiry — initiate the refresh
  authService.isRefreshingToken = true;
  authService.refreshToken$.next(null);

  return authService.refreshAccessToken().pipe(
    switchMap(response => {
      authService.isRefreshingToken = false;
      const newToken = tokenService.getToken()!;
      authService.refreshToken$.next(newToken);

      // Retry the original request with the new token
      const retryReq = req.clone({
        setHeaders: { Authorization: `Bearer ${newToken}` },
      });
      return next(retryReq);
    }),
    catchError(refreshError => {
      authService.isRefreshingToken = false;
      authService.refreshToken$.next(null);
      toastService.showToast('Your session has expired. Please log in again.', 5000, 'error');
      return throwError(() => refreshError);
    })
  );
}
