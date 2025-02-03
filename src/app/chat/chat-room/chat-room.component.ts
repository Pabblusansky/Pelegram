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
    });

    this.userId = localStorage.getItem('userId');
  }

  loadMessages(): void {
    if (this.chatId) {
      this.chatService.joinChat(this.chatId);
      this.chatService.getMessages(this.chatId)!.subscribe({
        next: (messages: Message[]) => {
          this.messages = messages.map((msg) => ({
            ...msg,
            isMyMessage: msg.senderId === this.userId
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
      this.chatService.sendMessage(this.chatId, messageContent);
    }
  }

  scrollToBottom(): void {
    const messageContainer = document.querySelector('.messages');
    if (messageContainer) {
      setTimeout(() => {
        messageContainer.scrollTop = messageContainer.scrollHeight;
      }, 100);
    }
  }
}