import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ChatService } from '../chat/chat.service';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
@Injectable({
  providedIn: 'root',
})
export class AuthService {
    private apiUrl = `${environment.apiUrl}/api/auth`;

  private isAuthenticatedSubject = new BehaviorSubject<boolean>(this.hasInitialToken());
  public isAuthenticated$: Observable<boolean> = this.isAuthenticatedSubject.asObservable();

  constructor(
    private http: HttpClient, 
    private router: Router, 
    private chatService: ChatService) 
    {
      this.checkAuthStatusOnLoad();
    }


  private hasInitialToken(): boolean {
    const token = localStorage.getItem('token');
    const expiration = localStorage.getItem('tokenExpiration');
    if (!token || !expiration) {
      return false;
    }
    return new Date().getTime() < parseInt(expiration, 10);
  }

  private checkAuthStatusOnLoad(): void {
    this.isAuthenticatedSubject.next(this.hasInitialToken());
  }

  register(user: { username: string; email: string; password: string }) {
    return this.http.post(`${this.apiUrl}/register`, user);
  }

  login(credentials: { usernameOrEmail: string; password: string }) {
    return this.http.post<{ token: string, userId: string, username: string }>(`${this.apiUrl}/login`, credentials).pipe(
      tap(response => {
        if (response && response.token && response.userId) {
          console.log('Login successful:', response);
          console.log('Received response:', response);
          localStorage.setItem('token', response.token);
          localStorage.setItem('userId', response.userId);
          localStorage.setItem('username', response.username);
          const tokenExpiration = new Date().getTime() + 3600 * 1000; // 1 hour 
          localStorage.setItem('tokenExpiration', tokenExpiration.toString());
          this.isAuthenticatedSubject.next(true);
          this.chatService.logoutAndReconnectSocket();
          this.router.navigate(['/']);
        } else {
          console.error('Token is missing in the response');
          throw new Error('Authentication failed. Invalid server response.');
        }
      })
    );
  }
  

  logout(): void {
    const userId = localStorage.getItem('userId');
    if (this.chatService.getSocket() && this.chatService.getSocket().connected && userId) {
       this.chatService.getSocket().emit('user_logout_attempt', { userId });
       console.log('Emitted user_logout_attempt to server');
    }
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('tokenExpiration');
    this.isAuthenticatedSubject.next(false);
    this.chatService.logoutAndReconnectSocket();
    this.router.navigate(['/auth/login']);
  }

  isTokenExpired(): boolean {
    const expiration = localStorage.getItem('tokenExpiration');
    if (!expiration) {
      this.isAuthenticatedSubject.next(false);
      return true;
    }
    const expired = new Date().getTime() > parseInt(expiration, 10);
    if (expired) {
      this.isAuthenticatedSubject.next(false);
    }
    return expired;
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
    return localStorage.getItem('token');
  }
}