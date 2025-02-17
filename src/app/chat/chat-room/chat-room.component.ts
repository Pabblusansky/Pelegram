import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChatService } from '../chat.service';
import { Message } from '../chat.model';
import { MessageInputComponent } from "../message-input/message-input.component";
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-chat-room',
  templateUrl: './chat-room.component.html',
  styleUrls: ['./chat-room.component.scss'],
  standalone: true,
  imports: [MessageInputComponent, CommonModule, FormsModule]
})
export class ChatRoomComponent implements OnInit {
  chatId: string | null = null;
  messages: Message[] = [];
  userId: string | null = null;
  private isAtBottom: boolean = true;

  constructor(
    private route: ActivatedRoute,
    private chatService: ChatService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.chatId = params.get('chatId');
      this.loadMessages();
      this.markMessagesAsRead();
    });
  
    this.userId = localStorage.getItem('userId');

    this.chatService.onMessageStatusUpdated().subscribe((data: any) => {
      const message = this.messages.find(msg => msg._id === data.messageId);
      if (message) {
        message.status = data.status;
        this.cdr.detectChanges(); 
        console.log(`Message status updated: ${data.messageId} -> ${data.status}`); 
      }
    });
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
          console.log('All messages in chat marked as read.');
        },
        error: (err) => {
          console.error('Failed to mark messages as read:', err);
        }
      });
    }
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
      case 'Sent':
        return 'assets/sent.svg'; 
      case 'Delivered':
        return 'assets/delivered.svg'; 
      case 'Read':
        return 'assets/read.svg'; 
      default:
        return 'assets/sent.svg';
    }
  }
  
  
}