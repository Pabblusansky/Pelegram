import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { io } from 'socket.io-client';
import { Router } from '@angular/router';
import { catchError, Observable, Observer, retry, share, Subject, throwError, map, tap } from 'rxjs';
import { Chat, Message } from './chat.model';
import { BehaviorSubject, interval } from 'rxjs';
import { shareReplay, takeUntil } from 'rxjs/operators';


interface MessageDeletedEvent {
  messageId: string;
  chatId: string;
  updatedChat: any;
}

@Injectable({
  providedIn: 'root',
})

export class ChatService {
  private apiUrl = 'http://localhost:3000';
  private socket: any; 
  private destroySocket$ = new Subject<void>();
  private newMessageSubject = new Subject<Message>();
  public newMessage$ = this.newMessageSubject.asObservable();
  private messageDeletedSubject = new Subject<MessageDeletedEvent>();
  public messageDeleted$ = this.messageDeletedSubject.asObservable();
  private userStatusesSubject = new BehaviorSubject<Record<string, { lastActive: string, online: boolean }>>({});
  public userStatuses$ = this.userStatusesSubject.asObservable().pipe(shareReplay(1));

  



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

      this.socket.on('receive_message', (message: Message) => {
        this.newMessageSubject.next(message);
      });

      this.socket.on('connect', () => {
        console.log('Socket connected: ', this.socket.id);
      });

      this.socket.on('disconnect', () => {
        console.log('Socket disconnected');
      });

