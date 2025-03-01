import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { ChatService } from '../chat/chat.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = 'http://localhost:3000/api/auth';

  constructor(private http: HttpClient, private router: Router, private chatService: ChatService) {}

  register(user: { username: string; email: string; password: string }) {
    return this.http.post(`${this.apiUrl}/register`, user);
  }

  login(credentials: { usernameOrEmail: string; password: string }) {
    return this.http.post<{ token: string, userId: string }>(`${this.apiUrl}/login`, credentials).pipe(
      tap(response => {
        if (response && response.token) {
          console.log('Received response:', response);
          localStorage.setItem('token', response.token);
          localStorage.setItem('userId', response.userId);
          const tokenExpiration = new Date().getTime() + 3600 * 1000; // 1 hour 
          localStorage.setItem('tokenExpiration', tokenExpiration.toString());
        } else {
          console.error('Token is missing in the response');
          throw new Error('Authentication failed. No token received.');
        }
      })
    );
  }
  

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('tokenExpiration');
    this.router.navigate(['/login']);
    if (this.chatService.getSocket()) {
      this.chatService.getSocket().emit('logout');
    }  
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
  getToken(): string | null {
    return localStorage.getItem('token');
  }
}