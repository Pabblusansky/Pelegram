import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = 'http://localhost:3000/api/auth';

  constructor(private http: HttpClient, private router: Router) {}

  register(user: { username: string; email: string; password: string }) {
    return this.http.post(`${this.apiUrl}/register`, user);
  }

  login(credentials: { usernameOrEmail: string; password: string }) {
    return this.http.post<{ token: string }>(`${this.apiUrl}/login`, credentials).pipe(
      tap(response => {
        if (response && response.token) {
          localStorage.setItem('token', response.token);
          const tokenExpiration = new Date().getTime() + 3600 * 1000; // 1 hour in milliseconds
          localStorage.setItem('tokenExpiration', tokenExpiration.toString());
        } else {
          console.error('Token is missing in the response');
        }
      })
    );
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('tokenExpiration');
    this.router.navigate(['/login']);
  }

  isTokenExpired(): boolean {
    const expiration = localStorage.getItem('tokenExpiration');
    if (!expiration) {
      return true;
    }
    return new Date().getTime() > parseInt(expiration, 10);
  }

  isAuthenticated(): boolean {
    return !this.isTokenExpired();
  }
}