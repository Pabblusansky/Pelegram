import { Component, OnInit } from '@angular/core';
import { ChatListComponent } from "../chat/chat-list/chat-list.component";
import { ChatRoomComponent } from "../chat/chat-room/chat-room.component";
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  standalone: true,
  imports: [ChatListComponent, ChatRoomComponent],
})
export class HomeComponent implements OnInit{
  selectedChatId: string | null = null;
  constructor(private router: Router) {}
  ngOnInit(): void {
  }
  onChatSelect(chatId: string) {
    this.selectedChatId = chatId;
    // this.router.navigate([`/chats/${chatId}`]);
  }
  isChatSelected() : boolean {
    return this.selectedChatId !== null;
  }
}