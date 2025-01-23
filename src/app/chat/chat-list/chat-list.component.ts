import { Component, OnInit } from '@angular/core';
import { ChatService } from '../chat.service';
import { CommonModule } from '@angular/common'; // Import CommonModule
import { RouterModule } from '@angular/router'; // Import RouterModule

@Component({
  selector: 'app-chat-list',
  templateUrl: './chat-list.component.html',
  imports: [CommonModule, RouterModule] // Import RouterModule

})
export class ChatListComponent implements OnInit {
  chats: any[] = [];

  constructor(private chatService: ChatService) {}

  ngOnInit() {
    this.chatService.getChats().subscribe((data: any) => {
      this.chats = data;
    });
  }
}
