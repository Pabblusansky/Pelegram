import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { io, Socket } from 'socket.io-client';
import { Router } from '@angular/router';
import { catchError, Observable, Subject, throwError, map, tap } from 'rxjs';
import { Chat, Message, Reaction, User } from './chat.model';
import { BehaviorSubject, interval } from 'rxjs';
import { shareReplay, takeUntil } from 'rxjs/operators';
import { SoundService } from '../services/sound.service'; 

interface MessageDeletedEvent {
  messageId: string;
  chatId: string;
  updatedChat: any;
}

interface ChatDeletedGloballyData {
  chatId: string;
  deletedBy?: string; // Optional field to indicate who deleted the chat
}

interface NewChatCreatedData {
  _id: string;
  participants: User[];
  messages: any[];
  type: string;
  createdAt?: string;
  updatedAt?: string;
  lastMessage?: any;
}
@Injectable({
  providedIn: 'root',
})

export class ChatService implements OnDestroy {
  private apiUrl = 'http://localhost:3000';
  private socket: Socket | undefined;
  private destroySocket$ = new Subject<void>(); 
  private newMessageSubject = new Subject<Message>();
  public newMessage$ = this.newMessageSubject.asObservable();
  private messageDeletedSubject = new Subject<MessageDeletedEvent>();
  public messageDeleted$ = this.messageDeletedSubject.asObservable();
  private userStatusesSubject = new BehaviorSubject<Record<string, { lastActive: string, online: boolean }>>({});
  public userStatuses$ = this.userStatusesSubject.asObservable().pipe(shareReplay(1));
  private chatUpdatedSubject = new Subject<Chat>();
  public chatUpdated$ = this.chatUpdatedSubject.asObservable();
  private messageReactionUpdatedSubject = new Subject<{ messageId: string; reactions: Reaction[] }>();
  public messageReactionUpdated$ = this.messageReactionUpdatedSubject.asObservable();
  private chatDeletedGloballySubject = new Subject<ChatDeletedGloballyData>();
  public chatDeletedGlobally$ = this.chatDeletedGloballySubject.asObservable();
  private newChatCreatedSubject = new Subject<Chat>();
  public newChatCreated$ = this.newChatCreatedSubject.asObservable();
  constructor(
    private http: HttpClient, 
    private router: Router,
    private soundService: SoundService
  ) {
    this.initializeSocket();
  }
  ngOnDestroy() {
    console.log('ChatService ngOnDestroy called.');
    this.destroySocket$.next();
    this.destroySocket$.complete();
    if (this.socket) {
      this.socket.disconnect();
      console.log('ChatService: Socket disconnected on service destroy.');
    }
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
    if (this.socket) {
      this.socket.disconnect();
      this.destroySocket$.next();
      this.destroySocket$.complete();
      this.destroySocket$ = new Subject<void>();
    }
    const token = localStorage.getItem('token');

    if (token) {
      this.socket = io(this.apiUrl, {
        auth: { token },
      });

      this.socket.on('chat_deleted_globally', (data: ChatDeletedGloballyData) => {
        this.chatDeletedGloballySubject.next(data);
      });

      this.socket.on('new_chat_created', (chatData: Chat) => {
            this.newChatCreatedSubject.next(chatData);

            if (this.socket && chatData && chatData._id) {
              // console.log(`FRONTEND SERVICE: Auto-joining room for newly created chat: ${chatData._id}`);
              this.socket.emit('join_chat', chatData._id);
            }
      });

      this.socket.on('message_reaction_updated', (data: { messageId: string; reactions: Reaction[] }) => {
        // console.log('SERVICE: message_reaction_updated received', data);
        this.messageReactionUpdatedSubject.next(data);
      });

      this.socket.on('reaction_error', (data: { messageId: string; error: string }) => {
        console.error('SERVICE: reaction_error received', data);
      });
      this.socket.on('chat_updated', (chat: Chat) => {
        this.chatUpdatedSubject.next(chat);
      });

      this.socket.on('receive_message', (message: Message) => {
        this.newMessageSubject.next(message);
        // const currentUserId = localStorage.getItem('userId');
        // if (message.senderId !== currentUserId) {
        //   this.soundService.playSound('message');
        // }
      });

      this.socket.on('connect', () => {
        console.log('Socket connected:', this.socket?.id);
        this.getChats()
        ?.pipe(
          takeUntil(this.destroySocket$),
          map((chats: any) => chats as Chat[])
        )
        .subscribe({
          next: (chats: Chat[]) => {
            chats.forEach((chat) => {
              if (chat._id) {
                this.socket?.emit('join_chat', chat._id);
              }
            });
          },
          error: (err) => {
            console.error('Error fetching user chats for auto-joining:', err);
          },
        });
        this.loadInitialUserStatuses(); 
        this.setupActivityPing();
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
      // this.loadInitialUserStatuses();
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
          console.log('Trying to parse date from userStatus.lastActive:', userStatus.lastActive, typeof userStatus.lastActive);
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

    this.http.get<Record<string, { lastActive: string, online: boolean }>>(`${this.apiUrl}/api/users/status`, { headers })
      .subscribe({
        next: (httpUserStatuses) => {
          console.log('ChatService: HTTP response for initial user statuses:', httpUserStatuses);
          
          const currentStatusesInSubject = { ...this.userStatusesSubject.value };
          let changed = false;

          for (const [userId, httpStatus] of Object.entries(httpUserStatuses)) {
            const existingStatus = currentStatusesInSubject[userId];
            
            const hasStatusChanged = !existingStatus || 
                                    existingStatus.lastActive !== (httpStatus.lastActive || new Date().toISOString()) ||
                                    existingStatus.online !== (httpStatus.online || false);

            if (hasStatusChanged) {
              currentStatusesInSubject[userId] = {
                lastActive: httpStatus.lastActive || new Date().toISOString(),
                online: httpStatus.online || false 
              };
              changed = true;
            }
          }
          
          if (changed) {
            console.log('ChatService: Emitting updated statuses after merging HTTP statuses:', currentStatusesInSubject);
            this.userStatusesSubject.next(currentStatusesInSubject);
          } else {
            console.log('ChatService: No changes to user statuses after merging HTTP statuses.');
          }
        },
        error: (err) => {
          console.error('Error loading initial user statuses from HTTP:', err);
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
      if (!this.socket) {
        observer.error(new Error('Socket not initialized'));
        return;
      }
      
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
    if (this.socket) {
      this.socket.emit('typing', { chatId, isTyping });
    }
  }

  onTyping(): Observable<any> {
    return new Observable((observer) => {
      if (!this.socket) {
        observer.error(new Error('Socket not initialized'));
        return;
      }
      
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

  getSavedMessagesChat(): Observable<Chat> {
  const headers = this.getHeaders();
  if (!headers) {
    return throwError(() => new Error('Not authorized to get Saved Messages chat.'));
  }
  return this.http.get<Chat>(`${this.apiUrl}/chats/me/saved-messages`, { headers })
    .pipe(
      tap(chat => console.log('ChatService: Fetched Saved Messages chat:', chat)),
      catchError(this.handleError)
    );
  }
  joinChat(chatId: string) {
    if (this.socket) {
      this.socket.emit('join_chat', chatId);
      console.log(`Joined chat room: ${chatId}`);
    } else {
      console.error('Cannot join chat: Socket is not initialized');
    }
  }  
  sendMessage(chatId: string, content: string, replyToDetails?: any): Observable<Message> {
    return new Observable((observer) => {
      if (!this.socket || !this.socket.connected) {
        console.error('Socket is not connected. Cannot send message.');
        observer.error('Socket is not connected');
        return;
      }
      const MessageData: {
        chatId: string;
        content: string;
        replyTo?: any;
      } = {
        chatId,
        content,
      }
      if (replyToDetails) {
        MessageData.replyTo = replyToDetails;
      }
      // Message sent
    this.socket.emit('send_message', MessageData, (ack: { success: any; message: Message; error: any; }) => { 
      if (ack && ack.success) {
          console.log('Server acknowledged message sent:', ack.message);
          observer.next(ack.message as Message);
          observer.complete();
      } else {
          console.error('Server did not acknowledge message or error:', ack);
          observer.error(ack && ack.error ? ack.error : 'Failed to send message to server');
      }
      });

      
      this.socket.on('message_edited', (message: Message) => {
        console.log('Socket received message_edited event:', message);
        observer.next(message);
      });        


    });
  }
  receiveMessages(callback: (message: any) => void) {
    if (this.socket) {
      this.socket.on('receive_message', callback);
    } else {
      console.error('Socket is not initialized');
    }
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

  forwardMessage(messageId: string, targetChatId: string): Observable<any> {
    const url = `${this.apiUrl}/messages/${messageId}/forward`;
    return this.http.post(url, { targetChatId }, this.getHttpOptions()).pipe(
      catchError(this.handleError)
    );
  }

  handleError(error: any) {
    console.error('An error occurred:', error);
    return throwError(() => new Error('Something went wrong; please try again later.'));
  }

  getAvailableChatsForForward(): Observable<any[]> {
    const url = `${this.apiUrl}/messages/available-for-forward`;
    return this.http.get<any[]>(url, this.getHttpOptions()).pipe(
      catchError(this.handleError)
    );
  }

  private getHttpOptions() {
    const headers = this.getHeaders();
    if (!headers) {
      throw new Error('No token provided');
    }
    return { headers };
  }

  getApiUrl(): string {
    return this.apiUrl;
  }
  toggleReaction(messageId: string, reactionType: string): void {
  if (this.socket && this.socket.connected) {
    console.log(`SERVICE: Emitting toggle_reaction for msg ${messageId}, reaction: ${reactionType}`);
    this.socket.emit('toggle_reaction', { messageId, reactionType });
  } else {
    console.warn('Socket not connected. Cannot toggle reaction.');
  }
}

  deleteChat(chatId: string): Observable<any> {
    const headers = this.getHeaders();
    if (!headers) {
      this.router.navigate(['/login']);
      return throwError(() => new Error('Not authorized for deleteChat'));
    }
    // URL will be: http://localhost:3000/chats/:chatId
    return this.http.delete(`${this.apiUrl}/chats/${chatId}`, { headers });
  }

  searchMessages(chatId: string, query: string): Observable<Message[]> { 
    const headers = this.getHeaders();
    if (!headers) {
      console.error('SearchMessages: Not authorized');
      return throwError(() => new Error('Not authorized'));
    }
    
    let params = new HttpParams();
    params = params.append('query', query);

    const url = `${this.apiUrl}/messages/search/${chatId}`;
    
    console.log(`Searching messages with URL: ${url} and query: ${query}`); 

    return this.http.get<Message[]>(url, { headers, params })
      .pipe(
        map(messages => {
          return messages.map(msg => ({
              ...msg,
              timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : new Date(msg.timestamp).toISOString()
          }));
        }),
        catchError(error => {
          console.error('Error searching messages in service:', error);
          return this.handleError(error);
        })
      );
  }

  loadMessageContext(chatId: string, messageId: string, limitPerSide: number = 15): Observable<Message[]> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));

    const params = new HttpParams().set('limit', limitPerSide.toString());

    return this.http.get<Message[]>(`${this.apiUrl}/messages/${chatId}/context/${messageId}`, { headers, params })
      .pipe(
        map(messages => messages.map(msg => ({ 
            ...msg,
            timestamp: new Date(msg.timestamp).toISOString()
        }))),
        catchError(this.handleError)
      );
  }

  // Pin and unpin message methods
  pinMessage(chatId: string, messageId: string): Observable<Chat> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));
    return this.http.patch<Chat>(`${this.apiUrl}/chats/${chatId}/pin/${messageId}`, {}, { headers })
      .pipe(catchError(this.handleError));
  }

  unpinMessage(chatId: string): Observable<Chat> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));
    return this.http.patch<Chat>(`${this.apiUrl}/chats/${chatId}/unpin`, {}, { headers })
      .pipe(catchError(this.handleError));
  }

  forwardMultipleMessages(messageIds: string[], targetChatId: string): Observable<any> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));
    return this.http.post(`${this.apiUrl}/messages/forward-multiple`, { messageIds, targetChatId }, { headers })
      .pipe(catchError(this.handleError));
  }

  deleteMultipleMessages(messageIds: string[]): Observable<{ deletedCount: number }> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));
    
    return this.http.request<{ deletedCount: number }>(
      'delete',
      `${this.apiUrl}/messages/delete-multiple`,
      { 
        headers: headers,
        body: { messageIds } 
      }
    ).pipe(catchError(this.handleError));
    
  }
}
