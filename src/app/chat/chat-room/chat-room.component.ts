import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChatService } from '../chat.service';
import { Message } from '../chat.model';
import { MessageInputComponent } from "../message-input/message-input.component";
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription

 } from 'rxjs';
@Component({
  selector: 'app-chat-room',
  templateUrl: './chat-room.component.html',
  styleUrls: ['./chat-room.component.scss'],
  standalone: true,
  imports: [MessageInputComponent, CommonModule, FormsModule],
})

export class ChatRoomComponent implements OnInit, OnDestroy {
  isTyping: boolean = false;
  typingUsers: Set<string> = new Set();
  chatId: string | null = null;
  messages: Message[] = [];
  messagesWithDividers: any = [];
  userId: string | null = null;
  private isAtBottom: boolean = true;
  users: any[] = [];
  typingSubscription: Subscription | null = null;

  constructor(
    private route: ActivatedRoute,
    private chatService: ChatService,
    private cdr: ChangeDetectorRef
  ) {}

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
  
  ngOnDestroy(): void {
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
      console.log('Marking messages as read for chat:', this.chatId);
  
      this.chatService.markMessagesAsRead(this.chatId).subscribe({
        next: () => {
          this.messages.forEach(msg => {
            if (msg.senderId !== this.userId && msg.status !== 'read') {
              msg.status = 'read';
            }
          });
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
            status: msg.status || 'sent' // Add the Sent status
          }));
          this.updateMessagesWithDividers();
          this.scrollToBottom();
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

      // this.messages.push(newMessage); 
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
  
  
}