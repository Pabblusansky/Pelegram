import { Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { debounceTime, Observable, Subject, takeUntil } from 'rxjs';
import { ChatApiService } from '../services/chat-api.service';
import { SocketService } from '../services/socket.service';
import { ChatStateService } from '../services/chat-state.service';
import { Chat, Message, Reaction, User} from '../chat.model';
import { MessageInputComponent } from "../message-input/message-input.component";
import { Router } from '@angular/router';
import { ForwardDialogComponent } from '../forward/forward-dialogue.component';
import { SafeHtml } from '@angular/platform-browser';
import { SoundService } from '../../services/sound.service';
import { FileSizePipe } from '../../pipes/fileSize/file-size.pipe';
import { GroupInfoModalComponent } from '../group/group-info-modal/group-info-modal/group-info-modal.component';
import { ConfirmationService } from '../../shared/services/confirmation.service';
import { GroupReactionsPipe } from '../../pipes/fileSize/groupReactions/group-reactions.pipe';
import { SharedMediaGalleryComponent } from "../shared-media-gallery/shared-media-gallery.component";
import { LightboxComponent } from '../../shared/lightbox/lightbox.component';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { AfterViewInit, AfterViewChecked } from '@angular/core';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { AudioPlayerComponent } from "../../shared/components/audio-player/audio-player.component";
import { MessageContextMenuComponent } from '../message-context-menu/message-context-menu.component';
import { ChatHeaderComponent } from '../chat-header/chat-header.component';
import { ChatSearchBarComponent } from '../chat-search-bar/chat-search-bar.component';
import { LoggerService } from '../../services/logger.service';
import { TokenService } from '../../services/token.service';
import { ToastService } from '../../utils/toast-service';
import { SelectionService } from './services/selection.service';
import { MessageActionsService } from './services/message-actions.service';
import { MediaUrlService, DEFAULT_AVATAR, DEFAULT_GROUP_AVATAR, SAVED_MESSAGES_ICON } from './services/media-url.service';
import { scrollToBottomButtonAnimation } from '../../shared/animations';
import { MessageTextService } from './services/message-text.service';
import { TypingIndicatorService } from './services/typing-indicator.service';
import { ScrollStabilizerService } from './services/scroll-stabilizer.service';
import { MediaModalService } from './services/media-modal.service';
import { MessageSearchService } from './services/message-search.service';
import { MessageListService, GroupedReaction } from './services/message-list.service';
import { PinnedMessageService } from './services/pinned-message.service';

@Component({
  selector: 'app-chat-room',
  templateUrl: './chat-room.component.html',
  styleUrls: ['./chat-room.component.scss'],
  animations: [scrollToBottomButtonAnimation],
  
  standalone: true,
  imports: [
    MessageInputComponent,
    CommonModule, FormsModule,
    ForwardDialogComponent,
    LightboxComponent,
    FileSizePipe,
    GroupInfoModalComponent,
    GroupReactionsPipe,
    SharedMediaGalleryComponent,
    ScrollingModule,
    AudioPlayerComponent,
    MessageContextMenuComponent,
    ChatHeaderComponent,
    ChatSearchBarComponent
  ],
  providers: [SelectionService, MessageActionsService, TypingIndicatorService, ScrollStabilizerService, MediaModalService, MessageSearchService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})



export class ChatRoomComponent implements OnInit, OnDestroy, AfterViewInit, AfterViewChecked {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private chatApiService = inject(ChatApiService);
  private socketService = inject(SocketService);
  private chatStateService = inject(ChatStateService);
  private cdr = inject(ChangeDetectorRef);
  private soundService = inject(SoundService);
  private confirmationService = inject(ConfirmationService);
  private logger = inject(LoggerService);
  private tokenService = inject(TokenService);
  private toastService = inject(ToastService);
  selectionService = inject(SelectionService);
  messageActionsService = inject(MessageActionsService);
  private mediaUrlService = inject(MediaUrlService);
  private messageTextService = inject(MessageTextService);

  private componentIsCurrentlyFocused: boolean = document.hasFocus(); 
  @HostListener('window:focus', ['$event'])
  onWindowFocus(_event: FocusEvent): void {
    if (!this.componentIsCurrentlyFocused) {
      if (this.chatId && this.isChatCurrentlyOpenAndVisible()) {
        this.triggerMarkAsRead();
      }
    }
    this.componentIsCurrentlyFocused = true;
    this.isWindowFocused = true;
  }

  @HostListener('window:blur', ['$event'])
  onWindowBlur(_event: FocusEvent): void {
    this.componentIsCurrentlyFocused = false;
    this.isWindowFocused = false;
  }

  isTyping = false;
  @Input() selectedChatId: string | null = null;
  private typingIndicator = inject(TypingIndicatorService);
  chatId: string | null = null;
  messages: Message[] = [];
  messagesWithDividers: any = [];
  userId: string | null = null;
  public isAtBottom = true;
  public isAtTop: boolean = false;
  users: User[] = [];
  private markAsReadDebounce = new Subject<void>();
  private editTextareaRef: ElementRef | null = null;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private destroy$ = new Subject<void>();
  isLoadingMore = false;
  noMoreMessages = false;
  scrollHeightBeforeLoad = 0;
  loadMoreDebounce: Subject<void> = new Subject<void>();
  lastLoadTimestamp = 0;
  chatDetails: Chat | null = null;
  otherParticipant: User | null = null;
  otherParticipantStatus$: Observable<string> | null = null;
  isOtherParticipantOnline$: Observable<boolean> | null = null;
  isChatEffectivelyDeleted: boolean = false;
  public unreadMessagesCount: number = 0;
  private newMessagesWhileScrolledUp: Message[] = [];
  private isWindowFocused: boolean = document.hasFocus();
  @ViewChild(MessageInputComponent) messageInputComponent?: MessageInputComponent; 
  @ViewChild(CdkVirtualScrollViewport) scrollViewport!: CdkVirtualScrollViewport;
  showKeyboardHelp: boolean = false;
  public returnToMessageIdAfterQuoteJump: string | null = null;
  showMediaGallery: boolean = false;
  private resizeObserver: ResizeObserver | undefined;
  private isScrollingToBottom: boolean = false;
  private scrollStabilizer = inject(ScrollStabilizerService);
  private mediaModal = inject(MediaModalService);
  private messageSearch = inject(MessageSearchService);
  private messageList = inject(MessageListService);
  private pinnedMessage = inject(PinnedMessageService);
  // Search functionality
  get isSearchActive(): boolean { return this.messageSearch.isActive; }
  get searchResults(): Message[] { return this.messageSearch.results; }
  @ViewChild(ChatSearchBarComponent) searchBar?: ChatSearchBarComponent;
  isLoadingContext: boolean = false;
  private isScrollingProgrammatically: boolean = false;
  // Read receipts
  readReceiptsMessageId: string | null = null;
  // Group chat functionality
  isGroupChat: boolean = false;
  showGroupInfoModal: boolean = false;
  // Lightbox functionality
  showLightbox: boolean = false;
  lightboxItems: Message[] = [];
  lightboxStartIndex: number = 0;

  // Template accessors for MessageActionsService state
  get activeContextMenuId(): string | null { return this.messageActionsService.activeContextMenuId; }
  set activeContextMenuId(value: string | null) { this.messageActionsService.activeContextMenuId = value; }
  get menuPosition(): { x: number; y: number } { return this.messageActionsService.menuPosition; }
  set menuPosition(value: { x: number; y: number }) { this.messageActionsService.menuPosition = value; }
  get selectedMessageId(): string | null { return this.messageActionsService.selectedMessageId; }
  set selectedMessageId(value: string | null) { this.messageActionsService.selectedMessageId = value; }
  get replyingToMessage(): Message | null { return this.messageActionsService.replyingToMessage; }
  get pinnedMessageDetails(): Message | null { return this.messageActionsService.pinnedMessageDetails; }
  set pinnedMessageDetails(value: Message | null) { this.messageActionsService.pinnedMessageDetails = value; }
  get messagetoForward(): any { return this.messageActionsService.messagetoForward; }
  get showForwardDialogue(): boolean { return this.messageActionsService.showForwardDialogue; }
  get availableReactions(): string[] { return this.messageActionsService.availableReactions; }

  constructor() {
    this.markAsReadDebounce.pipe(debounceTime(500), takeUntil(this.destroy$)).subscribe(() => {
      this.markMessagesAsRead();
    });
  }

  ngOnInit(): void {
    this.componentIsCurrentlyFocused = document.hasFocus();

    this.selectionService.init({
      messages: () => this.messages,
      messagesWithDividers: () => this.messagesWithDividers,
      userId: () => this.userId,
      updateMessagesWithDividers: () => this.updateMessagesWithDividers(),
      detectChanges: () => this.cdr.detectChanges(),
      showToast: (msg, duration?) => this.showToast(msg, duration),
      formatTimestamp: (ts) => this.formatTimestamp(ts),
      removeMessages: (ids) => { this.messages = this.messages.filter(msg => !ids.includes(msg._id!)); },
      chatApiService: this.chatApiService,
      confirmationService: this.confirmationService,
      logger: this.logger,
    });

    this.messageSearch.init({
      messages: () => this.messages,
      updateMessagesWithDividers: () => this.updateMessagesWithDividers(),
      detectChanges: () => this.cdr.detectChanges(),
    });

    this.messageActionsService.init({
      messages: () => this.messages,
      messagesWithDividers: () => this.messagesWithDividers,
      userId: () => this.userId,
      chatId: () => this.chatId,
      chatDetails: () => this.chatDetails,
      updateMessagesWithDividers: () => this.updateMessagesWithDividers(),
      detectChanges: () => this.cdr.detectChanges(),
      showToast: (msg, duration?) => this.showToast(msg, duration),
      removeMessages: (ids) => { this.messages = this.messages.filter(msg => !ids.includes(msg._id!)); },
      focusMessageInput: () => this.messageInputComponent?.focusInput(),
      chatApiService: this.chatApiService,
      socketService: this.socketService,
      confirmationService: this.confirmationService,
      logger: this.logger,
    });

    this.loadMoreDebounce.pipe(
      debounceTime(100),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.executeLoadMoreMessages();
    });
    
    this.socketService.chatDeletedGlobally$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        if (this.chatId && this.chatId === data.chatId) {
          this.handleCurrentChatWasDeleted(data.deletedBy);
        }
    });
    
    this.socketService.chatUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(updatedChat => {
        if (updatedChat._id === this.chatId) {
          this.chatDetails = { ...this.chatDetails, ...updatedChat };
          this.updatePinnedMessageDetails();
          this.cdr.detectChanges();
        }
    });
    this.socketService.messageReactionUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(update => {
      this.messageActionsService.handleReactionUpdate(update.messageId, update.reactions);
    });

    this.socketService.onTyping()
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: { chatId: string; senderId: string; isTyping: boolean }) => {
      if (data.chatId === this.chatId) {
        this.typingIndicator.track(data.senderId, data.isTyping, () => {
          this.isTyping = this.typingIndicator.isAnyoneTyping;
          this.cdr.detectChanges();
        });

        this.isTyping = this.typingIndicator.isAnyoneTyping;
        this.cdr.detectChanges();
        if (this.isTyping && this.isAtBottom) {
          setTimeout(() => this.scrollToBottom(), 100);
        }
      }
    });

    this.socketService.onMessageEdited()
      .pipe(takeUntil(this.destroy$))
      .subscribe((editedMessage: Message) => {
        if (this.chatId !== editedMessage.chatId) {
          return;
        }

        const index = this.messages.findIndex(m => m._id === editedMessage._id);
        if (index === -1) {
          return;
        }
        
        const ismyMessage = this.messages[index].ismyMessage;
        const isEditing = this.messages[index].isEditing;
        const editedContent = this.messages[index].editedContent;
        
        this.messages[index] = {
          ...this.messages[index],
          content: editedMessage.content,
          edited: true,
          editedAt: editedMessage.editedAt || new Date(),
          ismyMessage,
          isEditing,
          editedContent
        };
        
        this.messages[index].isEditing = false;
        delete this.messages[index].editedContent;

        if (editedMessage.senderId !== this.userId) {
          this.messageActionsService.applyEditAnimation(editedMessage._id!);
        }
        
        this.updateMessagesWithDividers();
        this.cdr.detectChanges();
    });
    
    this.route.paramMap
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
      const routeChatId = params.get('chatId');
      this.chatId = routeChatId || this.selectedChatId;
      if (this.chatId) {
        this.chatStateService.setActiveChatId(this.chatId);
        this.isChatEffectivelyDeleted = false;
        this.loadMessages();
        this.loadChatDetails();
        this.markMessagesAsRead();
              if (this.componentIsCurrentlyFocused && this.isChatCurrentlyOpenAndVisible()) {
        this.triggerMarkAsRead();
      }
      }
    });
  
    this.userId = this.tokenService.getUserId();
    

    
    this.chatApiService.getUsers().subscribe({
      next: (users: User[]) => {
        this.users = users;
      },
      error: (err) => {
        this.logger.error('Failed to load users:', err);
      },
    });

    this.socketService.onMessageStatusUpdated()
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: any) => {
      const message = this.messages.find(msg => msg._id === data.messageId);
      if (message) {
        message.status = data.status;
        if (data.readBy) {
          if (!message.readBy) {
            message.readBy = [];
          }
          const alreadyTracked = message.readBy.some(r => r.userId === data.readBy.userId);
          if (!alreadyTracked) {
            message.readBy.push(data.readBy);
          }
        }
        this.updateMessagesWithDividers();
        this.cdr.detectChanges();
      }
    });

    this.socketService.newMessage$
    .pipe(takeUntil(this.destroy$))
    .subscribe(message => {
      const isCurrentChat = this.chatId === message.chatId;
      
      let isMyMessage: boolean;
      if (typeof message.senderId === 'string') {
        isMyMessage = message.senderId === this.userId;
      } else if (typeof message.senderId === 'object' && message.senderId?._id) {
        isMyMessage = message.senderId._id === this.userId;
      } else {
        isMyMessage = false;
      }
    
      if (isCurrentChat) {
        const isMyOwnMessageJustSent = isMyMessage && !this.messages.find(m => m._id === message._id);
        this.addOrUpdateMessage(message, isMyOwnMessageJustSent);
      }
      if (!isMyMessage) {
        if (!isCurrentChat || (isCurrentChat && !this.isWindowFocused)) {
          this.soundService.playSound('message');
        }
      }
      if (isCurrentChat && message.senderId !== this.userId) {
        if (this.componentIsCurrentlyFocused && this.isAtBottom) {
          this.triggerMarkAsRead();
        }
      }
    });

    this.socketService.onMessageDeleted()
    .pipe(takeUntil(this.destroy$))
    .subscribe(event => {
      const deletedMessageId = event.messageId;
      
      if (!event.chatId || event.chatId === this.chatId) {
        this.messages = this.messages.filter(msg => msg._id && msg._id !== deletedMessageId);
        this.updateMessagesWithDividers();
        this.cdr.detectChanges();
      }
    });
  }
  
  ngAfterViewInit(): void {
    this.setupResizeObserver();
  }
  triggerMarkAsRead(): void {
    this.markAsReadDebounce.next();
  }

  onVirtualScrollIndexChange(): void {
    if (!this.scrollViewport) return;

    const offsetBottom = this.scrollViewport.measureScrollOffset('bottom');
    const offsetTop = this.scrollViewport.measureScrollOffset('top');
    
    const wasAtBottom = this.isAtBottom;
    this.isAtBottom = offsetBottom < 1;

    if (this.isAtBottom && !wasAtBottom) {
        this.clearUnreadMessagesIndicator();
        this.triggerMarkAsRead();
    }

    if (offsetTop < 300 && !this.isLoadingMore && !this.noMoreMessages && !this.isScrollingProgrammatically) {
        const now = Date.now();
        if (now - this.lastLoadTimestamp > 250) {
            this.loadMoreDebounce.next();
        }
    }
  }


  private clearUnreadMessagesIndicator(): void {
    if (this.unreadMessagesCount > 0) {
      this.unreadMessagesCount = 0;
      this.newMessagesWhileScrolledUp = [];
      this.cdr.detectChanges();
    }
  }
  ngOnDestroy(): void {
    if (this.chatId === this.chatStateService.getActiveChatId()) {
         this.chatStateService.setActiveChatId(null);
    }
    this.destroy$.next();
    this.destroy$.complete();

    this.typingIndicator.clear();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.scrollStabilizer.cancel();
    this.messageActionsService.cleanup();

  }
  
  getTypingUserName(userId: string): string {
    const user = this.users.find(u => u._id === userId);
    return user ? user.username : 'Unknown User';
  }

  get typingIndicatorText(): string {
    const names = Array.from(this.typingIndicator.typingUserIds)
      .filter(id => id !== this.userId)
      .map(id => this.getTypingUserName(id))
      .filter(name => name !== 'Unknown User');

    return this.typingIndicator.describe(names);
  }
  onInputChange(isTyping: boolean): void {
    if (this.chatId) {
      this.socketService.sendTyping(this.chatId, isTyping);
      this.isTyping = isTyping;
    }
  }
  
  formatDate(date: Date): string {
    return this.messageTextService.formatDate(date);
  }
  
  onChatNameClick(event: Event): void {
    if (this.isGroupChat) { 
      this.showGroupInfoModal = true;
    } else {
      if (this.otherParticipant && this.chatDetails?.participants?.length === 2) {
        this.navigateToUserProfile(this.otherParticipant._id, event);
      }
    }
  }

  navigateToUserProfile(userId: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    if (!userId) {
      return;
    }

    if (userId === this.userId) {
      this.router.navigate(['/profile']);
    } else {
      this.router.navigate(['/user', userId]);
    }
  }
    
  onCloseGroupInfoModal(): void {
    this.showGroupInfoModal = false;
  }

  updateMessagesWithDividers(): void {
    this.messagesWithDividers = this.messageList.withDateDividers(
      this.messages,
      date => this.formatDate(date)
    );


    this.cdr.detectChanges();

    requestAnimationFrame(() => {
      this.forceVirtualScrollRefresh();
    });
  }
  
  loadChatDetails(): void {
    if (!this.chatId) return;
    
    this.chatApiService.getChat(this.chatId).subscribe({
      next: (chat) => {
        this.chatDetails = chat;
        this.updatePinnedMessageDetails();
        this.isGroupChat = !!chat.isGroupChat;
        if (this.isGroupChat) {
          this.otherParticipant = null;
          this.otherParticipantStatus$ = null;
          this.isOtherParticipantOnline$ = null;
        } else {
        const isSavedMessages = chat.participants && chat.participants.length === 1 && chat.participants[0]._id === this.userId;

        if (!isSavedMessages && chat.participants && chat.participants.length > 0) { 
          this.otherParticipant = chat.participants.find(
            (p: User) => p._id !== this.userId
          ) || null;

          if (this.otherParticipant) {
            this.otherParticipantStatus$ = this.socketService.getUserStatusText(this.otherParticipant._id);
            this.isOtherParticipantOnline$ = this.socketService.isUserOnline(this.otherParticipant._id);
          } else {
            this.otherParticipantStatus$ = null;
            this.isOtherParticipantOnline$ = null;
          }
        } else {
          this.otherParticipant = null;
          this.otherParticipantStatus$ = null;
          this.isOtherParticipantOnline$ = null;
        }
      }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.logger.error('Error loading chat details:', err);
      }
    });
  }
  
  getChatName(): string {
    if (this.chatDetails?.participants?.length === 1 && this.chatDetails.participants[0]._id === this.userId) {
      return 'Saved Messages';
    }
    if (!this.chatDetails || !this.chatDetails.participants) {
      return 'Chat';
    }
    
    if (this.isGroupChat) {
      return this.chatDetails.name || 'Group Chat';
    }
    const otherParticipants = this.chatDetails.participants.filter(
      (p: User) => p._id !== this.userId
    );
    
    if (!otherParticipants || otherParticipants.length === 0) {
    // This case should ideally be caught by the self-chat check above
      return this.chatDetails?.participants?.[0]?.username || 'Chat';
    }
    
    return otherParticipants.map((p: User) => p.username).join(', ');
  }

  goBack(): void {
    window.history.back();
  }
  
  markMessagesAsRead(): void {
    if (this.chatId) {
      const hasUnread = this.messages.some(msg => 
        !msg.ismyMessage && msg.status !== 'read'
      );
      
      if (!hasUnread) return;
    
      this.chatApiService.markMessagesAsRead(this.chatId).subscribe({
        next: () => {},
        error: (err) => {
          this.logger.error('Failed to send markMessagesAsRead request:', err);
        }
      });
    }
  }

  trackByMessageId(index: number, item: any): string {
    if (item.type === 'divider') {
      return `divider-${item.date}`;
    }
    return item._id || `index-${index}`;
  }

  trackByReactionType(index: number, group: { type: string }): string {
    return group.type;
  }

  trackByReceiptUserId(index: number, receipt: { userId: string }): string {
    return receipt.userId;
  }

  loadMessages(): void {
    if (!this.chatId) return;

    this.isLoadingMore = true;
    this.noMoreMessages = false;
    
    if (this.resizeObserver) {
        this.resizeObserver.disconnect();
    }

    this.socketService.joinChat(this.chatId);

    this.chatApiService.getMessages(this.chatId)?.subscribe({
        next: (messagesFromServer: Message[]) => {
            this.messages = messagesFromServer.map((msg) => ({
                ...msg,
                ismyMessage: (msg.senderId && (msg.senderId as any)._id || msg.senderId) === this.userId,
                status: msg.status || 'sent'
            }));
            this.updateMessagesWithDividers();

            this.isAtTop = false;
            this.isAtBottom = true;
            this.unreadMessagesCount = 0;
            this.newMessagesWhileScrolledUp = [];
            this.isLoadingMore = false;
            
            this.cdr.detectChanges();

            requestAnimationFrame(() => {
                this.scrollToBottom(true, 'auto');
                this.setupResizeObserver();
            });

            this.triggerMarkAsRead();
        },
        error: (error) => {
            this.logger.error('Error loading messages:', error);
            this.isLoadingMore = false;
        }
    });
  }

  scrollToBottom(force: boolean = false, behavior: ScrollBehavior = 'smooth'): void {
    if (!this.scrollViewport) return;
    if (this.isScrollingProgrammatically && !force) return;
    if (this.isScrollingToBottom && !force) return;

    if (this.returnToMessageIdAfterQuoteJump) {
        this.scrollToMessage(this.returnToMessageIdAfterQuoteJump, 'center', true);
        this.returnToMessageIdAfterQuoteJump = null;
        return;
    }

    if (!force && !this.isAtBottom && this.unreadMessagesCount === 0) {
        return;
    }

    this.isScrollingToBottom = true;
    this.clearUnreadMessagesIndicator();

    const dataLength = this.scrollViewport.getDataLength();
    if (dataLength === 0) {
      this.isAtBottom = true;
      this.isScrollingToBottom = false;
      return;
    }

    // Step 1: Tell CDK to render items near the end of the list.
    this.scrollViewport.scrollToIndex(dataLength - 1, 'auto');

    // Step 2: Immediate first snap to bottom.
    const el = this.scrollViewport.elementRef.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }

    // Step 3: Use MutationObserver-based stabilizer to wait for rendering to settle.
    this.stabilizeAtBottom(() => {
      if (behavior === 'smooth') {
        // Smooth-scroll the last few pixels for a polished feel
        const scrollEl = this.scrollViewport?.elementRef.nativeElement;
        if (scrollEl) {
          const remaining = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
          if (remaining > 1) {
            scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
          }
        }
      }
      this.isAtBottom = true;
      this.isScrollingToBottom = false;
      this.cdr.detectChanges();
      this.triggerMarkAsRead();
    });
  }

  private stabilizeAtBottom(onComplete: () => void): void {
    this.scrollStabilizer.stabilize(this.scrollViewport?.elementRef.nativeElement, onComplete);
  }

  formatTimestamp(timestamp: string): string {
    return this.messageTextService.formatTimestamp(timestamp);
  }

  getMessageStatusIcon(status: string): string {
    switch (status) {
      case 'sent':
        return 'assets/sent.svg'; 
      case 'delivered':
        return 'assets/delivered.svg'; 
      case 'read':
        return 'assets/read.svg'; 
        default:
          return 'assets/delivered.svg';
    }
  }

  @ViewChildren('editTextarea') set editTextarea(textarea: QueryList<ElementRef>) {
    if (textarea && textarea.first) {
      this.editTextareaRef = textarea.first;
      setTimeout(() => {
        const textareaEl = this.editTextareaRef?.nativeElement;
        if (textareaEl) {
          textareaEl.focus();
          textareaEl.selectionStart = textareaEl.selectionEnd = textareaEl.value.length;
        }
      }, 10);
    }
  }
  
  getSelectedMessage(): Message | null {
    return this.messageActionsService.getSelectedMessage();
  }
  
  onMessageClick(message: Message, event?: MouseEvent): void {
    if (this.selectionService.isActive) {
      this.selectionService.toggle(message);
    } else {
      if (event && (event.ctrlKey || event.metaKey)) {
        this.selectionService.activate(message);
      } else {
        if (this.messageActionsService.activeContextMenuId && this.messageActionsService.activeContextMenuId !== message._id) {
          this.messageActionsService.activeContextMenuId = null;
        }
      }
    }
  }
  
  showContextMenu(event: MouseEvent, message: Message): void {
    this.messageActionsService.showContextMenu(event, message);
  }
  
  startLongPress(event: TouchEvent, message: Message): void {
    if (this.selectionService.isActive) {
      this.endLongPress();
      return;
    }

    if (event && event.preventDefault) {
      event.preventDefault();
    }

    this.longPressTimer = setTimeout(() => {
      if (!this.isSearchActive && !message.isEditing) {
        this.selectionService.activate(message);
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
      }
    }, 500);
  }
  
  endLongPress(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  setMenuPosition(event: Event): void {
    let clientX: number, clientY: number;

    if (event && 'touches' in event &&
        Array.isArray((event as any).touches) &&
        (event as any).touches.length > 0 &&
        (event as any).touches[0]) {
      clientX = (event as any).touches[0].clientX;
      clientY = (event as any).touches[0].clientY;
    } else if (event && 'clientX' in event && 'clientY' in event) {
      clientX = (event as any).clientX;
      clientY = (event as any).clientY;
    } else {
      const target = event.target as HTMLElement;
      if (target) {
        const rect = target.getBoundingClientRect();
        clientX = rect.right;
        clientY = rect.top;
      } else {
        clientX = window.innerWidth / 2;
        clientY = window.innerHeight / 2;
      }
    }
    
    // Calculate menu position
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    const menuWidth = 180;
    const menuHeight = 200;
    
    let x = clientX;
    let y = clientY;
    
    if (x + menuWidth > windowWidth) {
      x = windowWidth - menuWidth - 10;
    }
    
    if (y + menuHeight > windowHeight) {
      y = windowHeight - menuHeight - 10;
    }
    
    this.menuPosition = { x, y };
  }
  
  startEdit(message: Message, isLastMessageEdit: boolean = false): void {
    this.messageActionsService.startEdit(message, isLastMessageEdit);
  }

  cancelEdit(messageFromUI: Message): void {
    this.messageActionsService.cancelEdit(messageFromUI);
  }

  saveMessageEdit(messageFromUI: Message): void {
    this.messageActionsService.saveMessageEdit(messageFromUI);
  }


  
  async deleteMessage(messageId: string | undefined): Promise<void> {
    return this.messageActionsService.deleteMessage(messageId);
  }

  copyMessageText(message: Message): void {
    this.messageActionsService.copyMessageText(message);
  }


  get getAvatarUrl(): string {
    if (!this.chatDetails || !this.userId || !this.users || this.users.length === 0) {
      return DEFAULT_AVATAR;
    }

    if (this.isGroupChat) {
      if (this.chatDetails.groupAvatar) {
        return this.mediaUrlService.resolve(this.chatDetails.groupAvatar);
      }
      return DEFAULT_GROUP_AVATAR;
    }
    const isSavedMessagesChat =
      this.chatDetails.participants &&
      this.chatDetails.participants.length === 1 &&
      this.chatDetails.participants[0]._id === this.userId;

    if (isSavedMessagesChat) {
      return SAVED_MESSAGES_ICON;
    }

    return this.mediaUrlService.avatar(this.otherParticipant?.avatar);
  }

  handleAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    this.logger.error(`Failed to load avatar image: ${img.src}`);
    
    // Set default avatar image if the current one failed to load
    if (!img.src.includes('default-avatar.png')) {
      img.src = 'assets/images/default-avatar.png';
    }
  }

  getUserAvatar(userId: string): string {
    const user = this.users.find(u => u._id === userId);
    return this.mediaUrlService.avatar(user?.avatar);
  }

  getUserName(userId: string): string {
    const user = this.users.find(u => u._id === userId);
    return user ? user.username : 'Unknown';
  }

  toggleReadReceipts(message: any, event: Event): void {
    event.stopPropagation();
    if (!message.readBy || message.readBy.length === 0) return;
    this.readReceiptsMessageId = this.readReceiptsMessageId === message._id ? null : message._id;
    this.cdr.detectChanges();
  }

  showReadReceiptsForMessage(message: Message): void {
    if (!message.readBy || message.readBy.length === 0) return;
    this.readReceiptsMessageId = message._id || null;
    this.cdr.detectChanges();
  }
  
  forwardMessage(message: Message): void {
    this.messageActionsService.forwardMessage(message);
  }

  cancelForward(): void {
    this.messageActionsService.cancelForward();
  }

  confirmForward(targetChatId: string): void {
    this.messageActionsService.confirmForward(targetChatId);
  }

  public showToast(message: string, duration: number = 3000): void {
    this.toastService.showToast(message, duration);
  }

  @HostListener('document:click', ['$event'])
  closeContextMenu(event: Event): void {
    const target = event.target as HTMLElement;
    if (
      this.messageActionsService.activeContextMenuId &&
      !target.closest('.context-menu') &&
      !target.closest('.message-menu-icon')
    ) {
      this.messageActionsService.activeContextMenuId = null;
      setTimeout(() => {
        this.messageActionsService.selectedMessageId = null;
      }, 300);
    }
    // Close read receipts panel on outside click
    if (this.readReceiptsMessageId && !target.closest('.read-receipts-panel') && !target.closest('.status')) {
      this.readReceiptsMessageId = null;
    }
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.messageActionsService.activeContextMenuId = null;
    this.messageActionsService.selectedMessageId = null;
  }
  
  @HostListener('document:keydown', ['$event'])
  handleGlobalKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const isInputField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    
    if (isInputField && this.isSearchActive && target.classList.contains('search-input')) {
      return;
    }

    if (isInputField) {
      return;
    }

    if (event.key === 'Escape') {
      if (this.readReceiptsMessageId) {
        this.readReceiptsMessageId = null;
        event.preventDefault();
        return;
      }

      if (this.selectionService.isActive) {
        this.selectionService.cancel();
        event.preventDefault();
        return;
      }

      if (this.isSearchActive) {
        this.closeSearch();
        event.preventDefault();
        return;
      }

      if (this.messageActionsService.activeContextMenuId) {
        this.messageActionsService.activeContextMenuId = null;
        this.messageActionsService.selectedMessageId = null;
        event.preventDefault();

        this.messagesWithDividers.forEach((item: any) => {
          if (item.type === 'message' && item.isEditing) {
            this.cancelEdit(item);
          }
        });
        return;
      }
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
      event.preventDefault();
      this.toggleSearch();
      return;
    }
    
    if (event.key === 'F3' || ((event.ctrlKey || event.metaKey) && event.key === 'f')) {
      event.preventDefault();
      this.toggleSearch();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'a' && this.messages.length > 0) {
      event.preventDefault();
      this.selectionService.selectAll();
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      this.scrollToBottom(true);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      if (this.scrollViewport) {
        this.isScrollingProgrammatically = true;
        const el = this.scrollViewport.elementRef.nativeElement;
        el.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => {
          this.isScrollingProgrammatically = false;
        }, 1500);
      }
      return;
    }

    if (event.key === '?' && !isInputField) {
    event.preventDefault();
    this.toggleKeyboardHelp();
    return;
    }

    if (this.selectionService.isActive && this.selectionService.selectedMessagesMap.size > 0 &&
        (event.ctrlKey || event.metaKey) && event.key === 'c') {
      event.preventDefault();
      this.selectionService.copySelected();
      return;
    }

    if (this.selectionService.isActive && this.selectionService.selectedMessagesMap.size > 0 &&
        (event.key === 'Delete' || event.key === 'Backspace')) {
      if (this.selectionService.canDeleteSelected()) {
        event.preventDefault();
        this.selectionService.deleteSelected();
      }
      return;
    }
    
    if (event.key === 'Enter' && event.ctrlKey) {
      const editingMessage = this.messagesWithDividers.find(
        (item: any) => item.type === 'message' && item.isEditing
      );

      if (editingMessage) {
        this.saveMessageEdit(editingMessage);
        event.preventDefault();
      }
    }
  }

  ngAfterViewChecked(): void {
    const editingMessage = this.messagesWithDividers.find(
      (item: any) => item.type === 'message' && item.isEditing
    );
    
    if (editingMessage && this.editTextareaRef) {
      const textareaEl = this.editTextareaRef.nativeElement;
      if (document.activeElement !== textareaEl) {
        textareaEl.focus();
      }
    }
  }

  formatEditedTime(editedAt?: string): string {
    return this.messageTextService.formatEditedTime(editedAt);
  }

  loadMoreMessages(): void {
    if (!this.isLoadingMore && !this.noMoreMessages && this.messages.length > 0) {
      this.loadMoreDebounce.next();
    }
  }

  executeLoadMoreMessages(): void {
    if (!this.chatId || this.isLoadingMore || this.noMoreMessages) {
      return;
    }
    if (this.messages.length === 0) {
      this.noMoreMessages = true;
      return;
    }
    
    this.isLoadingMore = true;
    this.lastLoadTimestamp = Date.now();
    
    const oldestMessage = this.messages[0];
    if (!oldestMessage?._id) {
        this.isLoadingMore = false;
        return;
    }

    const oldFirstMessageId = oldestMessage._id;

    this.chatApiService.getMessagesBefore(this.chatId, oldestMessage._id, 30)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (olderMessages) => {
            if (olderMessages.length === 0) {
              this.noMoreMessages = true;
              this.isLoadingMore = false;
              this.cdr.detectChanges();
              return;
            }
            const newMessages = olderMessages.map(msg => ({
                ...msg,
                ismyMessage: (msg.senderId && (msg.senderId as any)._id || msg.senderId) === this.userId,
                status: msg.status || 'sent'
            }));

            // Capture scroll position of the anchor element before prepending
            const anchorEl = document.getElementById('message-' + oldFirstMessageId);
            const anchorTopBefore = anchorEl?.getBoundingClientRect().top ?? 0;

            this.messages = [...newMessages, ...this.messages];
            this.updateMessagesWithDividers();
            this.cdr.detectChanges();

            // Restore scroll so the anchor element stays at the same visual position
            requestAnimationFrame(() => {
              const anchorElAfter = document.getElementById('message-' + oldFirstMessageId);
              if (anchorElAfter && this.scrollViewport) {
                const anchorTopAfter = anchorElAfter.getBoundingClientRect().top;
                const drift = anchorTopAfter - anchorTopBefore;
                if (Math.abs(drift) > 1) {
                  const el = this.scrollViewport.elementRef.nativeElement;
                  el.scrollTop += drift;
                }
              }
              setTimeout(() => {
                this.isLoadingMore = false;
                this.cdr.detectChanges();
              }, 50);
            });
        },
        error: (error) => {
            this.isLoadingMore = false;
            this.logger.error('Failed to load older messages:', error);
        },
        complete: () => {
        // Ensure isLoadingMore is reset even if no messages were loaded (this would trigger in very rare cases I think)
        if (this.isLoadingMore) {
           this.isLoadingMore = false;
        }
      }
    });
  }

  private addOrUpdateMessage(message: Message, isMyOwnMessageJustSent: boolean = false): void {
    message.ismyMessage = this.messageList.ownershipFor(message, this.userId, isMyOwnMessageJustSent);

    const existingMessageIndex = this.messages.findIndex(m => m._id === message._id);
    const wasAtBottom = this.isAtBottom;

    if (existingMessageIndex > -1) {
      this.messages[existingMessageIndex] = this.messageList.mergeIncoming(
        this.messages[existingMessageIndex],
        message,
        isMyOwnMessageJustSent
      );
    } else {
      this.messages.push(message);
      
      if (!message.ismyMessage) {
        if (!this.isAtBottom) {
          this.unreadMessagesCount++;
          this.newMessagesWhileScrolledUp.push(message);
        }
      }
    }

    this.updateMessagesWithDividers();
    this.cdr.detectChanges();

    if (isMyOwnMessageJustSent || wasAtBottom) {
      requestAnimationFrame(() => this.scrollToBottom(true, 'smooth'));
    }
  }

  startReply(message: Message): void {
    this.messageActionsService.startReply(message);
  }

  cancelReply(): void {
    this.messageActionsService.cancelReply();
  }

  onMessageSend(eventData: { content: string; file?: File; caption?: string; replyTo?: Message; duration?: number; }): void {
    if (!this.chatId) {
      this.logger.error('ChatRoom: onMessageSend - ERROR: chatId is missing. Cannot send message.');
      this.showToast('Error: Chat context is not available.'); 
      return;
    }
    
    const textOrCaption: string = (typeof eventData.content === 'string') ? eventData.content.trim() : '';
    const fileToSend: File | undefined = (eventData.file instanceof File) ? eventData.file : undefined;


    let replyToPayload: { _id: string; senderName: string; content: string; senderId: string | undefined; messageType: string; filePath?: string } | undefined = undefined;
    const replyingTo = this.messageActionsService.replyingToMessage;
    if (replyingTo && replyingTo._id) {
      replyToPayload = {
        _id: replyingTo._id,
        senderName: replyingTo.senderName || 'User',
        content: replyingTo.content ? replyingTo.content.substring(0, 100) : '',
        senderId: (typeof replyingTo.senderId === 'string')
                    ? replyingTo.senderId
                    : (replyingTo.senderId as User)?._id,
        messageType: replyingTo.messageType || 'text',
        filePath: replyingTo.filePath
      };
    }

    if (fileToSend) {
      this.chatApiService.uploadMediaFile(this.chatId, fileToSend, textOrCaption, replyToPayload, eventData.duration)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            this.scrollToBottom(true);
            if (response.savedMessage) {
              const messageFromServer = response.savedMessage;
              messageFromServer.ismyMessage = true
              messageFromServer.senderId = this.userId!;
            
              this.addOrUpdateMessage(messageFromServer, true);
          }
          },
          error: (err) => {
            this.logger.error('ChatRoom: onMessageSend - Error uploading file:', err);
            const errorMessage = err?.error?.message || err?.message || 'Unknown error';
            this.showToast(`Failed to send file: ${errorMessage}`);
          }
        });
    } else if (textOrCaption) {
      this.socketService.sendMessage(this.chatId, textOrCaption, replyToPayload)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (_sentMessage) => {
            this.scrollToBottom(true);
          },
          error: (err) => {
            this.logger.error('ChatRoom: onMessageSend - Error sending text message:', err);
            const errorMessage = err?.error?.message || err?.message || 'Unknown error';
            this.showToast(`Failed to send message: ${errorMessage}`);
          }
        });
    }

    if (this.messageActionsService.replyingToMessage) {
      this.cancelReply();
    }
  }

        
  public async scrollToMessage(messageId: string, block: ScrollLogicalPosition = 'center', forceScroll: boolean = false): Promise<void> {
    if (!this.scrollViewport) {
        return;
    }

    const isReturningToQuoteOrigin = this.returnToMessageIdAfterQuoteJump === messageId;
    if (!forceScroll && !this.isAtBottom && !this.isSearchActive && !isReturningToQuoteOrigin) {
        return;
    }

    this.scrollViewport.checkViewportSize();
    
    const index = this.messagesWithDividers.findIndex((item: any) => item.type === 'message' && item._id === messageId);

    if (index !== -1) {
        this.scrollViewport.scrollToIndex(index, 'smooth');
        setTimeout(() => this.highlightMessageInDOM(messageId), 300);
    } else {
        this.loadMessageContextAndScroll(messageId, block);
    }
  }

  private loadMessageContextAndScroll(messageId: string, block: ScrollLogicalPosition): void {
    this.showToast('Loading message context...', 2000);
    if (!this.chatId) {
        this.isScrollingProgrammatically = false;
        return;
    }
    this.isLoadingContext = true; 
    this.chatApiService.loadMessageContext(this.chatId, messageId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
            next: (contextMessages) => {
                if (contextMessages?.length > 0) {
                    this.mergeMessages(contextMessages);
                    this.updateMessagesWithDividers();
                    this.cdr.detectChanges();
                    this.scrollToMessage(messageId, block, true);
                } else {
                    this.showToast('Original message not found', 3000);
                    this.isScrollingProgrammatically = false;
                }
            },
            error: (err) => {
              this.showToast('Failed to load original message', 3000);
              this.isScrollingProgrammatically = false;
              this.logger.error('Error loading message context:', err);
            }
        });
  }

  private highlightMessageInDOM(messageId: string): void {
    const messageElement = document.getElementById('message-' + messageId);
    if (!messageElement) {
      return;
    }

    document.querySelectorAll('.message.highlighted-reply').forEach(el =>
      el.classList.remove('highlighted-reply')
    );

    const isSearchResult = this.isSearchActive && this.messages.some(m => m._id === messageId && m.isCurrentSearchResult);
    if (!isSearchResult) {
      messageElement.classList.add('highlighted-reply');

      messageElement.animate([
        { backgroundColor: 'transparent' },
        { backgroundColor: 'rgba(74, 118, 168, 0.2)' },
        { backgroundColor: 'transparent' }
      ], {
        duration: 1500,
        easing: 'ease-in-out'
      });

      setTimeout(() => {
        messageElement.classList.remove('highlighted-reply');
      }, 2000);
    }
  }

  private setupResizeObserver(): void {
      if (!this.scrollViewport || !this.scrollViewport.elementRef.nativeElement) {
          setTimeout(() => this.setupResizeObserver(), 100);
          return;
      }

      const contentWrapper = this.scrollViewport.elementRef.nativeElement.querySelector('.cdk-virtual-scroll-content-wrapper');
      
      if (contentWrapper) {
          this.resizeObserver = new ResizeObserver(_entries => {
            if (this.isAtBottom && !this.isScrollingProgrammatically && !this.isScrollingToBottom) {
                this.scrollToBottom(true, 'auto');
            }
          });

          this.resizeObserver.observe(contentWrapper);
      }
  }

  onQuoteClick(targetMessageId: string, sourceMessageId: string | undefined): void {
    if (!targetMessageId || !sourceMessageId) return;

    this.returnToMessageIdAfterQuoteJump = sourceMessageId;
    this.scrollToMessage(targetMessageId, 'center', true);
    this.isAtBottom = false; 
    this.cdr.detectChanges();
  }

  private handleReactionUpdate(messageId: string, newReactions: Reaction[]): void {
    this.messageActionsService.handleReactionUpdate(messageId, newReactions);
  }
  getGroupedReactions(reactions: Reaction[] | undefined): GroupedReaction[] {
    return this.messageList.groupReactions(reactions, this.userId);
  }


        

    
  onReactionClick(messageId: string | undefined | null, reactionType: string): void {
    this.messageActionsService.onReactionClick(messageId, reactionType);
  }

  private handleCurrentChatWasDeleted(deletedBy?: string): void {
    this.isChatEffectivelyDeleted = true;
    this.messages = [];
    this.messagesWithDividers = [];
    this.chatDetails = null;
    this.otherParticipant = null;
    const deleter = deletedBy === this.userId ? 'you' : (deletedBy ? 'another participant' : 'one of the participants');
    this.showToast(`Chat was deleted by ${deleter}. Redirecting to home...`, 5000);
    this.cdr.detectChanges();
    setTimeout(() => {
      this.router.navigate(['/home']);
    }, 3000);
  }

  // Search event handlers (logic moved to ChatSearchBarComponent)
  onSearchResultsChanged(results: Message[]): void {
    this.messageSearch.setResults(results);
  }

  onSearchResultsCleared(): void {
    this.messageSearch.clearResults();
  }

  async onSearchResultNavigated(event: { messageId: string; isInitial: boolean }): Promise<void> {
    this.messageSearch.markCurrent(event.messageId);

    this.isScrollingProgrammatically = true;
    await this.scrollToMessage(event.messageId, 'center', true);

    setTimeout(() => {
      this.isScrollingProgrammatically = false;
    }, 1000);
  }

  onSearchClosed(): void {
    this.messageSearch.close();
    this.scrollToBottom();
  }

  private mergeMessages(newMessages: Message[]): void {
      const messagesToAdd = this.messageList.selectNewMessages(this.messages, newMessages, this.userId);

      if (messagesToAdd.length > 0) {
          this.messages.push(...messagesToAdd);
          this.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          
          
          this.cdr.detectChanges();
          if (this.scrollViewport) {
              this.scrollViewport.checkViewportSize();
          }
      }
  }


  // Methods for text highlighting
  getHighlightedText(text: string, query: string): SafeHtml {
    return this.messageTextService.highlight(text, query);
  }

  // Pinned message handling
  private updatePinnedMessageDetails(): void {
    this.pinnedMessageDetails = this.pinnedMessage.resolve(
      this.chatDetails?.pinnedMessage,
      this.messages,
      id => (this.isSearchActive && this.messageSearch.hasResults)
        ? this.messageSearch.findResult(id)
        : null
    );
  }
  
  pinSelectedMessage(): void {
    this.messageActionsService.pinSelectedMessage();
  }

  unpinCurrentMessage(): void {
    this.messageActionsService.unpinCurrentMessage();
  }

  canUnpin(): boolean {
    return this.pinnedMessage.canUnpin(this.isGroupChat, this.chatDetails?.admin, this.userId);
  }


  scrollToPinnedMessage(): void {
    if (this.pinnedMessageDetails && this.pinnedMessageDetails._id) {
      if (this.isSearchActive) {
        this.closeSearch();
        setTimeout(() => {
          this.scrollToMessage(this.pinnedMessageDetails!._id!, 'center', true);
        }, 100);
      } else {
        this.scrollToMessage(this.pinnedMessageDetails._id, 'center', true);
      }
    }
  }
  get searchQuery(): string {
    return this.searchBar?.searchQuery ?? '';
  }

  toggleSearch(): void {
    if (!this.messageSearch.toggle()) {
      this.onSearchClosed();
    }
  }

  closeSearch(): void {
    this.messageSearch.close();
  }


  formatMessageContent(content: string): string {
    return this.messageTextService.format(content);
  }



  onEditLastMessageRequested(): void {
    if (!this.userId || this.messages.length === 0) {
      return;
    }
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const message = this.messages[i];
      const messageSenderId = (typeof message.senderId === 'object' && message.senderId !== null)
                            ? (message.senderId as any)._id
                            : message.senderId;
      if (messageSenderId === this.userId) {
        if (message.isEditing) {
          return;
        }
        this.startEdit(message); 
        return;
      }
    }
  }

  onEditTextareaKeydown(event: KeyboardEvent, messageItemFromUI: Message): void {
    this.messageActionsService.onEditTextareaKeydown(event, messageItemFromUI);
  }

  // Selection service thin wrappers
  get isSelectionModeActive(): boolean { return this.selectionService.isActive; }
  get selectedMessagesMap(): Map<string, Message> { return this.selectionService.selectedMessagesMap; }
  activateSelectionMode(message: Message): void { this.selectionService.activate(message); }
  cancelSelectionMode(): void { this.selectionService.cancel(); }
  selectAllMessages(): void { this.selectionService.selectAll(); }
  copySelectedMessages(): void { this.selectionService.copySelected(); }
  canDeleteSelectedMessages(): boolean { return this.selectionService.canDeleteSelected(); }
  deleteSelectedMessages(): Promise<void> { return this.selectionService.deleteSelected(); }

  forwardSelectedMessages(): void {
    const payload = this.selectionService.getForwardPayload();
    if (!payload) return;
    this.messageActionsService.activeContextMenuId = null;
    this.messageActionsService.messagetoForward = payload;
    this.messageActionsService.showForwardDialogue = true;
    this.cdr.detectChanges();
  }

  onBackClick(): void {
    if (this.selectionService.isActive) {
      this.selectionService.cancel();
    } else if (this.isSearchActive) {
      this.closeSearch();
    } else {
      this.goBack();
    }
  }

  onMessageMouseDown(event: MouseEvent, message: Message): void {
    this.selectionService.onMouseDown(event, message);
  }

  onMessagesContainerMouseMove(event: MouseEvent): void {
    this.selectionService.onMouseMove(event);
  }

  onMessagesContainerMouseUp(): void {
    this.selectionService.onMouseUp();
  }

  onMediaLoad(message: Message, event: Event): void {
    message.mediaLoadError = false;
    message.mediaLoaded = true;
    
    if (message.messageType === 'image' && event.target instanceof HTMLImageElement) {
      const img = event.target;
      if (img.naturalWidth > 800) {
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
      }
    }
    
    if (this.isAtBottom) {
      setTimeout(() => this.scrollToBottom(), 50);
    }
    
    this.cdr.detectChanges();
  }
  
  onMediaError(message: Message, event: Event): void {
    this.logger.error('Failed to load media for message:', message._id, event);
    message.mediaLoadError = true;
    message.mediaLoaded = false;
    
    if (message.messageType) {
      this.showToast(`Failed to load ${message.messageType}. Check your connection.`, 3000);
    }
    
    this.cdr.detectChanges();
  }
  
  openMediaModal(message: Message): void {
    if (!message.filePath || message.mediaLoadError) {
      return;
    }
    this.mediaModal.open(this.getMediaUrl(message.filePath));
  }

  getRepliedMessage(messageId: string): Message | null {
    if (!messageId) return null;
    return this.messages.find(msg => msg._id === messageId) || null;
  }

  private isChatCurrentlyOpenAndVisible(): boolean {
    return !!this.chatId;
  }

  toggleKeyboardHelp(): void {
    this.showKeyboardHelp = !this.showKeyboardHelp;
  }

  closeKeyboardHelp(): void {
    this.showKeyboardHelp = false;
  }

  closeMediaGallery(): void {
    this.showMediaGallery = false;
    document.body.style.overflow = '';
  }

  openLightboxFromGallery(event: { items: Message[], startIndex: number }): void {
    this.lightboxItems = event.items;
    this.lightboxStartIndex = event.startIndex;
    this.showLightbox = true;

  }
  
  closeLightbox(): void {
    this.showLightbox = false;
  }

  onGoToMessage(): void {
    if (!this.showLightbox || this.lightboxItems.length === 0) return;

    const targetMessage = this.lightboxItems[this.lightboxStartIndex];
    if (!targetMessage || !targetMessage._id) return;
    

    this.closeLightbox();
    this.closeMediaGallery();

    this.scrollToMessageAndLoadContextIfNeeded(targetMessage._id);
  }

  async scrollToMessageAndLoadContextIfNeeded(messageId: string): Promise<void> {
    const messageElement = document.getElementById('message-' + messageId);
    
    if (messageElement) {
      this.scrollToMessage(messageId, 'center', true);
    } else {
      this.showToast('Loading message context...', 3000);
      
      if (this.chatId) {
        this.chatApiService.loadMessageContext(this.chatId, messageId)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (contextMessages) => {
              if (contextMessages && contextMessages.length > 0) {
                this.mergeMessages(contextMessages);
                this.updateMessagesWithDividers();
                this.cdr.detectChanges();
                
                setTimeout(() => {
                  this.scrollToMessage(messageId, 'center', true);
                }, 100);
              } else {
                this.showToast('Could not load the message', 3000);
              }
            },
            error: (err) => {
              this.logger.error('Failed to load message context:', err);
              this.showToast('Could not load the message', 3000);
            }
          });
      }
    }
  }
  private forceVirtualScrollRefresh(): void {
    if (this.scrollViewport) {
      this.scrollViewport.checkViewportSize();
    }
  }

  getMediaUrl(filePath: string | null | undefined): string {
    return this.mediaUrlService.resolve(filePath);
  }

  getThumbnailUrl(filePath: string | null | undefined): string {
    return this.mediaUrlService.thumbnail(filePath);
  }

  getVideoPosterUrl(filePath: string | null | undefined): string {
    return this.mediaUrlService.videoPoster(filePath);
  }

  retryLoadMedia(message: Message): void {
    message.mediaLoadError = false;
    message.mediaLoaded = false;
    this.cdr.detectChanges();
    
    setTimeout(() => {
      const mediaElement = document.querySelector(`#message-${message._id} img, #message-${message._id} video`) as HTMLElement;
      if (mediaElement && 'src' in mediaElement) {
        const originalSrc = (mediaElement as any).src;
        (mediaElement as any).src = '';
        (mediaElement as any).src = originalSrc;
      }
    }, 100);
  }
}
