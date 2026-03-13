import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { io, Socket } from 'socket.io-client';
import { Router } from '@angular/router';
import { catchError, Observable, Subject, throwError, map, tap } from 'rxjs';
import { Chat, Message, Reaction, User } from './chat.model';
import { BehaviorSubject, interval } from 'rxjs';
import { first, shareReplay, takeUntil } from 'rxjs/operators';
import { SoundService } from '../services/sound.service';
import { NotificationService } from '../services/notifications.service';
import { LoggerService } from '../services/logger.service';
import { TokenService } from '../services/token.service';
import { environment } from '../../environments/environment';
interface MessageDeletedEvent {
  messageId: string;
  chatId: string;
  updatedChat: Chat;
}

export interface MediaGalleryResponse {
  media: Message[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
}

interface ChatDeletedGloballyData {
  chatId: string;
  deletedBy?: string; // Optional field to indicate who deleted the chat
}

interface NewChatCreatedData {
  _id: string;
  participants: User[];
  messages: string[];
  type: string;
  createdAt?: string;
  updatedAt?: string;
  lastMessage?: Message | string | null;
}
@Injectable({
  providedIn: 'root',
})

export class ChatService implements OnDestroy {
  private currentActiveChatId: string | null = null;
  private apiUrl = environment.apiUrl;
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
  private totalUnreadCountSubject = new BehaviorSubject<number>(0);
  public totalUnreadCount$ = this.totalUnreadCountSubject.asObservable();
  private userRemovedFromChatSubject = new Subject<{ chatId: string; reason: string }>();
  public userRemovedFromChat$ = this.userRemovedFromChatSubject.asObservable();

  constructor(
    private router: Router,
    private http: HttpClient,
    private soundService: SoundService,
    private notificationService: NotificationService,
    private logger: LoggerService,
    private tokenService: TokenService
  ) {
    this.initializeSocket();
  }

  ngOnDestroy() {
    this.destroySocket$.next();
    this.destroySocket$.complete();

    if (this.socket) {
      this.socket.disconnect();
    }
  }

  private getHeaders() {
    const token = this.tokenService.getToken();
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
    const token = this.tokenService.getToken();

    if (token) {
      this.socket = io(this.apiUrl, {
        auth: { token },
      });

      this.socket.on('chat_deleted_globally', (data: ChatDeletedGloballyData) => {
        this.chatDeletedGloballySubject.next(data);
      });

      this.socket.on('user_removed_from_chat', (data: { chatId: string; reason: string }) => {
        this.userRemovedFromChatSubject.next(data);
      });
      this.socket.on('new_chat_created', (chatData: Chat) => {
        this.newChatCreatedSubject.next(chatData);
        if (this.socket && chatData && chatData._id) {
          this.socket.emit('join_chat', chatData._id);
        }
        this.getChats()?.pipe(first()).subscribe(allChats => this.recalculateTotalUnread(allChats as Chat[]));
      });

      this.socket.on('message_reaction_updated', (data: { messageId: string; reactions: Reaction[] }) => {
        this.messageReactionUpdatedSubject.next(data);
      });

      this.socket.on('reaction_error', (data: { messageId: string; error: string }) => {
        this.logger.error('SERVICE: reaction_error received', data);
      });
      this.socket.on('chat_updated', (chat: Chat) => {
        this.chatUpdatedSubject.next(chat);
        this.getChats()?.pipe(first()).subscribe(allChats => this.recalculateTotalUnread(allChats as Chat[]));
      });

      this.socket.on('receive_message', (message: Message) => {
        this.newMessageSubject.next(message);
        this.handleIncomingMessageNotification(message);
      });

      this.socket.on('connect', () => {
        this.getChats()
        ?.pipe(
          takeUntil(this.destroySocket$),
          tap((chats: Chat[]) => {
            if (Array.isArray(chats)) {
              this.recalculateTotalUnread(chats);
            } else {
              this.recalculateTotalUnread([]);
            }
          })
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
            this.logger.error('Error fetching user chats for auto-joining:', err);
          },
        });
        this.loadInitialUserStatuses();
        this.setupActivityPing();
      });

      this.socket.on('disconnect', () => {
      });

      this.socket.on('message_deleted', (data: MessageDeletedEvent) => {
        this.messageDeletedSubject.next(data);
      });
      this.socket.on('user_status_update', (statuses: Record<string, { lastActive: string; online: boolean } | string>) => {

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
                }
              }

