  import { Injectable } from '@angular/core';
  import { HttpClient, HttpHeaders } from '@angular/common/http';
  import { io } from 'socket.io-client';
  import { Router } from '@angular/router';
  import { catchError, Observable, Observer, share, Subject, throwError } from 'rxjs';
  import { Message } from './chat.model';
  @Injectable({
    providedIn: 'root',
  })
  export class ChatService {
    private apiUrl = 'http://localhost:3000';
    private socket: any; 
    private destroySocket$ = new Subject<void>();

    constructor(private http: HttpClient, private router: Router) {
      this.initializeSocket();
    }

    private getHeaders() {
      const token = localStorage.getItem('token');
      if (!token) {
        this.router.navigate(['/login']);
        return undefined;
      }
      return new HttpHeaders().set('Authorization', `Bearer ${token}`);
    }

    private initializeSocket() {
      const token = localStorage.getItem('token');
      if (token) {
        this.socket = io('http://localhost:3000', {
          auth: { token },
        });

        this.socket.on('connect', () => {
          console.log('Socket connected: ', this.socket.id);
        });

        this.socket.on('disconnect', () => {
          console.log('Socket disconnected');
        });
      }
    }

    logoutAndReconnectSocket() {
      if (this.socket) {
        this.socket.disconnect();
      }

      this.initializeSocket();
    }

    getUsers(): Observable<any[]> {
      return this.http.get<any[]>(`${this.apiUrl}/users`);
    }

    onMessageStatusUpdated() {
      return new Observable((observer) => {
        this.socket.on('messageStatusUpdated', (data: { messageId: string; status: string }) => {
          observer.next(data);
        });
      });
    }
    markMessagesAsRead(chatId: string) {
      const headers = this.getHeaders();
      if (!headers) {
        return throwError(() => new Error('No token provided'));
      }
      console.log('Sending request to mark messages as read:', { chatId });
      return this.http.post(`${this.apiUrl}/messages/markAsRead`, { chatId }, { headers });
    }
    
    sendTyping(chatId: string, isTyping: boolean) {
      console.log("Emitting typing event to server:", chatId, isTyping);
      this.socket.emit('typing', { chatId, isTyping });
    }

    onTyping(): Observable<any> {
      return new Observable((observer) => {
        this.socket.on('typing', (data: any) => {
          observer.next(data);
        });
      });
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
    joinChat(chatId: string) {
      this.socket.emit('join_chat', chatId);
      console.log(`Joined chat room: ${chatId}`);
    }  
    sendMessage(chatId: string, content: string): Observable<any> {
      return new Observable((observer) => {
        if (!this.socket.connected) {
          console.error('Socket is not connected. Cannot send message.');
          observer.error('Socket is not connected');
          return;
        }
    
        // Message sent
        this.socket.emit('send_message', { chatId, content });
    
        this.socket.on('message_sent', (savedMessage: Message) => {
          observer.next(savedMessage); 
          observer.complete();
        });
        
        this.socket.on('message_edited', (message: Message) => {
          console.log('Socket received message_edited event:', message);
          observer.next(message);
        });        
        // Error sending message
        this.socket.on('message_error', (error: any) => {
          observer.error(error);
        });
      });
    }
    receiveMessages(callback: (message: any) => void) {
      this.socket.on('receive_message', callback);
    }

    editMessage(messageId: string, newContent: string): Observable<Message> {
      const headers = this.getHeaders();
      if (!headers) {
        return throwError(() => new Error('Not authorized'));
      }
      
      const now = new Date().toISOString();
      
      return this.http.patch<Message>(
        `${this.apiUrl}/messages/${messageId}`, 
        { 
          content: newContent,
          edited: true,
          editedAt: now
        }, 
        { headers }
      ).pipe(
        catchError(error => {
          console.error('Error editing message:', error);
          return throwError(() => error);
        })
      );
    }
    
  deleteMessage(messageId: string): Observable<any> {
    const headers = this.getHeaders();
    return headers ? 
      this.http.delete(`${this.apiUrl}/messages/${messageId}`, { headers }) 
      : throwError(() => new Error('Not authorized'));
  }

onMessageEdited(): Observable<Message> {
  return new Observable<Message>(observer => {
    if (!this.socket) {
      observer.error(new Error('Socket not initialized'));
      return;
    }
    
    this.socket.off('message_edited');
    
    const handleMessageEdited = (message: Message) => {
      console.log('Socket received message_edited event:', message);
      observer.next(message);
    };
    
    this.socket.on('message_edited', handleMessageEdited);
    
    return () => {
      if (this.socket) {
        this.socket.off('message_edited', handleMessageEdited);
      }
    };
  });
}
  
}
