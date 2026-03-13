import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class TokenService {
  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getUserId(): string | null {
    return localStorage.getItem('userId');
  }

  getUsername(): string | null {
    return localStorage.getItem('username');
  }

  getTokenExpiration(): string | null {
    return localStorage.getItem('tokenExpiration');
  }

  setAuthData(token: string, userId: string, username: string, expirationMs: number): void {
    localStorage.setItem('token', token);
    localStorage.setItem('userId', userId);
    localStorage.setItem('username', username);
    localStorage.setItem('tokenExpiration', expirationMs.toString());
  }

  clearAuthData(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('tokenExpiration');
  }

  isTokenValid(): boolean {
    const expiration = this.getTokenExpiration();
    if (!expiration) return false;
    return new Date().getTime() < parseInt(expiration, 10);
  }
}
