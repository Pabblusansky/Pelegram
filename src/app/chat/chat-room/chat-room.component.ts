import { animate, state, style, transition, trigger } from '@angular/animations';
import { Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { debounceTime, Observable, Subject, Subscription, takeUntil } from 'rxjs';
import { ChatService } from '../chat.service';
import { Message, Reaction} from '../chat.model';
import { MessageInputComponent } from "../message-input/message-input.component";
import { Router } from '@angular/router';
import { ForwardDialogComponent } from '../forward/forward-dialogue.component';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-chat-room',
  templateUrl: './chat-room.component.html',
  styleUrls: ['./chat-room.component.scss'],
  standalone: true,
  imports: [MessageInputComponent, CommonModule, FormsModule, ForwardDialogComponent ],
  animations: [
    trigger('menuAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.9)' }),
        animate('150ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
      ]),
      transition(':leave', [
        animate('100ms ease-in', style({ opacity: 0, transform: 'scale(0.9)' }))
      ])
    ])
  ]
})



export class ChatRoomComponent implements OnInit, OnDestroy {
  @HostListener('window:focus')
  onWindowFocus() {
    if (this.chatId) {
      this.markMessagesAsRead();
    }
  }
  isTyping = false;
  @Input() selectedChatId: string | null = null;
  typingUsers: Set<string> = new Set();
  chatId: string | null = null;
  messages: Message[] = [];
  messagesWithDividers: any = [];
  userId: string | null = null;
  activeContextMenuId: string | null = null;
  private isAtBottom = true;
  users: any[] = [];
  menuPosition: { x: number; y: number } = { x: 0, y: 0 };
  private markAsReadDebounce = new Subject<void>();
  typingSubscription: Subscription | null = null;
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
  chatDetails: any = null;
  otherParticipant: any = null;
  otherParticipantStatus$: Observable<string> | null = null;
  isOtherParticipantOnline$: Observable<boolean> | null = null;
  showForwardDialogue = false;
  messagetoForward: any = null;
  replyingToMessage: Message | null = null;
  availableReactions: string[] = ['👍', '❤️', '😂', '😮', '😢', '🙏']; // Available reactions, alpha test (1.0)
  isChatEffectivelyDeleted: boolean = false; 
  