              isOnline = status.online === true;
            } else if (typeof status === 'string') {
              const testDate = new Date(status);
              if (!isNaN(testDate.getTime())) {
                lastActiveStr = status;
              }
            }
          } catch (e) {
            this.logger.error('Error processing status for user ' + userId + ':', e);
          }

          formattedStatuses[userId] = {
            lastActive: lastActiveStr,
            online: isOnline
          };
        }

        this.userStatusesSubject.next(formattedStatuses);
      });
      this.setupActivityPing();
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

  public setActiveChatId(chatId: string | null): void {
    this.currentActiveChatId = chatId;
  }

  private handleIncomingMessageNotification(message: Message): void {
    const userId = this.tokenService.getUserId();
    const isAppVisible = this.notificationService.isAppCurrentlyVisible();
    const isChatActive = this.currentActiveChatId === message.chatId;

    if (isAppVisible && isChatActive) {
      return;
    }

    if (isAppVisible && !isChatActive) {
      this.soundService.playSound('message');
      return;
    }
    if (!this.notificationService.areNotificationsGloballyEnabled()) {
      return;
    }

    if (!isAppVisible) {
      const title = `New message from ${message.senderName || 'Unknown User'}`;
      const options: NotificationOptions & { icon?: string; tag?: string; data?: { chatId?: string; messageId?: string } } = {
        body: message.content.length > 100 ? message.content.substring(0, 97) + '...' : message.content,
        icon: message.senderAvatar || 'assets/images/default-avatar.png',
        tag: `chat-message-${message.chatId}`,
        silent: false,
        data: { chatId: message.chatId, messageId: message._id }
      };

      this.notificationService.showNotification(title, options)
        .catch(err => this.logger.error('NotificationHandler: showNotification promise rejected:', err));
    }
  }



  public getActiveChatId(): string | null {
    return this.currentActiveChatId;
  }

  getChat(chatId: string): Observable<Chat> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));

    return this.http.get<Chat>(`${this.apiUrl}/chats/${chatId}`, { headers });
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
            this.logger.error('Invalid date encountered:', userStatus.lastActive);
            return 'offline';
          }
        } catch (e) {
          this.logger.error('Error parsing date:', e, userStatus.lastActive);
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
          this.logger.error('Error formatting date:', e);
          return 'last seen recently';
        }
      })
    );
  }
  getSocket(): Socket | undefined {
    return this.socket;
  }

  private loadInitialUserStatuses(): void {
    const headers = this.getHeaders();
    if (!headers) return;

    this.http.get<Record<string, { lastActive: string, online: boolean }>>(`${this.apiUrl}/api/users/status`, { headers })
      .subscribe({
        next: (httpUserStatuses) => {

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
            this.userStatusesSubject.next(currentStatusesInSubject);
          }
        },
        error: (err) => {
          this.logger.error('Error loading initial user statuses from HTTP:', err);
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

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/users`);
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

    const url = `${this.apiUrl}/chats/${chatId}/mark-as-read`;

    return this.http.post(url, {}, { headers }).pipe(
      tap(() => {
      }),
    );
  }

  sendTyping(chatId: string, isTyping: boolean) {
    if (this.socket) {
      this.socket.emit('typing', { chatId, isTyping });
    }
  }

  onTyping(): Observable<{ chatId: string; senderId: string; isTyping: boolean }> {
    return new Observable((observer) => {
      if (!this.socket) {
        observer.error(new Error('Socket not initialized'));
        return;
      }

      this.socket.on('typing', (data: { chatId: string; senderId: string; isTyping: boolean }) => {
        observer.next(data);
      });
    });
  }

  getChats(): Observable<Chat[]> {
    const headers = this.getHeaders();
    if (!headers) {
      this.logger.error('getChats: No headers (token likely missing).');
      return throwError(() => new Error('Not authorized for getChats'));
    }
    return this.http.get<Chat[]>(`${this.apiUrl}/chats`, { headers })
      .pipe(
        tap(() => { }),
        catchError(this.handleError)
      );
  }

  getMessages(chatId: string): Observable<Message[]> | undefined {
    const headers = this.getHeaders();
    if (!headers) return;
    return this.http.get<Message[]>(`${this.apiUrl}/messages/${chatId}`, { headers });
  }

  getSavedMessagesChat(): Observable<Chat> {
  const headers = this.getHeaders();
  if (!headers) {
    return throwError(() => new Error('Not authorized to get Saved Messages chat.'));
  }
  return this.http.get<Chat>(`${this.apiUrl}/chats/me/saved-messages`, { headers })
    .pipe(
      catchError(this.handleError)
    );
  }
  joinChat(chatId: string) {
    if (this.socket) {
      this.socket.emit('join_chat', chatId);
    } else {
      this.logger.error('Cannot join chat: Socket is not initialized');
    }
  }
  sendMessage(chatId: string, content: string, replyToDetails?: Message['replyTo']): Observable<Message> {
    return new Observable((observer) => {
      if (!this.socket || !this.socket.connected) {
        this.logger.error('Socket is not connected. Cannot send message.');
        observer.error('Socket is not connected');
        return;
      }
      const MessageData: {
        chatId: string;
        content: string;
        replyTo?: Message['replyTo'];
      } = {
        chatId,
        content,
      }
      if (replyToDetails) {
        MessageData.replyTo = replyToDetails;
      }
      // Message sent
    this.socket.emit('send_message', MessageData, (ack: { success: boolean; message: Message; error?: string | null }) => {
      if (ack && ack.success) {
          observer.next(ack.message as Message);
          observer.complete();
      } else {
          this.logger.error('Server did not acknowledge message or error:', ack);
          observer.error(ack && ack.error ? ack.error : 'Failed to send message to server');
      }
      });


      this.socket.on('message_edited', (message: Message) => {
        observer.next(message);
      });


    });
  }
  receiveMessages(callback: (message: Message) => void) {
    if (this.socket) {
      this.socket.on('receive_message', callback);
    } else {
      this.logger.error('Socket is not initialized');
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
        this.logger.error('Error editing message:', error);
        return throwError(() => error);
      })
    );
  }

  deleteMessage(messageId: string): Observable<{ success: boolean; messageId: string }> {
    const headers = this.getHeaders();
    return headers ?
      this.http.delete<{ success: boolean; messageId: string }>(`${this.apiUrl}/messages/${messageId}`, { headers })
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

  updateChatWithLastMessage(chatId: string): Observable<Chat> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));

    return this.http.get<Chat>(`${this.apiUrl}/chats/${chatId}`, { headers });
  }

  getMessagesBefore(chatId: string, beforeMessageId: string, limit: number = 20): Observable<Message[]> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));

    return this.http.get<Message[]>(
      `${this.apiUrl}/messages/${chatId}?before=${beforeMessageId}&limit=${limit}`,
      { headers }
    ).pipe(
      map((messages: Message[]) => Array.isArray(messages) ? messages : []),
      catchError(error => {
        this.logger.error('Error loading older messages:', error);
        return throwError(() => error);
      })
    );
  }

  createOrGetDirectChat(userId: string): Observable<Chat> {
    const token = this.tokenService.getToken();
    if (!token) {
      this.logger.error('No token found, cannot create chat');
      return throwError(() => new Error('Authentication required'));
    }

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });

    return this.http.post<Chat>(`${this.apiUrl}/chats`, { recipientId: userId }, { headers })
      .pipe(
        catchError(error => {
          this.logger.error('Error creating or getting direct chat:', error);
          return throwError(() => new Error(`Failed to create chat: ${error.message}`));
        })
      );
  }

  forwardMessage(messageId: string, targetChatId: string): Observable<Message> {
    const url = `${this.apiUrl}/messages/${messageId}/forward`;
    return this.http.post<Message>(url, { targetChatId }, this.getHttpOptions()).pipe(
      catchError(this.handleError)
    );
  }

  private handleError = (error: HttpErrorResponse | Error): Observable<never> => {
    this.logger.error('ChatService: An API error occurred in handleError:', error);
    let errorMessage = 'An unknown error occurred!';
    if (error instanceof HttpErrorResponse) {
      if (error.error instanceof ErrorEvent) {
        errorMessage = `Error: ${error.error.message}`;
      } else if (error.status) {
        errorMessage = `Error Code: ${error.status}\nMessage: ${error.message || (error.error && error.error.message) || error.statusText}`;
      }
    } else {
      errorMessage = error.message || errorMessage;
    }
    return throwError(() => new Error(errorMessage));
  }

  getAvailableChatsForForward(): Observable<Chat[]> {
    const url = `${this.apiUrl}/messages/available-for-forward`;
    return this.http.get<Chat[]>(url, this.getHttpOptions()).pipe(
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

  public getApiUrl(): string {
    return this.apiUrl;
  }

  toggleReaction(messageId: string, reactionType: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('toggle_reaction', { messageId, reactionType });
    } else {
      this.logger.error('Socket not connected. Cannot toggle reaction.');
    }
  }

  deleteChat(chatId: string): Observable<{ message: string }> {
    const headers = this.getHeaders();
    if (!headers) {
      this.router.navigate(['/login']);
      return throwError(() => new Error('Not authorized for deleteChat'));
    }
    return this.http.delete<{ message: string }>(`${this.apiUrl}/chats/${chatId}`, { headers });
  }

  searchMessages(chatId: string, query: string): Observable<Message[]> {
    const headers = this.getHeaders();
    if (!headers) {
      this.logger.error('SearchMessages: Not authorized');
      return throwError(() => new Error('Not authorized'));
    }

    let params = new HttpParams();
    params = params.append('query', query);

    const url = `${this.apiUrl}/messages/search/${chatId}`;

    return this.http.get<Message[]>(url, { headers, params })
      .pipe(
        map(messages => {
          return messages.map(msg => ({
              ...msg,
              timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : new Date(msg.timestamp).toISOString()
          }));
        }),
        catchError(error => {
          this.logger.error('Error searching messages in service:', error);
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

  forwardMultipleMessages(messageIds: string[], targetChatId: string): Observable<{ message: string }> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));
    return this.http.post<{ message: string }>(`${this.apiUrl}/messages/forward-multiple`, { messageIds, targetChatId }, { headers })
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

  // Favicon methods
  private recalculateTotalUnread(allChats: Chat[]): void {
    const currentUserId = this.tokenService.getUserId();
    if (!currentUserId) {
      this.totalUnreadCountSubject.next(0);
      return;
    }

    let total = 0;
    allChats.forEach(chat => {
      if (chat.unreadCounts) {
        const unreadEntry = chat.unreadCounts.find(uc => {
          const entryUserId = (typeof uc.userId === 'string') ? uc.userId : (uc.userId as unknown as { _id: string })?._id;
          return entryUserId === currentUserId;
        });
        if (unreadEntry && unreadEntry.count > 0) {
          total += unreadEntry.count;
        }
      }
    });
    this.totalUnreadCountSubject.next(total);
  }

  uploadMediaFile(
    chatId: string,
    file: File,
    caption?: string,
    replyToContext?: Message['replyTo'],
    durationInSeconds?: number
  ): Observable<{ message: string; savedMessage: Message }> {

    const headers = this.getHeaders();

    if (!headers) {
      return throwError(() => new Error('Not authorized for file upload'));
    }

    const formData = new FormData();

    formData.append('mediaFile', file, file.name);

    if (caption) {
      formData.append('caption', caption);
    }
    if (durationInSeconds !== undefined) {
      formData.append('duration', durationInSeconds.toString());
    }
    if (replyToContext) {
      try {
        const replyToString = JSON.stringify(replyToContext);
        formData.append('replyTo', replyToString);
      } catch (e) {
        this.logger.error('ChatService: ERROR - Error stringifying replyToContext:', e);
      }
    }

    const finalHeaders = headers.delete('Content-Type');

    const apiUrlFromGetter = this.getApiUrl();

    if (typeof apiUrlFromGetter !== 'string' || !apiUrlFromGetter) {
        return throwError(() => new Error('API URL is not configured correctly.'));
    }

    if (typeof chatId !== 'string' || !chatId) {
        return throwError(() => new Error('chatId is invalid for upload URL.'));
    }

    const uploadUrl = `${apiUrlFromGetter}/api/files/upload/chat/${chatId}`;

    return this.http.post<{ message: string; savedMessage: Message }>(uploadUrl, formData, {
      headers: finalHeaders
    }).pipe(
      catchError(error => {
        this.logger.error('ChatService: S11 - HTTP POST error:', error);
        return this.handleError(error);
      })
    );
  }

  public updateTotalUnreadCount(count: number): void {
    this.totalUnreadCountSubject.next(count);
  }

  createGroupChat(groupData: { name: string; participantIds: string[] }): Observable<Chat> {
    const httpOptions = this.getHttpOptions();
    if (!httpOptions) {
      return throwError(() => new Error('Authorization token not found for createGroupChat'));
    }
    const payload = {
      name: groupData.name,
      participants: groupData.participantIds
    };
    return this.http.post<Chat>(`${this.apiUrl}/chats/group`, payload, httpOptions)
      .pipe(
        catchError(this.handleError)
      );
  }

  leaveGroup(chatId: string): Observable<{ message: string }> {
    const headers = this.getHeaders();
    if (!headers) {
      return throwError(() => new Error('Not authorized to leave group.'));
    }
    return this.http.post<{ message: string }>(`${this.apiUrl}/chats/${chatId}/leave`, {}, { headers })
      .pipe(
        catchError(this.handleError)
      );
  }

  updateGroupName(chatId: string, newName: string): Observable<Chat> {
    const headers = this.getHeaders();
    if (!headers) {
      return throwError(() => new Error('Not authorized to update group name.'));
    }

    return this.http.patch<Chat>(
      `${this.apiUrl}/chats/${chatId}/group/name`,
      { name: newName },
      { headers }
    ).pipe(
      catchError(this.handleError)
    );
  }

  updateGroupAvatar(chatId: string, file: File): Observable<Chat> {
    const token = this.tokenService.getToken();
    if (!token) {
      this.router.navigate(['/login']);
      return throwError(() => new Error('Not authorized for group avatar update (token missing)'));
    }

    const formData = new FormData();
    formData.append('avatar', file, file.name);

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    return this.http.patch<Chat>(`${this.apiUrl}/chats/${chatId}/group/avatar`, formData, {
      headers: headers
    }).pipe(
      tap(() => {
      }),
      catchError((error: HttpErrorResponse) => {
      this.logger.error('ChatService: Error updating group avatar:', error);
      let errorMessage = 'Failed to update group avatar.';
      if (error.error && typeof error.error.message === 'string') {
        errorMessage = error.error.message;
      } else if (typeof error.message === 'string') {
        errorMessage = error.message;
      }
      return throwError(() => new Error(errorMessage));
      })
    );
  }

  addGroupParticipants(chatId: string, participantIds: string[]): Observable<Chat> {
    const headers = this.getHeaders();
    if (!headers) {
      return throwError(() => new Error('Not authorized to add participants'));
    }

    return this.http.post<Chat>(
      `${this.apiUrl}/chats/${chatId}/group/participants`,
      { participantIds },
      { headers }
    ).pipe(
      catchError(this.handleError)
    );
  }

  removeGroupParticipant(chatId: string, participantId: string): Observable<Chat> {
    const headers = this.getHeaders();
    if (!headers) {
      return throwError(() => new Error('Not authorized to remove participant'));
    }

    return this.http.delete<Chat>(
      `${this.apiUrl}/chats/${chatId}/group/participants/${participantId}`,
      { headers }
    ).pipe(
      catchError(this.handleError)
    );
  }

  deleteGroup(chatId: string): Observable<{ message: string }> {
    return this.deleteChat(chatId);
  }


  searchUsers(query: string): Observable<User[]> {
    const headers = this.getHeaders();
    if (!headers) {
      return throwError(() => new Error('Not authorized to search users'));
    }

    return this.http.get<User[]>(
      `${this.apiUrl}/chats/search?query=${encodeURIComponent(query)}`,
      { headers }
    ).pipe(
      catchError(this.handleError)
    );
  }

  deleteGroupAvatar(chatId: string): Observable<Chat> {
    const token = this.tokenService.getToken();
    if (!token) {
      this.router.navigate(['/login']);
      return throwError(() => new Error('Not authorized for group avatar deletion (token missing)'));
    }

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    return this.http.delete<Chat>(`${this.apiUrl}/chats/${chatId}/group/avatar`, {
      headers: headers
    }).pipe(
      tap(() => {
      }),
      catchError((error: HttpErrorResponse) => {
        this.logger.error('ChatService: Error deleting group avatar:', error);
        let errorMessage = 'Failed to delete group avatar.';
        if (error.error && typeof error.error.message === 'string') {
          errorMessage = error.error.message;
        } else if (typeof error.message === 'string') {
          errorMessage = error.message;
        }
        return throwError(() => new Error(errorMessage));
      })
    );
  }
  getChatMedia(
    chatId: string,
    type: 'images' | 'videos' | 'documents' | 'audio' = 'images',
    page: number = 1,
    limit: number = 30
  ): Observable<MediaGalleryResponse> {
    const headers = this.getHeaders();
    if (!headers) {
      return throwError(() => new Error('Not authorized to get chat media.'));
    }

    let params = new HttpParams()
      .set('type', type)
      .set('page', page.toString())
      .set('limit', limit.toString());

    const url = `${this.apiUrl}/chats/${chatId}/media`;

    return this.http.get<MediaGalleryResponse>(url, { headers, params }).pipe(
      catchError(this.handleError)
    );
  }
}
