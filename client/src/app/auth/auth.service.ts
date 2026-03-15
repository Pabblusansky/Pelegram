import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { SocketService } from '../chat/services/socket.service';
import { BehaviorSubject, Observable, tap, catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { LoggerService } from '../services/logger.service';
import { TokenService } from '../services/token.service';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  userId: string;
  username: string;
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/api/auth`;
  private readonly ACCESS_TOKEN_LIFETIME_MS = 15 * 60 * 1000; // 15 minutes, matches server

  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  public isAuthenticated$: Observable<boolean> = this.isAuthenticatedSubject.asObservable();

  private isRefreshing = false;
  private refreshSubject = new BehaviorSubject<string | null>(null);

  constructor(
    private http: HttpClient,
    private router: Router,
    private socketService: SocketService,
    private logger: LoggerService,
    private tokenService: TokenService)
    {
      this.isAuthenticatedSubject.next(this.tokenService.isTokenValid());
    }

  register(user: { username: string; email: string; password: string }) {
    return this.http.post(`${this.apiUrl}/register`, user);
  }

  login(credentials: { usernameOrEmail: string; password: string }) {
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, credentials).pipe(
      tap(response => {
        if (response && response.accessToken && response.userId) {
          const tokenExpiration = new Date().getTime() + this.ACCESS_TOKEN_LIFETIME_MS;
          this.tokenService.setAuthData(
            response.accessToken,
            response.refreshToken,
            response.userId,
            response.username,
            tokenExpiration
          );
          this.isAuthenticatedSubject.next(true);
          this.socketService.logoutAndReconnectSocket();
          this.router.navigate(['/']);
        } else {
          this.logger.error('Token is missing in the response');
          throw new Error('Authentication failed. Invalid server response.');
        }
      })
    );
  }

  refreshAccessToken(): Observable<RefreshResponse> {
    const refreshToken = this.tokenService.getRefreshToken();
    if (!refreshToken) {
      this.forceLogout();
      return throwError(() => new Error('No refresh token'));
    }

    return this.http.post<RefreshResponse>(`${this.apiUrl}/refresh`, { refreshToken }).pipe(
      tap(response => {
        const tokenExpiration = new Date().getTime() + this.ACCESS_TOKEN_LIFETIME_MS;
        this.tokenService.updateTokens(response.accessToken, response.refreshToken, tokenExpiration);
        this.socketService.logoutAndReconnectSocket();
      }),
      catchError(error => {
        this.logger.error('Token refresh failed:', error);
        this.forceLogout();
        return throwError(() => error);
      })
    );
  }

  get isRefreshingToken(): boolean {
    return this.isRefreshing;
  }

  set isRefreshingToken(value: boolean) {
    this.isRefreshing = value;
  }

  get refreshToken$(): BehaviorSubject<string | null> {
    return this.refreshSubject;
  }

  logout(): void {
    const refreshToken = this.tokenService.getRefreshToken();
    const userId = this.tokenService.getUserId();
    const socket = this.socketService.getSocket();

    if (socket && socket.connected && userId) {
      socket.emit('user_logout_attempt', { userId });
    }

    if (refreshToken) {
      this.http.post(`${this.apiUrl}/logout`, { refreshToken }).subscribe({
        error: (err) => this.logger.error('Server-side logout failed:', err),
      });
    }

    this.tokenService.clearAuthData();
    this.isAuthenticatedSubject.next(false);
    this.socketService.logoutAndReconnectSocket();
    this.router.navigate(['/auth/login']);
  }

  private forceLogout(): void {
    this.tokenService.clearAuthData();
    this.isAuthenticatedSubject.next(false);
    this.socketService.logoutAndReconnectSocket();
    this.router.navigate(['/auth/login']);
  }

  isTokenExpired(): boolean {
    if (!this.tokenService.isTokenValid()) {
      this.isAuthenticatedSubject.next(false);
      return true;
    }
    return false;
  }

  isAuthenticatedUser(): boolean {
    const token = this.getToken();
    if (!token) return false;
    return !this.isTokenExpired();
  }

  isAuthenticated(): boolean {
    return !this.isTokenExpired();
  }

  getToken(): string | null {
    return this.tokenService.getToken();
  }
}