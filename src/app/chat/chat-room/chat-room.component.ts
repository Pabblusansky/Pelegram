import { Component, ElementRef, Host, OnDestroy, OnInit, QueryList, ViewChildren } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChatService } from '../chat.service';
import { Message } from '../chat.model';
import { MessageInputComponent } from "../message-input/message-input.component";
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, takeUntil } from 'rxjs';
import { debounceTime, Subject} from 'rxjs';
import { HostListener } from '@angular/core';

import { 
  trigger, 
  state, 
  style, 
  transition, 
  animate 
} from '@angular/animations';

@Component({
  selector: 'app-chat-room',
  templateUrl: './chat-room.component.html',
  styleUrls: ['./chat-room.component.scss'],
  standalone: true,
  imports: [MessageInputComponent, CommonModule, FormsModule],
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
  isTyping: boolean = false;
  typingUsers: Set<string> = new Set();
  chatId: string | null = null;
  messages: Message[] = [];
  messagesWithDividers: any = [];
  userId: string | null = null;
  activeContextMenuId: string | null = null;
  private isAtBottom: boolean = true;
  users: any[] = [];
  menuPosition: { x: number; y: number } = { x: 0, y: 0 };
  private markAsReadDebounce = new Subject<void>();
  typingSubscription: Subscription | null = null;
  selectedMessageId: string | null = null;
  private editTextareaRef: ElementRef | null = null;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private destroy$ = new Subject<void>();
  private editAnimationTimeouts = new Map<string, ReturnType<typeof setTimeout>>();


  constructor(
    private route: ActivatedRoute,
    private chatService: ChatService,
    private cdr: ChangeDetectorRef
  ) {
    this.markAsReadDebounce.pipe(debounceTime(500)).subscribe(() => {
      this.markMessagesAsRead();
    });
  }

  ngOnInit(): void {

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
      this.chatId = params.get('chatId');
      this.loadMessages();
      this.markMessagesAsRead();
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
  }
  
  triggerMarkAsRead(): void {
    this.markAsReadDebounce.next();
  }

  onScroll(): void {
    const messageContainer = document.querySelector('.messages');
    if (messageContainer) {
      const isNearBottom = messageContainer.scrollHeight - messageContainer.scrollTop <= messageContainer.clientHeight + 50;
      this.isAtBottom = isNearBottom;
      if (isNearBottom) {
        this.triggerMarkAsRead();
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
    console.log("onInputChange triggered:", isTyping);
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

  trackByMessageId(index: number, item: Message): string {
    return item._id ?? index.toString();
  }

  loadMessages(): void {
    if (this.chatId) {
      this.chatService.joinChat(this.chatId);
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

    this.chatService.receiveMessages((message) => {
      if (this.chatId === message.chatId) {
        message.isMyMessage = message.senderId === this.userId;
        this.messages.push(message);
        this.updateMessagesWithDividers();
        this.cdr.detectChanges();
        this.scrollToBottom();
        this.triggerMarkAsRead();
      }
    });
  }

  sendMessage(messageContent: string): void {
    if (this.chatId) {
      const newMessage: Message = {
        chatId: this.chatId,
        content: messageContent,
        senderId: this.userId!,
        senderName: 'You',
        timestamp: new Date().toISOString(),
        status: 'Sent'
      };

      this.scrollToBottom();

      this.chatService.sendMessage(this.chatId, messageContent).subscribe({
        next: () => {
          newMessage.status = 'Delivered'; 
        },
        error: () => {
          newMessage.status = 'Failed'; 
        }
      });
    }
  }

  scrollToBottom(): void {
    const messageContainer = document.querySelector('.messages');
    if (messageContainer && this.isAtBottom) {
      setTimeout(() => {
        messageContainer.scrollTop = messageContainer.scrollHeight;
      }, 100);
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
    console.log('Messages:', this.messagesWithDividers);
    
    if (!this.activeContextMenuId) return null;
    
    const message = this.messagesWithDividers.find(
      (item: any) => item.type === 'message' && item._id === this.activeContextMenuId
    );
    
    console.log('Found message:', message);
    return message;
  }
  
  onMessageClick(message: any): void {
    if (this.activeContextMenuId && this.activeContextMenuId !== message._id) {
      this.activeContextMenuId = null;
    }
  }
  
  showContextMenu(event: MouseEvent, message: any): void {
    event.preventDefault();
    event.stopPropagation();
    
    console.log("showContextMenu triggered for message:", message._id);
    const x = Math.min(event.clientX, window.innerWidth - 200);
    const y = Math.min(event.clientY, window.innerHeight - 250);
    
    this.menuPosition = { x, y };
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
  
  showMenuIconClick(event: MouseEvent, message: any): void {

    event.stopPropagation();
    event.stopImmediatePropagation();
    event.preventDefault();
    
    this.setMenuPosition(event);

    this.activeContextMenuId = message._id;
    this.selectedMessageId = message._id;
    
    this.cdr.detectChanges();
    setTimeout(() => {
      console.log('After update: activeContextMenuId =', this.activeContextMenuId);
      console.log('Context menu visible:', !!document.querySelector('.context-menu'));
    }, 0);
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
    if (!messageId) return;
    
    this.activeContextMenuId = null;
    this.selectedMessageId = null;
    
    if (confirm('Are you sure you want to delete this message?')) {
      this.chatService.deleteMessage(messageId).subscribe({
        next: () => {
          this.messages = this.messages.filter(msg => msg._id !== messageId);
          this.updateMessagesWithDividers();
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Failed to delete message:', err);
          this.cdr.detectChanges();
        }
      });
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
  
  forwardMessage(message: any): void {
    if (!message) return;
    
    this.activeContextMenuId = null;
    this.selectedMessageId = null;
    
    console.log('Forward message:', message);
    this.showToast('Forward functionality not implemented yet');
  }
  
  private showToast(message: string, duration: number = 3000): void {
    console.log('Showing toast:', message);
    
    // Удаляем существующие уведомления
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => {
      if (toast.parentNode) {
        document.body.removeChild(toast);
      }
    });
  
    // Создаем новое уведомление
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    
    // Создаем содержимое с иконкой
    const iconSpan = document.createElement('span');
    iconSpan.className = 'toast-icon';
    iconSpan.innerHTML = '✓'; // Можно заменить на другую иконку
    
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

}
