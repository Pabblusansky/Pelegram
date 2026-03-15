import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject, BehaviorSubject, interval, map } from 'rxjs';
import { shareReplay, takeUntil } from 'rxjs/operators';
import { Chat, Message, Reaction, MessageDeletedEvent, ChatDeletedGloballyData } from '../chat.model';
import { LoggerService } from '../../services/logger.service';
import { TokenService } from '../../services/token.service';
import { ChatApiService } from './chat-api.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SocketService implements OnDestroy {
  private apiUrl = environment.apiUrl;
  private socket: Socket | undefined;
  private destroySocket$ = new Subject<void>();

  // Socket event streams
  private newMessageSubject = new Subject<Message>();
  public newMessage$ = this.newMessageSubject.asObservable();

  private messageDeletedSubject = new Subject<MessageDeletedEvent>();
  public messageDeleted$ = this.messageDeletedSubject.asObservable();

  private chatUpdatedSubject = new Subject<Chat>();
  public chatUpdated$ = this.chatUpdatedSubject.asObservable();

  private messageReactionUpdatedSubject = new Subject<{ messageId: string; reactions: Reaction[] }>();
  public messageReactionUpdated$ = this.messageReactionUpdatedSubject.asObservable();

  private chatDeletedGloballySubject = new Subject<ChatDeletedGloballyData>();
  public chatDeletedGlobally$ = this.chatDeletedGloballySubject.asObservable();

  private newChatCreatedSubject = new Subject<Chat>();
  public newChatCreated$ = this.newChatCreatedSubject.asObservable();

  private userRemovedFromChatSubject = new Subject<{ chatId: string; reason: string }>();
  public userRemovedFromChat$ = this.userRemovedFromChatSubject.asObservable();

  private userStatusesSubject = new BehaviorSubject<Record<string, { lastActive: string; online: boolean }>>({});
  public userStatuses$ = this.userStatusesSubject.asObservable().pipe(shareReplay(1));

  // Emitted when socket connects — ChatStateService subscribes to orchestrate room joins + unread recalc
  private connectedSubject = new Subject<void>();
  public connected$ = this.connectedSubject.asObservable();

  constructor(
    private logger: LoggerService,
    private tokenService: TokenService,
    private chatApiService: ChatApiService
  ) {
    this.initializeSocket();
  }

  ngOnDestroy(): void {
    this.destroySocket$.next();
    this.destroySocket$.complete();
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  getSocket(): Socket | undefined {
    return this.socket;
  }

  initializeSocket(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.destroySocket$.next();
      this.destroySocket$.complete();
      this.destroySocket$ = new Subject<void>();
    }

    const token = this.tokenService.getToken();
    if (!token) return;

    this.socket = io(this.apiUrl, { auth: { token } });

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
    });

    this.socket.on('message_reaction_updated', (data: { messageId: string; reactions: Reaction[] }) => {
      this.messageReactionUpdatedSubject.next(data);
    });

    this.socket.on('reaction_error', (data: { messageId: string; error: string }) => {
      this.logger.error('SocketService: reaction_error received', data);
    });

    this.socket.on('chat_updated', (chat: Chat) => {
      this.chatUpdatedSubject.next(chat);
    });

    this.socket.on('receive_message', (message: Message) => {
      this.newMessageSubject.next(message);
    });

    this.socket.on('connect', () => {
      this.connectedSubject.next();
      this.loadInitialUserStatuses();
      this.setupActivityPing();
    });

    this.socket.on('disconnect', () => {});

    this.socket.on('message_deleted', (data: MessageDeletedEvent) => {
      this.messageDeletedSubject.next(data);
    });

    this.socket.on('user_status_update', (statuses: Record<string, { lastActive: string; online: boolean } | string>) => {
      const formattedStatuses: Record<string, { lastActive: string; online: boolean }> = {};
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
        formattedStatuses[userId] = { lastActive: lastActiveStr, online: isOnline };
      }
      this.userStatusesSubject.next(formattedStatuses);
    });

    this.setupActivityPing();
  }

  logoutAndReconnectSocket(): void {
    if (this.socket) {
      this.socket.disconnect();
    }
    this.initializeSocket();
  }

  joinChat(chatId: string): void {
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
      const messageData: { chatId: string; content: string; replyTo?: Message['replyTo'] } = { chatId, content };
      if (replyToDetails) {
        messageData.replyTo = replyToDetails;
      }
      this.socket.emit('send_message', messageData, (ack: { success: boolean; message: Message; error?: string | null }) => {
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

  receiveMessages(callback: (message: Message) => void): void {
    if (this.socket) {
      this.socket.on('receive_message', callback);
    } else {
      this.logger.error('Socket is not initialized');
    }
  }

  sendTyping(chatId: string, isTyping: boolean): void {
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

  onMessageDeleted(): Observable<MessageDeletedEvent> {
    return this.messageDeleted$;
  }

  onMessageStatusUpdated(): Observable<{ messageId: string; status: string }> {
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

  toggleReaction(messageId: string, reactionType: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('toggle_reaction', { messageId, reactionType });
    } else {
      this.logger.error('Socket not connected. Cannot toggle reaction.');
    }
  }

  // User status helpers
  getUserLastActive(userId: string): Observable<Date | null> {
    return this.userStatuses$.pipe(
      map(statuses => {
        const userStatus = statuses[userId];
        return userStatus ? new Date(userStatus.lastActive) : null;
      })
    );
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
        if (userStatus.online === true) return 'online';

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
            year: 'numeric', month: 'long', day: 'numeric'
          })}`;
        } catch (e) {
          this.logger.error('Error formatting date:', e);
          return 'last seen recently';
        }
      })
    );
  }

  private loadInitialUserStatuses(): void {
    this.chatApiService.loadInitialUserStatuses().subscribe({
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
}
