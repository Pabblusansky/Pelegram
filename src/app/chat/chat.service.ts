import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { io } from 'socket.io-client';
import { AuthService } from '../auth/auth.service';
@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private apiUrl = 'http://localhost:3000/api';
  private socket = io('http://localhost:3000', {
    auth: { token: localStorage.getItem('token') },
  });

  constructor(private http: HttpClient, private authService: AuthService) {}

  getChats() {
    const token = localStorage.getItem('token');
    const headers = token
    ? new HttpHeaders().set('Authorization', `Bearer ${token}`)
    : undefined;
  return this.http.get(`${this.apiUrl}/chats`, { headers });
}

  getMessages(chatId: string) {
    const token = this.authService.getToken();
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
    return this.http.get(`${this.apiUrl}/messages/${chatId}`, { headers });
  }

  sendMessage(chatId: string, content: string) {
    this.socket.emit('send_message', { chatId, content });
  }

  receiveMessages(callback: (message: any) => void) {
    this.socket.on('receive_message', callback);
  }
}
