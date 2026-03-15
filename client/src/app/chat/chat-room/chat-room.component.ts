import { Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
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
import { AfterViewInit } from '@angular/core';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { AudioPlayerComponent } from "../../shared/components/audio-player/audio-player.component";
import DOMPurify from 'dompurify';
import { MessageContextMenuComponent } from '../message-context-menu/message-context-menu.component';
import { ChatHeaderComponent } from '../chat-header/chat-header.component';
import { ChatSearchBarComponent } from '../chat-search-bar/chat-search-bar.component';
import { LoggerService } from '../../services/logger.service';
import { TokenService } from '../../services/token.service';
import { ToastService } from '../../utils/toast-service';

@Component({
  selector: 'app-chat-room',
  templateUrl: './chat-room.component.html',
  styleUrls: ['./chat-room.component.scss'],
  
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

})



export class ChatRoomComponent implements OnInit, OnDestroy, AfterViewInit {
  private componentIsCurrentlyFocused: boolean = document.hasFocus(); 
  @HostListener('window:focus', ['$event'])
  onWindowFocus(event: FocusEvent): void {
    if (!this.componentIsCurrentlyFocused) {
      if (this.chatId && this.isChatCurrentlyOpenAndVisible()) {
        this.triggerMarkAsRead();
      }
    }
    this.componentIsCurrentlyFocused = true;
    this.isWindowFocused = true;
  }

  @HostListener('window:blur', ['$event'])
  onWindowBlur(event: FocusEvent): void {
    this.componentIsCurrentlyFocused = false;
    this.isWindowFocused = false;
  }

  isTyping = false;
  @Input() selectedChatId: string | null = null;
  typingUsers: Set<string> = new Set();
  chatId: string | null = null;
  messages: Message[] = [];
  messagesWithDividers: any = [];
  userId: string | null = null;
  activeContextMenuId: string | null = null;
  public isAtBottom = true;
  public isAtTop: boolean = false; 
  users: User[] = [];
  menuPosition: { x: number; y: number } = { x: 0, y: 0 };
  private markAsReadDebounce = new Subject<void>();
  selectedMessageId: string | null = null;
  private editTextareaRef: ElementRef | null = null;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private destroy$ = new Subject<void>();
  private editAnimationTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  isLoadingMore = false;
  noMoreMessages = false;
  scrollHeightBeforeLoad = 0;
  loadMoreDebounce: Subject<void> = new Subject<void>();
  lastLoadTimestamp = 0;
  chatDetails: Chat | null = null;
  otherParticipant: User | null = null;
  otherParticipantStatus$: Observable<string> | null = null;
  isOtherParticipantOnline$: Observable<boolean> | null = null;
  showForwardDialogue = false;
  messagetoForward: any = null;
  replyingToMessage: Message | null = null;
  availableReactions: string[] = ['👍', '❤️', '😂', '😮', '😢', '🙏']; // Available reactions, alpha test (1.0)
  isChatEffectivelyDeleted: boolean = false; 
  pinnedMessageDetails: Message | null = null; 
  public unreadMessagesCount: number = 0;
  private newMessagesWhileScrolledUp: Message[] = []; 
  private isWindowFocused: boolean = document.hasFocus();
  isSelectionModeActive: boolean = false;
  selectedMessagesMap = new Map<string, Message>();
  private isDragging: boolean = false;
  private lastDraggedMessageId: string | null = null;
  @ViewChild(MessageInputComponent) messageInputComponent?: MessageInputComponent; 
  @ViewChild(CdkVirtualScrollViewport) scrollViewport!: CdkVirtualScrollViewport;
  showKeyboardHelp: boolean = false;
  public returnToMessageIdAfterQuoteJump: string | null = null;
  showMediaGallery: boolean = false;
  private resizeObserver: ResizeObserver | undefined;
  private isScrollingToBottom: boolean = false;
  // Search functionality
  isSearchActive: boolean = false;
  searchResults: Message[] = [];
  @ViewChild(ChatSearchBarComponent) searchBar?: ChatSearchBarComponent;
  isLoadingContext: boolean = false;
  private isScrollingProgrammatically: boolean = false;
  // Group chat functionality
  isGroupChat: boolean = false;
  groupAdmin: User | null = null;
  showGroupInfoModal: boolean = false;
  // Lightbox functionality
  showLightbox: boolean = false;
  lightboxItems: Message[] = [];
  lightboxStartIndex: number = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private chatApiService: ChatApiService,
    private socketService: SocketService,
    private chatStateService: ChatStateService,
    private cdr: ChangeDetectorRef,
    private soundService: SoundService,
    private confirmationService: ConfirmationService,
    private logger: LoggerService,
    private tokenService: TokenService,
    private toastService: ToastService
  ) {
    this.markAsReadDebounce.pipe(debounceTime(500)).subscribe(() => {
      this.markMessagesAsRead();
    });
  }

  ngOnInit(): void {
    this.componentIsCurrentlyFocused = document.hasFocus();
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
      this.handleReactionUpdate(update.messageId, update.reactions);
    });

    this.socketService.onTyping().subscribe((data: { chatId: string; senderId: string; isTyping: boolean }) => {
      if (data.chatId === this.chatId) {
        this.isTyping = data.isTyping;
        if (data.isTyping) {
          this.typingUsers.add(data.senderId);
        } else {
          this.typingUsers.delete(data.senderId);
        }
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
          this.applyEditAnimation(editedMessage._id!);
        }
        
        this.updateMessagesWithDividers();
        this.cdr.detectChanges();
    });
    
    this.route.paramMap.subscribe(params => {
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

    this.socketService.onMessageStatusUpdated().subscribe((data: any) => {
      const message = this.messages.find(msg => msg._id === data.messageId);
      if (message) {
        message.status = data.status;
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
    setTimeout(() => {
        this.scrollToBottom(true, 'auto');
        this.setupResizeObserver();
        this.forceVirtualScrollRefresh();
    }, 100);
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

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.editAnimationTimeouts.forEach(timeout => clearTimeout(timeout));
    this.editAnimationTimeouts.clear();

  }
  
  getTypingUserName(userId: string): string {
    const user = this.users.find(u => u._id === userId);
    return user ? user.username : 'Unknown User';
  }

  get typingIndicatorText(): string {
    if (this.typingUsers.size === 0) {
      return '';
    }

    const typingUserNames = Array.from(this.typingUsers)
      .filter(id => id !== this.userId)
      .map(id => this.getTypingUserName(id))
      .filter(name => name !== 'Unknown User'); 

    if (typingUserNames.length === 0) {
      return '';
    }

    if (typingUserNames.length === 1) {
      return `${typingUserNames[0]} is typing...`;
    } else if (typingUserNames.length === 2) {
      return `${typingUserNames[0]} and ${typingUserNames[1]} are typing...`;
    } else { 
      return `${typingUserNames[0]}, ${typingUserNames[1]} and ${typingUserNames.length - 2} more are typing...`;
    }
  }
  onInputChange(isTyping: boolean): void {
    if (this.chatId) {
      this.socketService.sendTyping(this.chatId, isTyping);
      this.isTyping = isTyping;
    }
  }
  
  formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
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
    const newMessagesWithDividers = [];
    let lastDate = null;
    let systemMessagesProcessedInLoop = 0;

    for (const message of this.messages) {
      if (message.category === 'system_event') {
        systemMessagesProcessedInLoop++;
      }

      const messageDate = this.formatDate(new Date(message.timestamp));

      if (messageDate !== lastDate) {
        newMessagesWithDividers.push({
          type: 'divider',
          date: messageDate,
        });
        lastDate = messageDate;
      }

      newMessagesWithDividers.push({
        ...message,
        type: 'message',
      });
    }

    this.messagesWithDividers = newMessagesWithDividers;


    this.cdr.detectChanges();

    setTimeout(() => {
      this.forceVirtualScrollRefresh();
    }, 0);
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
          if (chat.admin && typeof chat.admin === 'object') {
            this.groupAdmin = chat.admin as User;
          }
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

    const el = this.scrollViewport.elementRef.nativeElement;
    if (behavior === 'auto') {
      el.scrollTop = el.scrollHeight;
      this.isAtBottom = true;
      this.isScrollingToBottom = false;
      this.cdr.detectChanges();
      this.triggerMarkAsRead();
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      setTimeout(() => {
        // Ensure we actually reached the bottom after smooth scroll
        if (this.scrollViewport) {
          const remaining = this.scrollViewport.measureScrollOffset('bottom');
          if (remaining > 1) {
            el.scrollTop = el.scrollHeight;
          }
        }
        this.isAtBottom = true;
        this.isScrollingToBottom = false;
        this.cdr.detectChanges();
        this.triggerMarkAsRead();
      }, 400);
    }
  }

  formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    if (!this.activeContextMenuId) {
      return null;
    }
    
    const messageFromMainArray = this.messages.find(
      (msg: Message) => msg._id === this.activeContextMenuId
    );

    if (messageFromMainArray) {
    } else {
      const messageFromDividers = this.messagesWithDividers.find(
          (item: any) => item.type === 'message' && item._id === this.activeContextMenuId
      );
      if (messageFromDividers) {
          return messageFromDividers as Message;
      } else {
          this.logger.error('getSelectedMessage: Message NOT FOUND anywhere for ID:', this.activeContextMenuId);
      }
    }
    return messageFromMainArray || null;
  }
  
  onMessageClick(message: Message, event?: MouseEvent): void {
    if (this.isSelectionModeActive) {
      if (event && (event.ctrlKey || event.metaKey)) {
        this.toggleMessageSelection(message);
      } else {
        this.toggleMessageSelection(message);
      }
    } else {
      if (event && (event.ctrlKey || event.metaKey)) {
        this.activateSelectionMode(message);
      } else {
        if (this.activeContextMenuId && this.activeContextMenuId !== message._id) {
          this.activeContextMenuId = null;
        }
      }
    }
  }
  
  showContextMenu(event: MouseEvent, message: Message): void {
    if (this.isSelectionModeActive) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    if (!message || !message._id) {
      this.logger.error('Cannot show context menu: Invalid message object', message);
      return;
    }

    this.activeContextMenuId = message._id;
    this.selectedMessageId = message._id;

    const actualMessage = this.messages.find(m => m._id === this.activeContextMenuId);

    if (!actualMessage) {
        this.logger.error('CONTEXT_MENU_ERROR: Could not find actual message in this.messages for ID:', this.activeContextMenuId);
        this.activeContextMenuId = null;
        return;
    }

    const MenuWidth = 220;  
    const itemCount = message.senderId === this.userId ? 6 : 4;
    const MenuHeight = (itemCount * 40) + 60;
    const cursorOffset = 5;

    let positionX = event.clientX;
    let positionY = event.clientY;

    if (positionX + MenuWidth + cursorOffset > window.innerWidth) {
      positionX = positionX - MenuWidth - cursorOffset;
    } else {
      positionX = positionX + cursorOffset;
    }
    if (positionX < 10) {
      positionX = 10;
    }

    if (positionY - MenuHeight - cursorOffset < 0) {
      positionY = positionY + cursorOffset;

      if (positionY + MenuHeight > window.innerHeight) {
        positionY = window.innerHeight - MenuHeight - 10;
      }
    } else {
      positionY = positionY - MenuHeight - cursorOffset;
    }
    if (positionY < 10) {
      positionY = 10;
    }

    if (positionX + MenuWidth > window.innerWidth) {
      positionX = window.innerWidth - MenuWidth - 10;
      if (positionX < 10) positionX = 10;
    }


    this.menuPosition = { x: positionX, y: positionY };
    this.activeContextMenuId = message._id;
    this.selectedMessageId = message._id; 
    this.cdr.detectChanges();
  }
  
  startLongPress(event: TouchEvent, message: Message): void {
    if (this.isSelectionModeActive) {
      this.endLongPress();
      return;
    }
    
    if (event && event.preventDefault) {
      event.preventDefault();
    }
    
    this.longPressTimer = setTimeout(() => {
      if (!this.isSearchActive && !message.isEditing) {
        this.activateSelectionMode(message);
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
    this.activeContextMenuId = null;
    const messageInArray = this.messages.find(m => m._id === message._id);
    if (!messageInArray || messageInArray.senderId !== this.userId) return;
      messageInArray.isEditing = true;
      messageInArray.editedContent = messageInArray.content; 

    const messageInDividers = this.messagesWithDividers.find(
      (item: any) => item.type === 'message' && item._id === message._id
    );
    if (messageInDividers) {
      messageInDividers.isEditing = true;
      messageInDividers.editedContent = messageInDividers.content;
    }
    this.selectedMessageId = null;
    this.cdr.detectChanges();

    setTimeout(() => {
      const messageId = messageInArray._id;
      if (!messageId) return;
      const messageElement = document.getElementById('message-' + messageInArray._id);
          const editContainerElement = messageElement?.querySelector('.edit-container') as HTMLElement;
      const textarea = messageElement?.querySelector('.edit-textarea') as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
      }
      if (messageElement && editContainerElement) {
        const messagesContainer = document.querySelector('.messages');
        if (messagesContainer) {
          const containerRect = messagesContainer.getBoundingClientRect();
          const editContainerRect = editContainerElement.getBoundingClientRect();
          const isFullyVisible = 
              editContainerRect.top >= containerRect.top &&
              editContainerRect.bottom <= containerRect.bottom;

          if (!isFullyVisible || isLastMessageEdit) {
            let scrollAdjustment = 0;

            if (editContainerRect.bottom > containerRect.bottom) {
              scrollAdjustment = (editContainerRect.bottom - containerRect.bottom) + 40;
            }
            else if (editContainerRect.top < containerRect.top) {
              scrollAdjustment = (editContainerRect.top - containerRect.top) - 15;
            }
            
            if (scrollAdjustment !== 0 || (isLastMessageEdit && messagesContainer.scrollTop + messagesContainer.clientHeight < messagesContainer.scrollHeight - 5)) {
              messagesContainer.scrollTop += scrollAdjustment;
              if (isLastMessageEdit && Math.abs(messagesContainer.scrollTop + messagesContainer.clientHeight - messagesContainer.scrollHeight) < 5) {
                  messagesContainer.scrollTop = messagesContainer.scrollHeight;
              }
            }
          }
        }
      }
    }, 50);
}
  
  cancelEdit(messageFromUI: Message): void {
    const messageId = messageFromUI._id;

    messageFromUI.isEditing = false;
    delete messageFromUI.editedContent;

    const messageInArray = this.messages.find(m => m._id === messageId);
    if (messageInArray) {
      messageInArray.isEditing = false;
      delete messageInArray.editedContent;
    }

    this.messageInputComponent?.focusInput();
    this.cdr.detectChanges();
  }
  
  saveMessageEdit(messageFromUI: Message): void {
    const messageId = messageFromUI._id;
    const messageInArray = this.messages.find(m => m._id === messageId);

    if (!messageInArray) {
      this.logger.error('Message to save not found in main messages array:', messageId);
      this.cancelEdit(messageFromUI);
      return;
    }

    const editedContentFromUI = messageFromUI.editedContent;

    if (!editedContentFromUI?.trim()) {
        this.cancelEdit(messageFromUI);
        return;
    }

    const newContent = editedContentFromUI.trim();

    if (messageInArray.content === newContent) {
      messageInArray.isEditing = false;
      delete messageInArray.editedContent;
      messageFromUI.isEditing = false;
      delete messageFromUI.editedContent;
      this.cdr.detectChanges(); 
      return;
    }

    const originalContent = messageInArray.content;

    messageInArray.content = newContent;
    messageInArray.isEditing = false;
    messageInArray.edited = true;
    messageInArray.editedAt = new Date();
    delete messageInArray.editedContent;

    messageFromUI.content = newContent;
    messageFromUI.isEditing = false;
    messageFromUI.edited = true;
    messageFromUI.editedAt = messageInArray.editedAt;
    delete messageFromUI.editedContent;
    
    this.updateMessagesWithDividers();
    this.cdr.detectChanges();

    this.chatApiService.editMessage(messageInArray._id!, newContent).subscribe({
      next: (updatedMessageFromServer) => {
        const finalMessageIndex = this.messages.findIndex(m => m._id === updatedMessageFromServer._id);
        if (finalMessageIndex !== -1) {
          this.messages[finalMessageIndex] = {
            ...this.messages[finalMessageIndex],
            content: updatedMessageFromServer.content,
            edited: updatedMessageFromServer.edited,
            editedAt: updatedMessageFromServer.editedAt,
            isEditing: false, 
          };
          delete this.messages[finalMessageIndex].editedContent;
        }
        this.updateMessagesWithDividers();
        this.messageInputComponent?.focusInput();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.logger.error('Failed to edit message on server:', err);
        const messageToRevert = this.messages.find(m => m._id === messageId);
        if (messageToRevert) {
          messageToRevert.content = originalContent;
          messageToRevert.isEditing = false;
          messageToRevert.edited = messageFromUI.edited; 
          messageToRevert.editedAt = messageFromUI.editedAt;
          delete messageToRevert.editedContent;
        }
        messageFromUI.content = originalContent;
        messageFromUI.isEditing = true;
        messageFromUI.editedContent = editedContentFromUI;

        this.updateMessagesWithDividers();
        this.messageInputComponent?.focusInput();
        this.cdr.detectChanges();
        this.showToast('Failed to save edit. Please try again.');
      }
    });
  }


  
  async deleteMessage(messageId: string | undefined): Promise<void> {
    if (!messageId) {
      if (this.activeContextMenuId) {
        messageId = this.activeContextMenuId;
      } else {
        return;
      }
    }
    
    this.activeContextMenuId = null;
    this.selectedMessageId = null;
    
    const confirmed = await this.confirmationService.confirm({
        title: 'Delete Message',
        message: 'Are you sure you want to delete this message? This action cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Cancel'
    });
    if (confirmed) {      
      this.chatApiService.deleteMessage(messageId).subscribe({
        next: () => {
          this.messages = this.messages.filter(msg => msg._id !== messageId);
          this.updateMessagesWithDividers();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.logger.error('Failed to delete message:', err);
          this.cdr.detectChanges();
        }
      });
    }
  }
  
  copyMessageText(message: Message): void {
    if (!message) return;
    
    this.activeContextMenuId = null;
    this.selectedMessageId = null;
    
    navigator.clipboard.writeText(message.content)
      .then(() => {
        this.showToast('Message copied to clipboard');
      })
      .catch(err => {
        this.showToast('Failed to copy message', err);
      });
  }


  get getAvatarUrl(): string {
    if (!this.chatDetails || !this.userId || !this.users || this.users.length === 0) {
      return 'assets/images/default-avatar.png';
    }

    if (this.isGroupChat) {
      if (this.chatDetails.groupAvatar) {
        if (this.chatDetails.groupAvatar.startsWith('/uploads/')) {
          return `${this.chatApiService.getApiUrl()}${this.chatDetails.groupAvatar}`;
        }
        return this.chatDetails.groupAvatar;
      }
      return 'assets/images/default-group-avatar.png';
    }
    const isSavedMessagesChat =
      this.chatDetails.participants &&
      this.chatDetails.participants.length === 1 &&
      this.chatDetails.participants[0]._id === this.userId;

    if (isSavedMessagesChat) {
      return 'assets/images/saved-messages-icon.png'; 
    }

    if (this.otherParticipant && this.otherParticipant.avatar) {
      const avatarPath = this.otherParticipant.avatar;
      if (avatarPath.startsWith('/uploads/')) { 
        return `${this.chatApiService.getApiUrl()}${avatarPath}`;
      }
      return avatarPath; 
    }
        return 'assets/images/default-avatar.png';
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
    if (!user || !user.avatar) {
      return 'assets/images/default-avatar.png';
    }

    if (user.avatar.startsWith('http://') || user.avatar.startsWith('https://')) {
      return user.avatar;
    }
    
    if (user.avatar.startsWith('/')) {
      return `${this.chatApiService.getApiUrl()}${user.avatar}`;
    }
    
    return `${this.chatApiService.getApiUrl()}/${user.avatar}`;
  }
  
  forwardMessage(message: Message): void {
    if (!message) return;
  
    this.activeContextMenuId = null;
    this.selectedMessageId = null;
    
    this.messagetoForward = message;
    this.showForwardDialogue = true;
    this.cdr.detectChanges();  
  }
  
  cancelForward() {
    this.showForwardDialogue = false;
    this.messagetoForward = null;
  }

  confirmForward(targetChatId: string): void {
    if (!this.messagetoForward) {
      this.cancelSelectionMode();
      this.cancelForward();
      return;
    }

    if (this.messagetoForward._id === 'multiple') {
      const selectedMessages = this.getArrayOfSelectedMessages();
      if (selectedMessages.length > 0) {
        this.chatApiService.forwardMultipleMessages(selectedMessages.map(m => m._id!), targetChatId)
          .subscribe({
            next: () => {
              this.showToast(`${selectedMessages.length} messages forwarded`);
              this.cancelSelectionMode();
              this.cancelForward();
            },
            error: (err) => {
              this.showToast('Failed to forward messages');
              this.logger.error("Error forwarding multiple messages", err);
              this.cancelForward();
            }
          });
      }
    } else if (this.messagetoForward._id) {
      this.chatApiService.forwardMessage(this.messagetoForward._id, targetChatId).subscribe({
        next: () => {
          this.showToast('Message forwarded successfully');
          this.cancelSelectionMode();
          this.cancelForward();
        },
        error: (error) => {
          this.showToast('Failed to forward message');
          this.cancelForward();
        }
      });
    }
  }

  public showToast(message: string, duration: number = 3000): void {
    this.toastService.showToast(message, duration);
  }

  @HostListener('document:click', ['$event'])
  closeContextMenu(event: Event): void {
    const target = event.target as HTMLElement;
    if (
      this.activeContextMenuId && 
      !target.closest('.context-menu') && 
      !target.closest('.message-menu-icon')
    ) {
      this.activeContextMenuId = null;
      setTimeout(() => {
        this.selectedMessageId = null;
      }, 300);
    }
  }
  
  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.activeContextMenuId = null;
    this.selectedMessageId = null;
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
      if (this.isSelectionModeActive) {
        this.cancelSelectionMode();
        event.preventDefault();
        return;
      }
      
      if (this.isSearchActive) {
        this.closeSearch();
        event.preventDefault();
        return;
      }
      
      if (this.activeContextMenuId) {
        this.activeContextMenuId = null;
        this.selectedMessageId = null;
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
      this.selectAllMessages();
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

    if (this.isSelectionModeActive && this.selectedMessagesMap.size > 0 && 
        (event.ctrlKey || event.metaKey) && event.key === 'c') {
      event.preventDefault();
      this.copySelectedMessages();
      return;
    }

    if (this.isSelectionModeActive && this.selectedMessagesMap.size > 0 && 
        (event.key === 'Delete' || event.key === 'Backspace')) {
      if (this.canDeleteSelectedMessages()) {
        event.preventDefault();
        this.deleteSelectedMessages();
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
    if (!editedAt) return '';
    
    const editedDate = new Date(editedAt);
    return `${editedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit', 
      second: '2-digit'
    })}`;
  }

  private applyEditAnimation(messageId: string): void {
    if (this.editAnimationTimeouts.has(messageId)) {
      clearTimeout(this.editAnimationTimeouts.get(messageId)!);
    }
    
    const messageIndex = this.messages.findIndex(msg => msg._id === messageId);
    if (messageIndex === -1) return;
    
    this.messages[messageIndex].editedRecently = true;
    
    this.updateMessagesWithDividers();
    
    const timeout = setTimeout(() => {
      const msgIndex = this.messages.findIndex(msg => msg._id === messageId);
      if (msgIndex !== -1) {
        this.messages[msgIndex].editedRecently = false;
        this.updateMessagesWithDividers();
        this.cdr.detectChanges();
      }
      this.editAnimationTimeouts.delete(messageId);
    }, 2000);
    
    this.editAnimationTimeouts.set(messageId, timeout);
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
    if (message.category === 'system_event') {
      message.ismyMessage = false;
    } else {
      let actualSenderId: string;
      
      if (typeof message.senderId === 'string') {
        actualSenderId = message.senderId;
      } else if (typeof message.senderId === 'object' && message.senderId?._id) {
        actualSenderId = message.senderId._id;
      } else {
        actualSenderId = '';
      }
      
      if (isMyOwnMessageJustSent) {
        message.ismyMessage = true;
      } else {
        message.ismyMessage = actualSenderId === this.userId;
      }
    }

    const existingMessageIndex = this.messages.findIndex(m => m._id === message._id);
    const wasAtBottom = this.isAtBottom;

    if (existingMessageIndex > -1) {
      const existingMessage = this.messages[existingMessageIndex];
      
      this.messages[existingMessageIndex] = {
        ...existingMessage,
        ...message,
        status: this.getNewerStatus(existingMessage.status, message.status), 
        ismyMessage: isMyOwnMessageJustSent ? true : message.ismyMessage, // Приоритет для только что отправленных
        isSelected: existingMessage.isSelected, 
      };
      
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

  private getNewerStatus(oldStatus: string | undefined, newStatus: string | undefined): string | undefined {
    const statusOrder: { [key: string]: number } = { 'sent': 1, 'delivered': 2, 'read': 3 };

    const oldRank = oldStatus ? statusOrder[oldStatus] || 0 : 0;
    const newRank = newStatus ? statusOrder[newStatus] || 0 : 0;

    return oldRank > newRank ? oldStatus : newStatus;
  }
  
  startReply(message: Message): void {
    this.replyingToMessage = message;
    this.activeContextMenuId = null;
    const messageInput = document.querySelector('app-message-input textarea') as HTMLTextAreaElement;
    if (messageInput) {
      messageInput.focus();
    }
  }

  cancelReply(): void {
    this.replyingToMessage = null; 
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
    if (this.replyingToMessage && this.replyingToMessage._id) {
      replyToPayload = {
        _id: this.replyingToMessage._id,
        senderName: this.replyingToMessage.senderName || 'User',
        content: this.replyingToMessage.content ? this.replyingToMessage.content.substring(0, 100) : '',
        senderId: (typeof this.replyingToMessage.senderId === 'string') 
                    ? this.replyingToMessage.senderId 
                    : (this.replyingToMessage.senderId as User)?._id,
        messageType: this.replyingToMessage.messageType || 'text', 
        filePath: this.replyingToMessage.filePath 
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
          next: (sentMessage) => {
            this.scrollToBottom(true);
          },
          error: (err) => {
            this.logger.error('ChatRoom: onMessageSend - Error sending text message:', err);
            const errorMessage = err?.error?.message || err?.message || 'Unknown error';
            this.showToast(`Failed to send message: ${errorMessage}`);
          }
        });
    } else {
    }

    if (this.replyingToMessage) {
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
    if (isSearchResult) {
    } else {
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
          this.resizeObserver = new ResizeObserver(entries => {
            if (this.isAtBottom && !this.isScrollingProgrammatically) {
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
    const messageIndex = this.messages.findIndex(m => m._id === messageId);

    if (messageIndex !== -1) {
      const originalMessage = this.messages[messageIndex];
      this.messages[messageIndex] = {
        ...originalMessage, 
        reactions: newReactions
      };      
      
      this.updateMessagesWithDividers();
      this.cdr.detectChanges();
    }
  }
  getGroupedReactions(reactions: Reaction[] | undefined): { type: string; count: number; reactedByMe: boolean; userIds: string[] }[] {
    if (!reactions || reactions.length === 0) {
      return [];
    }
    const groups: { [key: string]: { count: number; userIds: string[] } } = {};
    reactions.forEach(r => {
      if (!groups[r.reaction]) {
        groups[r.reaction] = { count: 0, userIds: [] };
      }
      groups[r.reaction].count++;
      groups[r.reaction].userIds.push(r.userId);
    });

    return Object.keys(groups).map(reactionType => ({
      type: reactionType,
      count: groups[reactionType].count,
      reactedByMe: !!this.userId && groups[reactionType].userIds.includes(this.userId),
      userIds: groups[reactionType].userIds // For future use
    }));
  }


        

    
  onReactionClick(messageId: string | undefined | null, reactionType: string): void {
    if (!messageId) return;
    this.socketService.toggleReaction(messageId, reactionType);
    this.activeContextMenuId = null; 
    this.selectedMessageId = null;
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
    this.searchResults = results;
    this.applyHighlightsToMessages();
    this.cdr.detectChanges();
  }

  onSearchResultsCleared(): void {
    this.searchResults = [];
    this.resetMessageHighlights();
    this.cdr.detectChanges();
  }

  async onSearchResultNavigated(event: { messageId: string; isInitial: boolean }): Promise<void> {
    this.messages.forEach(m => m.isCurrentSearchResult = (m._id === event.messageId));
    this.updateMessagesWithDividers();

    this.isScrollingProgrammatically = true;
    await this.scrollToMessage(event.messageId, 'center', true);

    setTimeout(() => {
      this.isScrollingProgrammatically = false;
    }, 1000);
  }

  onSearchClosed(): void {
    this.isSearchActive = false;
    this.searchResults = [];
    this.resetMessageHighlights();
    this.scrollToBottom();
  }

  private mergeMessages(newMessages: Message[]): void {
      const existingMessageIds = new Set(this.messages.map(m => m._id));
      const messagesToAdd = newMessages
          .filter(nm => nm._id && !existingMessageIds.has(nm._id)) 
          .map(nm => {
              const senderIdFromMessage = nm.senderId && typeof nm.senderId === 'object' && (nm.senderId as any)._id 
                  ? (nm.senderId as any)._id 
                  : (typeof nm.senderId === 'string' ? nm.senderId : undefined);

              return {
                  ...nm,
                  ismyMessage: senderIdFromMessage === this.userId 
              };
          });

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
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  getHighlightedText(text: string, query: string): SafeHtml {
    if (!query || !text) {
      return this.formatMessageContent(text);
    }
    
    const safeQuery = this.escapeRegExp(query.trim());
    try {
      const re = new RegExp(`(${safeQuery})`, 'gi');
      const sanitizedInitialText = this.formatMessageContent(text);
      
      const finalHighlighted = sanitizedInitialText.replace(re, `<span class="highlighted-search-term">$1</span>`);
      
      return DOMPurify.sanitize(finalHighlighted, { ADD_TAGS: ['span'], ADD_ATTR: ['class'] });
    } catch (error) {
      this.logger.error('Error highlighting text:', error);
      return this.formatMessageContent(text);
    }
  }

  private applyHighlightsToMessages(): void {
    this.messages.forEach(msg => {
      msg.isSearchResult = false;
    });

    if (this.searchResults.length > 0) {
      const searchResultIds = new Set(this.searchResults.map(sr => sr._id));
      this.messages.forEach(msg => {
        if (msg._id && searchResultIds.has(msg._id)) {
          msg.isSearchResult = true;
        }
      });
    }

    this.updateMessagesWithDividers();
    this.cdr.detectChanges();
  }

  private resetMessageHighlights(): void {
    this.messages.forEach(msg => {
      msg.isSearchResult = false;
      msg.isCurrentSearchResult = false;
    });
    this.updateMessagesWithDividers();
  }
  
  // Pinned message handling
  private updatePinnedMessageDetails(): void {
    if (this.chatDetails && this.chatDetails.pinnedMessage) {
      if (typeof this.chatDetails.pinnedMessage === 'object' && this.chatDetails.pinnedMessage._id) {
        this.pinnedMessageDetails = this.chatDetails.pinnedMessage as Message;
      }
      else if (typeof this.chatDetails.pinnedMessage === 'string') {
        this.pinnedMessageDetails = this.messages.find(m => m._id === this.chatDetails!.pinnedMessage) || null;
        if (!this.pinnedMessageDetails) {
            if (this.isSearchActive && this.searchResults.length > 0) {
                this.pinnedMessageDetails = this.searchResults.find(m => m._id === this.chatDetails!.pinnedMessage) || null;
            }
            if (!this.pinnedMessageDetails) {
            }
        }
      } else {
        this.pinnedMessageDetails = null;
      }
    } else {
      this.pinnedMessageDetails = null;
    }
  }
  
  pinSelectedMessage(): void {
    const messageToPin = this.getSelectedMessage();
    if (messageToPin && messageToPin._id && this.chatId) {
      this.chatApiService.pinMessage(this.chatId, messageToPin._id).subscribe({
        next: (updatedChat) => {
          this.showToast('Message pinned!');
          this.activeContextMenuId = null;
        },
        error: (err) => {
          this.logger.error('Error pinning message:', err);
          this.showToast('Failed to pin message.');
        }
      });
    }
  }

  unpinCurrentMessage(): void {
    if (this.chatId && this.chatDetails?.pinnedMessage) {
      this.chatApiService.unpinMessage(this.chatId).subscribe({
        next: (updatedChat) => {
          this.showToast('Message unpinned!');
        },
        error: (err) => {
          this.logger.error('Error unpinning message:', err);
          this.showToast('Failed to unpin message.');
        }
      });
    }
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
    this.isSearchActive = !this.isSearchActive;

    if (!this.isSearchActive) {
      this.onSearchClosed();
    }
  }

  closeSearch(): void {
    this.isSearchActive = false;
    this.searchResults = [];
    this.resetMessageHighlights();
  }


  formatMessageContent(content: string): string {
    if (!content) return '';
    
    const formattedContent = content.replace(/\n/g, '<br>');
    
    const sanitizedContent = DOMPurify.sanitize(formattedContent);

    return sanitizedContent;
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
    if (event.key === 'Enter') {
      if (event.shiftKey) { 
        return; 
      }
      event.preventDefault();
      this.saveMessageEdit(messageItemFromUI);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEdit(messageItemFromUI);
    }
  }

  public activateSelectionMode(message: Message): void {
    if (!message || !message._id) return;
    
    this.isSelectionModeActive = true;
    this.selectedMessagesMap.clear();

    message.isSelected = true;
    this.selectedMessagesMap.set(message._id, message);

    this.updateMessageInLocalArrays(message);
    this.activeContextMenuId = null;
    
    // Apply selection-mode-active class to all messages
    this.messages.forEach(msg => {
      if (msg._id === message._id) {
        msg.isSelected = true;
      }
    });
    
    this.updateMessagesWithDividers();
    this.cdr.detectChanges();
  }

  toggleMessageSelection(message: Message, forcedState?: boolean): void {
    if (!message || !message._id) return;

    const isCurrentlySelected = this.selectedMessagesMap.has(message._id);
    
    if (typeof forcedState === 'boolean') {
      if (forcedState === true && !isCurrentlySelected) {
        message.isSelected = true;
        this.selectedMessagesMap.set(message._id, message);
      } else if (forcedState === false && isCurrentlySelected) {
        message.isSelected = false;
        this.selectedMessagesMap.delete(message._id);
      }
    } else {
      if (isCurrentlySelected) {
        message.isSelected = false;
        this.selectedMessagesMap.delete(message._id);
      } else {
        message.isSelected = true;
        this.selectedMessagesMap.set(message._id, message);
      }
    }

    this.updateMessageInLocalArrays(message);

    if (this.selectedMessagesMap.size === 0) {
      this.cancelSelectionMode();
    }
    
    this.cdr.detectChanges();
  }

  private updateMessageInLocalArrays(updatedMessage: Message): void {
    if(!updatedMessage._id) return;
    
    const msgIndex = this.messages.findIndex(m => m._id === updatedMessage._id);
    if (msgIndex !== -1) {
      this.messages[msgIndex].isSelected = updatedMessage.isSelected;
    }
    
    const msgDividerIndex = this.messagesWithDividers.findIndex(
      (item: any) => item.type === 'message' && item._id === updatedMessage._id
    );
    
    if (msgDividerIndex !== -1) {
      this.messagesWithDividers[msgDividerIndex].isSelected = updatedMessage.isSelected;
    }
    
    this.updateMessagesWithDividers();
  }

  cancelSelectionMode(): void {
    this.isSelectionModeActive = false;
    
    this.messages.forEach(msg => msg.isSelected = false);
    this.messagesWithDividers.forEach((item: any) => {
      if (item.type === 'message') {
        item.isSelected = false;
      }
    });
    
    this.selectedMessagesMap.clear();
    this.cdr.detectChanges();
  }

  getArrayOfSelectedMessages(): Message[] {
    const selectedMessages = Array.from(this.selectedMessagesMap.values());
    return selectedMessages.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  copySelectedMessages(): void {
    const selected = this.getArrayOfSelectedMessages();
    if (selected.length === 0) return;

    const textToCopy = selected.map(msg => {
      let prefix = "";
      if (msg.forwarded && msg.originalSenderName) {
        prefix += `[Forwarded from ${msg.originalSenderName}]\n`;
      }
      const sender = msg.senderName || (msg.senderId === this.userId ? "You" : "Other");
      return `${prefix}${sender} [${this.formatTimestamp(msg.timestamp)}]:\n${msg.content}`;
    }).join('\n\n');

    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        this.showToast(`${selected.length} message${selected.length > 1 ? 's' : ''} copied`);
        this.cancelSelectionMode();
      })
      .catch(err => {
        this.logger.error('Failed to copy messages:', err);
        this.showToast('Failed to copy messages');
      });
  }

  forwardSelectedMessages(): void {
    const selected = this.getArrayOfSelectedMessages();
    if (selected.length === 0) return;

    this.activeContextMenuId = null;
    
    if (selected.length === 1) {
      this.messagetoForward = selected[0];
    } else {
      this.messagetoForward = {
        _id: 'multiple',
        content: `${selected.length} messages`,
      };
    }
    
    this.showForwardDialogue = true;
    this.cdr.detectChanges();
  }

  canDeleteSelectedMessages(): boolean {
    if (this.selectedMessagesMap.size === 0) return false;
    
    for (const msg of this.selectedMessagesMap.values()) {
      const senderId = typeof msg.senderId === 'object' && msg.senderId !== null 
        ? (msg.senderId as any)._id 
        : msg.senderId;
        
      if (senderId !== this.userId) {
        return false;
      }
    }
    
    return true;
  }

  async deleteSelectedMessages(): Promise<void> {
    const selectedMessageIds = Array.from(this.selectedMessagesMap.keys());
    if (selectedMessageIds.length === 0) return;

    if (!this.canDeleteSelectedMessages()) {
      this.showToast("You can only delete your own messages in bulk.");
      return;
    }

    const confirmed = await this.confirmationService.confirm({
        title: 'Delete Group Avatar',
        message: `Are you sure you want to delete ${selectedMessageIds.length} message${selectedMessageIds.length > 1 ? 's' : ''}? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel'
    });

    if (confirmed) {
      this.chatApiService.deleteMultipleMessages(selectedMessageIds).subscribe({
        next: (response) => {
          this.showToast(`${response.deletedCount} message${response.deletedCount > 1 ? 's' : ''} deleted`);
          this.messages = this.messages.filter(msg => !selectedMessageIds.includes(msg._id!));
          this.updateMessagesWithDividers();
          this.cancelSelectionMode();
        },
        error: (err) => {
          this.logger.error("Error deleting messages", err);
          this.showToast('Failed to delete messages');
        }
      });
    }
  }

  onBackClick(): void {
    if (this.isSelectionModeActive) {
      this.cancelSelectionMode();
    } else if (this.isSearchActive) {
      this.closeSearch();
    } else {
      this.goBack();
    }
  }

  onMessageMouseDown(event: MouseEvent, message: Message): void {
  if (!this.isSelectionModeActive) return;
  
  if (event.button !== 0) return;
  
  this.isDragging = true;
  this.lastDraggedMessageId = message._id || null;
  
  event.preventDefault();
  } 

  onMessagesContainerMouseMove(event: MouseEvent): void {
    if (!this.isDragging || !this.isSelectionModeActive) return;
    
    const elementsUnderCursor = document.elementsFromPoint(event.clientX, event.clientY);
    
    for (const element of elementsUnderCursor) {
      const messageId = this.getMessageIdFromElement(element as HTMLElement);
      
      if (messageId && messageId !== this.lastDraggedMessageId) {
        const message = this.messages.find(m => m._id === messageId);
        
        if (message) {
          this.toggleMessageSelection(message);
          this.lastDraggedMessageId = messageId;
          break;
        }
      }
    }
  }

  onMessagesContainerMouseUp(): void {
    this.isDragging = false;
    this.lastDraggedMessageId = null;
  }

  private getMessageIdFromElement(element: HTMLElement): string | null {
    let current: HTMLElement | null = element;
    
    while (current) {
      if (current.id && current.id.startsWith('message-')) {
        return current.id.substring(8); 
      }
      current = current.parentElement;
    }
    
    return null;
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
    
    const modal = document.createElement('div');
    modal.className = 'media-modal-overlay';
    
    Object.assign(modal.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: '2000',
      cursor: 'zoom-out'
    });
    
    const img = document.createElement('img');
    img.src = this.getMediaUrl(message.filePath);
    img.className = 'media-modal-image';
    
    Object.assign(img.style, {
      maxWidth: '90%',
      maxHeight: '90%',
      objectFit: 'contain',
      cursor: 'zoom-out'
    });
    
    modal.appendChild(img);
    document.body.appendChild(modal);
    
    modal.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.body.contains(modal)) {
          document.body.removeChild(modal);
        }
        document.removeEventListener('keydown', handleEscape);
      }
    };
    
    document.addEventListener('keydown', handleEscape);
  }

  getRepliedMessage(messageId: string): Message | null {
    if (!messageId) return null;
    return this.messages.find(msg => msg._id === messageId) || null;
  }

  private isChatCurrentlyOpenAndVisible(): boolean {
    return !!this.chatId;
  }

  selectAllMessages(): void {
    if (this.messages.length === 0) return;
    
    this.isSelectionModeActive = true;
    this.selectedMessagesMap.clear();
    
    this.messages.forEach(message => {
      if (message._id) {
        message.isSelected = true;
        this.selectedMessagesMap.set(message._id, message);
      }
    });
    
    this.updateMessagesWithDividers();
    this.cdr.detectChanges();
    this.showToast(`Selected ${this.selectedMessagesMap.size} messages`, 2000);
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
    if (!filePath) {
      return '';
    }

    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }

    if (filePath.startsWith('/')) {
      return `${this.chatApiService.getApiUrl()}${filePath}`;
    }

    return `${this.chatApiService.getApiUrl()}/${filePath}`;
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