      this.socket.on('message_deleted', (data: MessageDeletedEvent) => {
        console.log('Socket received message_deleted event:', data);
        this.messageDeletedSubject.next(data);
      });
      this.socket.on('user_status_update', (statuses: Record<string, any>) => {
        console.log('Received user statuses update:', Object.keys(statuses).length);
        
        // Форматируем и проверяем данные от сервера
        const formattedStatuses: Record<string, { lastActive: string, online: boolean }> = {};
        
        for (const [userId, status] of Object.entries(statuses)) {
          let lastActiveStr = new Date().toISOString();
          let isOnline = false;
          
          try {
            if (typeof status === 'object' && status !== null) {
              if (status.lastActive) {
                const testDate = new Date(status.lastActive);
                if (!isNaN(testDate.getTime())) {
                  lastActiveStr = status.lastActive;
                } else {
                  console.warn(`Invalid lastActive date for user ${userId}:`, status.lastActive);
                }
              }
              
              isOnline = status.online === true;
            } else if (typeof status === 'string') {
              const testDate = new Date(status);
              if (!isNaN(testDate.getTime())) {
                lastActiveStr = status;
              } else {
                console.warn(`Invalid lastActive string for user ${userId}:`, status);
              }
            }
          } catch (e) {
            console.error(`Error processing status for user ${userId}:`, e);
          }
          
          formattedStatuses[userId] = {
            lastActive: lastActiveStr,
            online: isOnline
          };
        }
        
        this.userStatusesSubject.next(formattedStatuses);
      });
      this.setupActivityPing();
      this.loadInitialUserStatuses();
    }
    
  }

  getUserLastActive(userId: string): Observable<Date | null> {
    return this.userStatuses$.pipe(
      map(statuses => {
        const userStatus = statuses[userId];
        return userStatus ? new Date(userStatus.lastActive) : null;
      })
    );
  }

  getChat(chatId: string): Observable<any> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));
    
    return this.http.get(`${this.apiUrl}/chats/${chatId}`, { headers });
  }

  isUserOnline(userId: string): Observable<boolean> {
    return this.userStatuses$.pipe(
      map(statuses => {
        const userStatus = statuses[userId];
        return userStatus ? userStatus.online : false;
      })
    );
  }
  
  getUserStatusText(userId: string): Observable<string> {
    return this.userStatuses$.pipe(
      map(statuses => {
        const userStatus = statuses[userId];
        
        if (!userStatus) return 'offline';
        
        if (userStatus.online === true) {
          return 'online';
        }
        
        let lastActive: Date;
        try {
          lastActive = new Date(userStatus.lastActive);
          
          if (isNaN(lastActive.getTime())) {
            console.error('Invalid date encountered:', userStatus.lastActive);
            return 'offline'; 
          }
        } catch (e) {
          console.error('Error parsing date:', e, userStatus.lastActive);
          return 'offline';
        }
        
        const now = new Date();
        const diffInMinutes = (now.getTime() - lastActive.getTime()) / (1000 * 60);
        
        if (diffInMinutes < 1) return 'last seen just now';
        if (diffInMinutes < 60) {
          const minutes = Math.floor(diffInMinutes);
          return `last seen ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
        }
        
        const diffInHours = diffInMinutes / 60;
        if (diffInHours < 24) {
          const hours = Math.floor(diffInHours);
          return `last seen ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
        }
        
        const diffInDays = diffInHours / 24;
        if (diffInDays < 7) {
          const days = Math.floor(diffInDays);
          return `last seen ${days} ${days === 1 ? 'day' : 'days'} ago`;
        }
        
        try {
          return `last seen on ${lastActive.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}`;
        } catch (e) {
          console.error('Error formatting date:', e);
          return 'last seen recently'; 
        }
      })
    );
  }
  getSocket(): any {
    return this.socket;
  }

  private loadInitialUserStatuses(): void {
    const headers = this.getHeaders();
    if (!headers) return;
    
    this.http.get<Record<string, string>>(`${this.apiUrl}/api/users/status`, { headers })
    .subscribe({
      next: (statuses) => {
        console.log('Loaded initial user statuses:', Object.keys(statuses).length);
        const formattedStatuses: Record<string, { lastActive: string, online: boolean }> = {};
        for (const [userId, status] of Object.entries(statuses)) {
          formattedStatuses[userId] = {
            lastActive: status || new Date().toISOString(),
            online: false
          };
        }
        this.userStatusesSubject.next(formattedStatuses);
      },
      error: (err) => {
        console.error('Error loading user statuses:', err);
      }
    });
  }
  
  private setupActivityPing(): void {
    interval(30000)
      .pipe(takeUntil(this.destroySocket$))
      .subscribe(() => {
        if (this.socket && this.socket.connected) {
          this.socket.emit('user_activity');
        }
      });
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

onMessageDeleted(): Observable<MessageDeletedEvent> {
  return this.messageDeleted$;
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

updateChatWithLastMessage(chatId: string): Observable<any> {
  const headers = this.getHeaders();
  if (!headers) return throwError(() => new Error('Not authorized'));
  
  return this.http.get(`${this.apiUrl}/chats/${chatId}`, { headers });
}

getMessagesBefore(chatId: string, beforeMessageId: string, limit: number = 20): Observable<Message[]> {
  const headers = this.getHeaders();
  if (!headers) return throwError(() => new Error('Not authorized'));
  
  return this.http.get<Message[]>(
    `${this.apiUrl}/messages/${chatId}?before=${beforeMessageId}&limit=${limit}`, 
    { headers }
  ).pipe(
    map((messages: Message[]) => Array.isArray(messages) ? messages : []),
    tap(messages => console.log(`Loaded ${messages.length} older messages`)),
    catchError(error => {
      console.error('Error loading older messages:', error);
      return throwError(() => error);
    })
  );
}

createOrGetDirectChat(userId: string): Observable<Chat> {
  const token = localStorage.getItem('token');
  if (!token) {
    console.error('No token found, cannot create chat');
    return throwError(() => new Error('Authentication required'));
  }
  
  const headers = new HttpHeaders({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  });
  
  return this.http.post<Chat>(`${this.apiUrl}/chats`, { recipientId: userId }, { headers })
    .pipe(
      catchError(error => {
        console.error('Error creating or getting direct chat:', error);
        return throwError(() => new Error(`Failed to create chat: ${error.message}`));
      })
    );
}
}
