import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { io } from 'socket.io-client';
import { AuthService } from '../auth/auth.service';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
@Injectable({
  providedIn: 'root',
})
export class ChatService {


  private apiUrl = 'http://localhost:3000';
  private socket = io('http://localhost:3000', {
    auth: { token: localStorage.getItem('token') },
  });

  constructor(private http: HttpClient, private authService: AuthService, private router: Router) {}
  private getHeaders() {
    const token = localStorage.getItem('token');
    if (!token) {
      this.router.navigate(['/login']);
      return undefined;
    }
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }


  getChats() {
    const headers = this.getHeaders();
    if (!headers) return;
    return this.http.get(`${this.apiUrl}/chats`, { headers });
}

  getMessages(chatId: string): Observable<any> | undefined {
    const headers = this.getHeaders();
    if (!headers) return;
    return this.http.get(`${this.apiUrl}/messages/${chatId}`, { headers });
  }

  sendMessage(chatId: string, content: string) {
    if (!this.socket.connected) {
      console.error('Socket is not connected. Cannot send message.');
      return;
    }
  
    this.socket.emit('send_message', { chatId, content });
  }  
  receiveMessages(callback: (message: any) => void) {
    this.socket.on('receive_message', callback);
  }
}
