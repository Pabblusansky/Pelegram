import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChatService } from '../chat.service';
import { Message } from '../chat.model';
import { MessageInputComponent } from "../message-input/message-input.component";
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-chat-room',
  templateUrl: './chat-room.component.html',
  styleUrls: ['./chat-room.component.scss'],
  imports: [MessageInputComponent, CommonModule]
})
export class ChatRoomComponent implements OnInit {
  chatId: string | null = null;
  messages: Message[] = [];

  constructor(
    private route: ActivatedRoute,
    private chatService: ChatService
  ) {}

  ngOnInit(): void {
    this.chatId = this.route.snapshot.paramMap.get('chatId');
    console.log('Chat ID:', this.chatId);
    if (this.chatId) {
      this.chatService.getMessages(this.chatId)!.subscribe(
        (messages: Message[]) => {
          console.log('Messages loaded:', messages);
          this.messages = messages;
        },
        (error) => {
          console.error('Error loading messages:', error); 
        }
      );
    }

    // Subscribe to new messages
    this.chatService.receiveMessages((message) => {
      if (this.chatId === message.chatId) {
        this.messages.push(message); // Add message to the list
      }
    });
  }

  sendMessage(messageContent: string): void {
    if (this.chatId) {
      this.chatService.sendMessage(this.chatId, messageContent);
    }
  }
}
