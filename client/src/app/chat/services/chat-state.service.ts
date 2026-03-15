import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject, first, takeUntil } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Chat, Message } from '../chat.model';
import { TokenService } from '../../services/token.service';
import { SoundService } from '../../services/sound.service';
import { NotificationService } from '../../services/notifications.service';
import { LoggerService } from '../../services/logger.service';
import { SocketService } from './socket.service';
import { ChatApiService } from './chat-api.service';

@Injectable({
  providedIn: 'root',
})
export class ChatStateService implements OnDestroy {
  private currentActiveChatId: string | null = null;
  private destroy$ = new Subject<void>();

  private totalUnreadCountSubject = new BehaviorSubject<number>(0);
  public totalUnreadCount$ = this.totalUnreadCountSubject.asObservable();

  constructor(
    private tokenService: TokenService,
    private soundService: SoundService,
    private notificationService: NotificationService,
    private logger: LoggerService,
    private socketService: SocketService,
    private chatApiService: ChatApiService
  ) {
    this.setupSubscriptions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSubscriptions(): void {
    // On socket connect: fetch chats, join rooms, recalculate unread
    this.socketService.connected$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.chatApiService.getChats()
          .pipe(
            takeUntil(this.destroy$),
            tap((chats: Chat[]) => {
              this.recalculateTotalUnread(Array.isArray(chats) ? chats : []);
            })
          )
          .subscribe({
            next: (chats: Chat[]) => {
              chats.forEach(chat => {
                if (chat._id) {
                  this.socketService.joinChat(chat._id);
                }
              });
            },
            error: (err) => {
              this.logger.error('Error fetching user chats for auto-joining:', err);
            }
          });
      });

    // On new message: handle notification
    this.socketService.newMessage$
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => this.handleIncomingMessageNotification(message));

    // On chat updated: recalculate unread
    this.socketService.chatUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.chatApiService.getChats().pipe(first()).subscribe(
          allChats => this.recalculateTotalUnread(allChats as Chat[])
        );
      });

    // On new chat created: recalculate unread
    this.socketService.newChatCreated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.chatApiService.getChats().pipe(first()).subscribe(
          allChats => this.recalculateTotalUnread(allChats as Chat[])
        );
      });
  }

  public setActiveChatId(chatId: string | null): void {
    this.currentActiveChatId = chatId;
  }

  public getActiveChatId(): string | null {
    return this.currentActiveChatId;
  }

  public updateTotalUnreadCount(count: number): void {
    this.totalUnreadCountSubject.next(count);
  }

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

  private handleIncomingMessageNotification(message: Message): void {
    const isAppVisible = this.notificationService.isAppCurrentlyVisible();
    const isChatActive = this.currentActiveChatId === message.chatId;

    if (isAppVisible && isChatActive) return;

    if (isAppVisible && !isChatActive) {
      this.soundService.playSound('message');
      return;
    }

    if (!this.notificationService.areNotificationsGloballyEnabled()) return;

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
}
