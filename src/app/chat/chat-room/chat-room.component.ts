import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChatService } from '../chat.service';
import { Message } from '../chat.model';
import { MessageInputComponent } from "../message-input/message-input.component";
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef } from '@angular/core';
@Component({
  selector: 'app-chat-room',
  templateUrl: './chat-room.component.html',
  styleUrls: ['./chat-room.component.scss'],
  standalone: true,
  imports: [MessageInputComponent, CommonModule]
})
export class ChatRoomComponent implements OnInit {
  chatId: string | null = null;
  messages: Message[] = [];

  constructor(
    private route: ActivatedRoute,
    private chatService: ChatService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.chatId = this.route.snapshot.paramMap.get('chatId');
    console.log('Chat ID:', this.chatId);
    if (this.chatId) {
      this.chatService.joinChat(this.chatId); // Join the chat
      this.chatService.getMessages(this.chatId)!.subscribe({
        next: (messages: Message[]) => {
          console.log('Messages loaded:', messages);
          this.messages = messages;
        },
        error: (error) => {
          console.error('Error loading messages:', error); 
        }
      });
    }

    // Subscribe to new messages
    this.chatService.receiveMessages((message) => {
      if (this.chatId === message.chatId) {
        this.messages.push(message); // Add message to the list
        this.cdr.detectChanges(); // Trigger change detection
      }
    });
  }

  sendMessage(messageContent: string): void {
    if (this.chatId) {
      this.chatService.sendMessage(this.chatId, messageContent);
    }
  }
}