  // Search functionality
  isSearchActive: boolean = false;
  searchQuery: string = '';
  searchResults: Message[] = [];
  currentSearchResultIndex: number = 0;
  isSearching: boolean = false;
  @ViewChild('searchInputEl') searchInputEl!: ElementRef;
  private searchDebounce = new Subject<string>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private chatService: ChatService,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) {
    this.markAsReadDebounce.pipe(debounceTime(500)).subscribe(() => {
      this.markMessagesAsRead();
    });
  }

  ngOnInit(): void {
    this.loadMoreDebounce.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.executeLoadMoreMessages();
    });
    
    this.searchDebounce.pipe(
      debounceTime(400),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      if (this.isSearchActive && query.trim().length > 0) {
        this.performActualSearch(query.trim());
      } else if (this.isSearchActive && query.trim().length === 0) {
        this.clearSearchResultsLocally(false);
      }
    });
  

    this.chatService.chatDeletedGlobally$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        if (this.chatId && this.chatId === data.chatId) {
          this.handleCurrentChatWasDeleted(data.deletedBy);
        }
    });

  this.chatService.messageReactionUpdated$
    .pipe(takeUntil(this.destroy$))
    .subscribe(update => {
      this.handleReactionUpdate(update.messageId, update.reactions);
    });

    this.chatService.onTyping().subscribe((data: any) => {
      console.log('Typing event received:', data);
      if (data.chatId === this.chatId) {
        this.isTyping = data.isTyping;
        if (data.isTyping) {
          this.typingUsers.add(data.senderId);
        } else {
          this.typingUsers.delete(data.senderId);
        }
        this.cdr.detectChanges();
        if (this.isTyping) {
          setTimeout(() => this.scrollToBottom(), 100);
        }
      }
    });

    this.chatService.onMessageEdited()
    .pipe(takeUntil(this.destroy$))
    .subscribe((editedMessage: Message) => {
      console.log('Received edited message event:', editedMessage);
      
      if (this.chatId !== editedMessage.chatId) {
        console.log('Message not for current chat, ignoring');
        return;
      }
      
      const index = this.messages.findIndex(m => m._id === editedMessage._id);
      if (index === -1) {
        console.log('Message not found in current chat messages');
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
        this.isChatEffectivelyDeleted = false;
        this.loadMessages();
        this.loadChatDetails();
        this.markMessagesAsRead();
      }
    });
  
    this.userId = localStorage.getItem('userId');
    

    
    this.chatService.getUsers().subscribe({
      next: (users: any[]) => {
        this.users = users;
      },
      error: (err) => {
        console.error('Failed to load users:', err);
      },
    });

    this.chatService.onMessageStatusUpdated().subscribe((data: any) => {
      const message = this.messages.find(msg => msg._id === data.messageId);
      if (message) {
        message.status = data.status;
        this.updateMessagesWithDividers();
        this.cdr.detectChanges(); 
        console.log(`Message status updated: ${data.messageId} -> ${data.status}`); 
      }
    });

    this.chatService.newMessage$.pipe(takeUntil(this.destroy$)).subscribe(message => {
      if (this.chatId === message.chatId) {
        const isMyOwnMessageJustSent = message.senderId === this.userId && !this.messages.find(m => m._id === message._id);
        this.addOrUpdateMessage(message, isMyOwnMessageJustSent);
      }
    });

    this.chatService.onMessageDeleted()
    .pipe(takeUntil(this.destroy$))
    .subscribe(event => {
      console.log('Message deleted event received:', event);
      
      const deletedMessageId = event.messageId;
      
      if (!event.chatId || event.chatId === this.chatId) {
        this.messages = this.messages.filter(msg => msg._id && msg._id !== deletedMessageId);
        this.updateMessagesWithDividers();
        this.cdr.detectChanges();
      }
    });
  }
  
  triggerMarkAsRead(): void {
    this.markAsReadDebounce.next();
  }

  onScroll(): void {
    const messageContainer = document.querySelector('.messages');
    if (!messageContainer) return;
    
    const isNearBottom = messageContainer.scrollHeight - messageContainer.scrollTop <= messageContainer.clientHeight + 50;
    this.isAtBottom = isNearBottom;
    
    if (isNearBottom) {
      this.triggerMarkAsRead();
    }
    
    if (messageContainer.scrollTop < 100 && !this.isLoadingMore && !this.noMoreMessages && this.messages.length > 0) {
      const now = Date.now();
      if (now - this.lastLoadTimestamp > 1000) {
        this.loadMoreDebounce.next();
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();    

    this.editAnimationTimeouts.forEach(timeout => clearTimeout(timeout));
    this.editAnimationTimeouts.clear();

    if (this.typingSubscription) {
      this.typingSubscription.unsubscribe();
    }  
  }
  
  getTypingUserName(userId: string): string {
    const user = this.users.find(u => u._id === userId);
    return user ? user.username : 'Unknown User';
  }

  onInputChange(isTyping: boolean): void {
    if (this.chatId) {
      this.chatService.sendTyping(this.chatId, isTyping);
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
  console.log('Chat name clicked');
  console.log('otherParticipant:', this.otherParticipant);
  console.log('chatDetails.participants.length:', this.chatDetails?.participants?.length);
  
  if (this.otherParticipant && this.chatDetails?.participants?.length === 2) {
    console.log('Navigating to user profile:', this.otherParticipant._id);
    this.navigateToUserProfile(this.otherParticipant._id, event);
  } else {
    console.log('Cannot navigate: conditions not met');
  }
}
navigateToUserProfile(userId: string, event?: Event): void {
  console.log('navigateToUserProfile called with userId:', userId);
  
  if (event) {
    event.stopPropagation();
    event.preventDefault();
    console.log('Event propagation stopped');
  }
  
  if (!userId) {
    console.error('Cannot navigate: userId is null or undefined');
    return;
  }
  
  if (userId === this.userId) {
    console.log('Navigating to own profile');
    this.router.navigate(['/profile']);
  } else {
    console.log('Navigating to user profile:', userId);
    this.router.navigate(['/user', userId]);
  }
}
  
  updateMessagesWithDividers(): void {
    this.messagesWithDividers = [];
    let lastDate = null;

    for (const message of this.messages) {
      const messageDate = this.formatDate(new Date(message.timestamp));

      if (messageDate !== lastDate) {
        this.messagesWithDividers.push({
          type: 'divider',
          date: messageDate,
        });
        lastDate = messageDate;
      }

      this.messagesWithDividers.push({
        ...message,
        type: 'message',
      });
    }

    this.cdr.detectChanges();
    
  }
  
  loadChatDetails(): void {
    if (!this.chatId) return;
    
    this.chatService.getChat(this.chatId).subscribe({
      next: (chat) => {
        this.chatDetails = chat;
      const isSavedMessages = chat.participants && chat.participants.length === 1 && chat.participants[0]._id === this.userId;

      if (!isSavedMessages && chat.participants && chat.participants.length > 0) { 
        this.otherParticipant = chat.participants.find(
          (p: any) => p._id !== this.userId
        );

        if (this.otherParticipant) {
          this.otherParticipantStatus$ = this.chatService.getUserStatusText(this.otherParticipant._id);
          this.isOtherParticipantOnline$ = this.chatService.isUserOnline(this.otherParticipant._id);
        } else {
          this.otherParticipantStatus$ = null;
          this.isOtherParticipantOnline$ = null;
        }
      } else {
        this.otherParticipant = null;
        this.otherParticipantStatus$ = null;
        this.isOtherParticipantOnline$ = null;
      }
      this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading chat details:', err);
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
    
    const otherParticipants = this.chatDetails.participants.filter(
      (p: any) => p._id !== this.userId
    );
    
    if (!otherParticipants || otherParticipants.length === 0) {
    // This case should ideally be caught by the self-chat check above
      return this.chatDetails?.participants?.[0]?.username || 'Chat';
    }
    
    return otherParticipants.map((p: any) => p.username).join(', ');
  }

  goBack(): void {
    window.history.back();
  }
  
  markMessagesAsRead(): void {
    if (this.chatId) {
      const unreadMessages = this.messages.filter(msg => 
        msg.senderId !== this.userId && msg.status === 'delivered'
      );
      
      if (unreadMessages.length === 0) return;
  
      console.log('Marking messages as read for chat:', this.chatId);
      
      this.chatService.markMessagesAsRead(this.chatId).subscribe({
        next: () => {
          this.messages.forEach(msg => {
            if (msg.senderId !== this.userId && msg.status !== 'read') {
              msg.status = 'read';
            }
          });
          this.updateMessagesWithDividers();
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Failed to mark messages as read:', err);
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
    if (this.chatId) {
      this.chatService.joinChat(this.chatId);
      this.isLoadingMore = false;
      this.noMoreMessages = false;

      this.chatService.getMessages(this.chatId)!.subscribe({
        next: (messages: Message[]) => {
          this.messages = messages.map((msg) => ({
            ...msg,
            isMyMessage: msg.senderId === this.userId,
            status: msg.status || 'sent'
          }));
          this.updateMessagesWithDividers();
          this.scrollToBottom();
          this.triggerMarkAsRead();
        },
        error: (error) => {
          console.error('Error loading messages:', error); 
        }
      });
    }

    // this.chatService.receiveMessages((message) => {
    //   if (this.chatId === message.chatId) {
    //     message.isMyMessage = message.senderId === this.userId;
    //     this.messages.push(message);
    //     this.updateMessagesWithDividers();
    //     this.cdr.detectChanges();
    //     this.scrollToBottom();
    //     this.triggerMarkAsRead();
    //   }
    // });
  }

  // sendMessage(messageContent: string): void {
  //   if (this.chatId) {
  //     const newMessage: Message = {
  //       chatId: this.chatId,
  //       content: messageContent,
  //       senderId: this.userId!,
  //       senderName: 'You',
  //       timestamp: new Date().toISOString(),
  //       status: 'Sent'
  //     };

  //     this.scrollToBottom();

  //     this.chatService.sendMessage(this.chatId, messageContent, null).subscribe({
  //       next: () => {
  //         newMessage.status = 'Delivered'; 
  //       },
  //       error: () => {
  //         newMessage.status = 'Failed'; 
  //       }
  //     });
  //   }
  // } 
  // Under possible deleting (05.2025)

  scrollToBottom(force: boolean = false): void {
    if (!force && !this.isAtBottom) {
      console.log('ScrollToBottom: Not scrolling, user is not at bottom.');
      return;
    }

    try {
      const messageContainer = document.querySelector('.messages');
      if (messageContainer) {
        setTimeout(() => {
          messageContainer.scrollTop = messageContainer.scrollHeight;
          console.log(`Scrolled to bottom. New scrollTop: ${messageContainer.scrollTop}, scrollHeight: ${messageContainer.scrollHeight}`);
          this.isAtBottom = true; 
        }, 0); 
      } else {
        console.warn('ScrollToBottom: Message container not found.');
      }
    } catch (e) {
      console.error('Error in scrollToBottom:', e);
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
  
  getSelectedMessage(): any {
    console.log('Getting selected message, activeContextMenuId:', this.activeContextMenuId);
    
    if (!this.activeContextMenuId) return null;
    
    const messageFromDividers = this.messagesWithDividers.find(
      (item: any) => item.type === 'message' && item._id === this.activeContextMenuId
    );
    
    if (messageFromDividers) {
      return messageFromDividers;
    }
    
    const messageFromOriginal = this.messages.find(
      (msg: Message) => msg._id === this.activeContextMenuId
    );
    
    console.log('Found message:', messageFromOriginal || null);
    return messageFromOriginal || null;
  }
  
  onMessageClick(message: any): void {
    if (this.activeContextMenuId && this.activeContextMenuId !== message._id) {
      this.activeContextMenuId = null;
    }
  }
  
  showContextMenu(event: MouseEvent, message: any): void {
    event.preventDefault();
    event.stopPropagation();

    if (!message || !message._id) {
      console.error('Cannot show context menu: Invalid message object', message);
      return;
    }

    const MenuWidth = 220;  
    const MenuHeight = 280;
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
  
  startLongPress(event: TouchEvent, message: any): void {
    event.preventDefault();
    
    this.longPressTimer = setTimeout(() => {
      this.setMenuPosition(event);
      this.activeContextMenuId = message._id;
      this.selectedMessageId = message._id;
      
      if ('vibrate' in navigator) {
        navigator.vibrate(100);
      }
    }, 500);
  }
  
  endLongPress(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
    }
  }

  setMenuPosition(event: Event): void {
    console.log('Setting menu position');
    
    let clientX: number, clientY: number;
    
    if (event && 'touches' in event && 
        Array.isArray((event as any).touches) && 
        (event as any).touches.length > 0 && 
        (event as any).touches[0]) {
      // Touch event
      clientX = (event as any).touches[0].clientX;
      clientY = (event as any).touches[0].clientY;
      console.log('Touch coordinates:', clientX, clientY);
    } else if (event && 'clientX' in event && 'clientY' in event) {
      clientX = (event as any).clientX;
      clientY = (event as any).clientY;
      console.log('Mouse coordinates:', clientX, clientY);
    } else {
      console.log('Using fallback positioning');
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
    console.log('Menu position set to:', this.menuPosition);
  }
  
  startEdit(message: any): void {
    this.activeContextMenuId = null;
    
    if (message.senderId !== this.userId) return;
    
    message.isEditing = true;
    message.editedContent = message.content;
    
    this.selectedMessageId = null;
  }
  
  cancelEdit(message: any): void {
    message.isEditing = false;
    delete message.editedContent;
  }
  
  saveMessageEdit(message: Message): void {
    if (!message.editedContent?.trim()) return;
    
    if (message.content === message.editedContent.trim()) {
      message.isEditing = false;
      delete message.editedContent;
      return;
    }
    
    const originalContent = message.content;
    const originalEditingState = message.isEditing;
    
    message.content = message.editedContent.trim();
    message.isEditing = false;
    message.edited = true;
    message.editedAt = new Date();
    
    this.chatService.editMessage(message._id!, message.editedContent.trim()).subscribe({
      next: (updatedMessage) => {
        console.log('Message successfully edited:', updatedMessage);
        
        this.messages = this.messages.map(m => 
          m._id === message._id ? {
            ...m,
            content: updatedMessage.content,
            edited: updatedMessage.edited,
            editedAt: updatedMessage.editedAt
          } : m
        );
        
        this.updateMessagesWithDividers();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to edit message:', err);
        
        message.content = originalContent;
        message.isEditing = originalEditingState;
        this.cdr.detectChanges();
      }
    });
  }

  
  deleteMessage(messageId: string | undefined): void {
    console.log('Attempting to delete message with ID:', messageId);
    
    if (!messageId) {
      console.error('Cannot delete message: Message ID is undefined');
      
      if (this.activeContextMenuId) {
        messageId = this.activeContextMenuId;
        console.log('Using activeContextMenuId instead:', messageId);
      } else {
        return;
      }
    }
    
    this.activeContextMenuId = null;
    this.selectedMessageId = null;
    
    if (confirm('Are you sure you want to delete this message?')) {
      console.log('Confirmed deletion for message ID:', messageId);
      
      this.chatService.deleteMessage(messageId).subscribe({
        next: () => {
          console.log('Message deleted successfully');
          this.messages = this.messages.filter(msg => msg._id !== messageId);
          this.updateMessagesWithDividers();
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Failed to delete message:', err);
          this.cdr.detectChanges();
        }
      });
    } else {
      console.log('Message deletion cancelled by user');
    }
  }
  
  copyMessageText(message: any): void {
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
        return `${this.chatService.getApiUrl()}${avatarPath}`;
      }
      return avatarPath; 
    }
        return 'assets/images/default-avatar.png';
  }

  get getOtherParticipantAvatarUrl(): string {
    if (!this.otherParticipant || !this.otherParticipant.avatar) {
        return 'assets/images/default-avatar.png';
      }
    
      if (this.otherParticipant.avatar.startsWith('/uploads')) {
        return `${this.chatService.getApiUrl()}${this.otherParticipant.avatar}`;
      }

      return this.otherParticipant.avatar.startsWith('/uploads')
      ? `${this.chatService.getApiUrl()}${this.otherParticipant.avatar}`
      : this.otherParticipant.avatar;
  }

  handleAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    console.error(`Failed to load avatar image: ${img.src}`);
    
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
  
    if (user.avatar.startsWith('/uploads')) {
      return `http://localhost:3000${user.avatar}`;
    }
  
    return user.avatar;
  }
  
  forwardMessage(message: any): void {
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
    if (!this.messagetoForward || !this.messagetoForward._id) {
      this.showToast('Cannot forward message: Invalid message');
      this.cancelForward();
      return;
    }
    
    this.chatService.forwardMessage(this.messagetoForward._id, targetChatId).subscribe({
      next: () => {
        this.showToast('Message forwarded successfully');
        this.cancelForward();
      },
      error: (error) => {
        console.error('Error forwarding message:', error);
        this.showToast('Failed to forward message');
        this.cancelForward();
      }
    });
  }

  public showToast(message: string, duration: number = 3000): void {
    console.log('Showing toast:', message);
    
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => {
      if (toast.parentNode) {
        document.body.removeChild(toast);
      }
    });
  
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'toast-icon';
    iconSpan.innerHTML = '✓';
    
    const messageSpan = document.createElement('span');
    messageSpan.className = 'toast-message';
    messageSpan.textContent = message;
    
    toast.appendChild(iconSpan);
    toast.appendChild(messageSpan);
    
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%) translateY(100px)',
      backgroundColor: '#4a76a8', 
      color: 'white',
      padding: '12px 16px',
      borderRadius: '10px',
      fontSize: '14px',
      fontWeight: '500',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      zIndex: '10000',
      opacity: '0',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      transition: 'transform 0.3s ease, opacity 0.3s ease',
      minWidth: '200px',
      maxWidth: '80%',
      textAlign: 'center',
      justifyContent: 'center'
    });
    
    Object.assign(iconSpan.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '20px',
      height: '20px',
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      borderRadius: '50%',
      fontSize: '12px'
    });
    
    document.body.appendChild(toast);
    
    void toast.offsetWidth;
    
    requestAnimationFrame(() => {
      Object.assign(toast.style, {
        opacity: '1',
        transform: 'translateX(-50%) translateY(0)'
      });
      
      iconSpan.animate(
        [
          { transform: 'scale(0)', opacity: 0 },
          { transform: 'scale(1.2)', opacity: 1, offset: 0.7 },
          { transform: 'scale(1)', opacity: 1 }
        ],
        { 
          duration: 400,
          easing: 'ease-out',
          fill: 'forwards'
        }
      );
      
      setTimeout(() => {
        Object.assign(toast.style, {
          opacity: '0',
          transform: 'translateX(-50%) translateY(100px)'
        });
        
        setTimeout(() => {
          if (toast.parentNode) {
            document.body.removeChild(toast);
          }
        }, 300);
      }, duration);
    });
  }

  @HostListener('document:click', ['$event'])
  closeContextMenu(event: Event): void {
    const target = event.target as HTMLElement;
    if (
      this.activeContextMenuId && 
      !target.closest('.context-menu') && 
      !target.closest('.message-menu-icon')
    ) {
      console.log('Closing context menu due to outside click');
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
  
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.activeContextMenuId = null;
      this.selectedMessageId = null;
      
      this.messagesWithDividers.forEach((item: any) => {
        if (item.type === 'message' && item.isEditing) {
          this.cancelEdit(item);
        }
      });
    }
    
    if (event.key === 'Enter' && event.ctrlKey) {
      const editingMessage = this.messagesWithDividers.find(
        (item: any) => item.type === 'message' && item.isEditing
      );
      
      if (editingMessage) {
        this.saveMessageEdit(editingMessage);
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
    if (!this.chatId || this.isLoadingMore || this.noMoreMessages || this.messages.length === 0) {
      return;
    }
    
    this.isLoadingMore = true;
    this.lastLoadTimestamp = Date.now();
    
    const messageContainer = document.querySelector('.messages');
    if (messageContainer) {
      this.scrollHeightBeforeLoad = messageContainer.scrollHeight;
    }
    
    const oldestMessage = this.messages[0];
    
    if (!oldestMessage || !oldestMessage._id) {
      console.error('No valid oldest message found');
      this.isLoadingMore = false;
      return;
    }
    
    console.log(`Loading messages before: ${oldestMessage._id}`);
    
    this.chatService.getMessagesBefore(this.chatId, oldestMessage._id, 20).subscribe({
      next: (olderMessages: Message[]) => {
        this.isLoadingMore = false;
        
        if (olderMessages.length === 0) {
          console.log('No more messages to load');
          this.noMoreMessages = true;
          return;
        }
        
        console.log(`Loaded ${olderMessages.length} older messages`);
        
        const newMessages = olderMessages.map(msg => ({
          ...msg,
          isMyMessage: msg.senderId === this.userId,
          status: msg.status || 'sent'
        }));
        
        this.messages = [...newMessages, ...this.messages];
        this.updateMessagesWithDividers();
        this.cdr.detectChanges();
        
        this.preserveScrollPosition();
      },
      error: (error) => {
        this.isLoadingMore = false;
        console.error('Failed to load older messages:', error);
      }
    });
  }
  
  preserveScrollPosition(): void {
    requestAnimationFrame(() => {
      const messageContainer = document.querySelector('.messages');
      if (messageContainer) {
        const newScrollHeight = messageContainer.scrollHeight;
        const scrollDiff = newScrollHeight - this.scrollHeightBeforeLoad;
        messageContainer.scrollTop = scrollDiff > 0 ? scrollDiff : 0;
      }
    });  
  }

  private addOrUpdateMessage(message: Message, forceScrollForMyMessage: boolean = false): void {
    message.ismyMessage = message.senderId === this.userId; 
    const existingMessageIndex = this.messages.findIndex(m => m._id === message._id);

    if (existingMessageIndex > -1) {
      this.messages[existingMessageIndex] = { ...this.messages[existingMessageIndex], ...message };
    } else {
      this.messages.push(message);
    }

    this.updateMessagesWithDividers();
    this.cdr.detectChanges(); 

    if (forceScrollForMyMessage && message.ismyMessage) {
      console.log('Forcing scroll to bottom for my just sent message.');
      this.scrollToBottom(true);
    } else if (!message.ismyMessage && this.isAtBottom) {
      console.log('Scrolling to bottom for their message while at bottom.');
      this.scrollToBottom();
    } else if (message.ismyMessage && this.isAtBottom) {
      console.log('Scrolling to bottom for my message echo while at bottom.');
      this.scrollToBottom();
    }


    if (message.senderId !== this.userId) {
      this.triggerMarkAsRead();
    }
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

    onMessageSend(content: string | Event): void {
    let messageContent: string;
    
    if (typeof content !== 'string') {
      // If it's an event object, extract the value from the target input
      const target = content.target as HTMLInputElement;
      messageContent = target?.value || '';
    } else {
      messageContent = content;
    }

    if (!this.chatId || !messageContent.trim()) return;

    const messagePayload: any = {
      chatId: this.chatId,
      content: messageContent.trim(),
    };

    if (this.replyingToMessage) {
      messagePayload.replyTo = {
        _id: this.replyingToMessage._id,
        senderName: this.replyingToMessage.senderName,
        content: this.replyingToMessage.content.substring(0, 100),
        senderId: this.replyingToMessage.senderId
      };
    }

    this.chatService.sendMessage(this.chatId, messageContent.trim(), messagePayload.replyTo)
      .subscribe({
        next: (sentMessage) => {
          console.log('Message sent:', sentMessage);
        },
        error: (err) => {
          console.error('Error sending message:', err);
        }
      });

    this.cancelReply(); 
  }

        
  scrollToMessage(messageId: string, block: ScrollLogicalPosition = 'center', forceScroll: boolean = false): void {
    if (!forceScroll && !this.isAtBottom && !this.isSearchActive) {
      console.log('ScrollToMessage: Not scrolling, user is not at bottom and not a search scroll.');
      return;
    }

    const messageElement = document.getElementById('message-' + messageId);
    if (messageElement) {
      // If this is not a search result scroll, use the regular reply highlighting logic
      if (!this.isSearchActive || !messageElement.classList.contains('current-search-result')) {
        document.querySelectorAll('.message.highlighted-reply').forEach(el => 
          el.classList.remove('highlighted-reply')
        );
        messageElement.classList.add('highlighted-reply');
        setTimeout(() => {
          messageElement.classList.remove('highlighted-reply');
        }, 2000);
      }

      messageElement.scrollIntoView({ behavior: 'smooth', block: block });
    } else {
      this.showToast('Message not found in current view', 3000);
      console.warn(`Message element with ID 'message-${messageId}' not found for scrolling.`);
    }
  }

    private handleReactionUpdate(messageId: string, newReactions: Reaction[]): void {
    const messageIndex = this.messages.findIndex(m => m._id === messageId);
    if (messageIndex !== -1) {
      this.messages[messageIndex].reactions = newReactions;
      this.updateMessagesWithDividers(); //
      this.cdr.detectChanges();
      console.log(`Reactions updated for message ${messageId}`, newReactions);
    } else {
      console.warn(`Message ${messageId} not found locally to update reactions.`);
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
    if (!messageId) {
      console.error('Cannot add reaction: messageId is null or undefined');
      return;
    }
    this.chatService.toggleReaction(messageId, reactionType);
    this.activeContextMenuId = null; 
  }

  private handleCurrentChatWasDeleted(deletedBy?: string): void {
    console.log(`CHAT ROOM: Current chat ${this.chatId} was deleted.`);
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

  // Search functionality
  onSearchQueryChange(): void {
    this.searchQuery = this.searchQuery.trim();
    
    if (!this.searchQuery) {
      this.clearSearchResultsLocally(true);
      return;
    }
    
    this.searchDebounce.next(this.searchQuery);
  }

  performActualSearch(query: string): void {
    if (!this.chatId) return;
    this.isSearching = true;
    this.resetMessageHighlights(); 
    
    this.chatService.searchMessages(this.chatId!, query).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (results) => {
        this.isSearching = false;
        this.searchResults = results.sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        this.isSearchActive = true;
        
        if (this.searchResults.length > 0) {
          this.currentSearchResultIndex = 0;
          this.applyHighlightsToMessages(); 
          this.navigateToSearchResult(this.currentSearchResultIndex, true);
        } else {
          this.currentSearchResultIndex = -1;
          this.showToast('No messages found', 3000);
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isSearching = false;
        console.error('Search error:', err);
        this.searchResults = [];
        this.currentSearchResultIndex = -1;
        this.showToast('Search failed, please try again', 3000);
        this.resetMessageHighlights();
        this.cdr.detectChanges();
      }
    });
  }

  clearSearchResultsLocally(resetQuery: boolean = true): void {
    this.searchResults = [];
    this.currentSearchResultIndex = -1;
    if (resetQuery) {
      this.searchQuery = '';
    }
    if (!this.isSearchActive) { 
      this.resetMessageHighlights();
    }
    this.cdr.detectChanges();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.isSearchActive = false;
    this.searchResults = [];
    this.currentSearchResultIndex = 0;
    this.resetMessageHighlights();
    this.scrollToBottom();
  }

  onSearchInputFocus(): void {
    this.isSearching = true;
  }

  onSearchInputBlur(): void {
    setTimeout(() => {
      this.isSearching = false;
    }, 200);
  }

  navigateToSearchResult(index: number, isInitialSearch: boolean = false): void {
    if (index < 0 || index >= this.searchResults.length) return;
    
    const targetMessage = this.searchResults[index];
    if (!targetMessage?._id) return;
    
    this.messages.forEach(m => m.isCurrentSearchResult = false);
    
    const messageInView = this.messages.find(m => m._id === targetMessage._id);
    
    if (messageInView) {
      messageInView.isCurrentSearchResult = true; 
      this.updateMessagesWithDividers(); 
      this.cdr.detectChanges();
      
      setTimeout(() => {
        if (targetMessage._id) {
          this.scrollToMessage(targetMessage._id, 'center', true); 
        }
      }, 50);
    } else {
      console.warn(`Search result message ${targetMessage._id} not found in current view.`);
      this.showToast('Message is not currently loaded, scrolling to approximate position.', 3000);
    }
  }

  scrollToSearchResult(index: number): void {
    if (index < 0 || index >= this.searchResults.length) return;
    
    const messageId = this.searchResults[index]._id;
    if (messageId) {
      this.scrollToMessage(messageId, 'center', true);
    }
  }

  nextSearchResult(): void {
    if (this.searchResults.length === 0) {
      if (this.searchQuery.trim()) this.performActualSearch(this.searchQuery.trim());
      return;
    }
    
    if (this.currentSearchResultIndex < this.searchResults.length - 1) {
      this.currentSearchResultIndex++;
    } else {
      this.currentSearchResultIndex = 0; // Loop back to first result
    }
    
    this.navigateToSearchResult(this.currentSearchResultIndex);
  }

  prevSearchResult(): void {
    if (this.searchResults.length === 0) return;
    
    if (this.currentSearchResultIndex > 0) {
      this.currentSearchResultIndex--;
    } else {
      this.currentSearchResultIndex = this.searchResults.length - 1; // Loop to last result
    }
    
    this.navigateToSearchResult(this.currentSearchResultIndex);
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
    const textWithBreaks = text.replace(/\n/g, '<br>');
    const finalHighlighted = textWithBreaks.replace(re, '<span class="highlighted-search-term">$1</span>');
    
    return this.sanitizer.bypassSecurityTrustHtml(finalHighlighted);
  } catch (error) {
    console.error('Error highlighting text:', error);
    return this.formatMessageContent(text);
  }
}

  private applyHighlightsToMessages(): void {
    const query = this.searchQuery.trim();
    
    // Reset all flags
    this.messages.forEach(msg => {
      msg.isSearchResult = false;
      msg.isCurrentSearchResult = false;
    });
    
    if (query && this.searchResults.length > 0) {
      // Mark all search results
      this.searchResults.forEach(foundMsg => {
        const msgInView = this.messages.find(m => m._id === foundMsg._id);
        if (msgInView) {
          msgInView.isSearchResult = true;
        }
      });
      
      // Mark current result if any
      if (this.currentSearchResultIndex >= 0 && this.currentSearchResultIndex < this.searchResults.length) {
        const currentResultId = this.searchResults[this.currentSearchResultIndex]._id;
        const currentMsgInView = this.messages.find(m => m._id === currentResultId);
        if (currentMsgInView) {
          currentMsgInView.isCurrentSearchResult = true;
        }
      }
    }
    
    this.updateMessagesWithDividers(); // Update to apply classes
    this.cdr.detectChanges();
  }

  private resetMessageHighlights(): void {
    this.messages.forEach(msg => {
      msg.isSearchResult = false;
      msg.isCurrentSearchResult = false;
    });
    this.updateMessagesWithDividers();
  }

  // Search functionality methods
  toggleSearch(): void {
    this.isSearchActive = !this.isSearchActive;
    
    if (this.isSearchActive) {
      this.searchQuery = '';
      this.clearSearchResultsLocally(true);
      
      // Focus the search input after the DOM updates
      setTimeout(() => {
        if (this.searchInputEl) {
          this.searchInputEl.nativeElement.focus();
        }
      }, 0);
    } else {
      this.clearSearch();
    }
  }
  
  closeSearch(): void {
    this.isSearchActive = false;
    this.searchQuery = '';
    this.searchResults = [];
    this.currentSearchResultIndex = 0;
    this.resetMessageHighlights();
  }
  
  navigateToNextSearchResult(): void {
    this.nextSearchResult();
  }
  
  navigateToPreviousSearchResult(): void {
    this.prevSearchResult();
  }


  formatMessageContent(content: string): SafeHtml {
    if (!content) return this.sanitizer.bypassSecurityTrustHtml('');
    
    const formattedContent = content.replace(/\n/g, '<br>');
    
    return this.sanitizer.bypassSecurityTrustHtml(formattedContent);
  }
}

