import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { SocketService } from '../chat/services/socket.service';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { LoggerService } from '../services/logger.service';
import { TokenService } from '../services/token.service';
@Injectable({
  providedIn: 'root',
})
export class AuthService {
    private apiUrl = `${environment.apiUrl}/api/auth`;

  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  public isAuthenticated$: Observable<boolean> = this.isAuthenticatedSubject.asObservable();

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
    return this.http.post<{ token: string, userId: string, username: string }>(`${this.apiUrl}/login`, credentials).pipe(
      tap(response => {
        if (response && response.token && response.userId) {
          const tokenExpiration = new Date().getTime() + 3600 * 1000; // 1 hour
          this.tokenService.setAuthData(response.token, response.userId, response.username, tokenExpiration);
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


  logout(): void {
    const userId = this.tokenService.getUserId();
    const socket = this.socketService.getSocket();
    if (socket && socket.connected && userId) {
       socket.emit('user_logout_attempt', { userId });
    }
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