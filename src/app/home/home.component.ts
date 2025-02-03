import { Component, OnInit } from '@angular/core';
import { ChatListComponent } from "../chat/chat-list/chat-list.component";
import { ChatRoomComponent } from "../chat/chat-room/chat-room.component";
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  standalone: true,
  imports: [ChatListComponent, ChatRoomComponent, CommonModule],
})
export class HomeComponent implements OnInit{
  selectedChatId: string | null = null;

  constructor(private router: Router, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.selectedChatId = params.get('chatId') || null;
    });
  }

  onChatSelect(chatId: string) {
    this.selectedChatId = chatId;
    this.router.navigate([`/chats/${chatId}`], { onSameUrlNavigation: 'reload' });
  }
  
  isChatSelected() : boolean {
    return this.selectedChatId !== null;
  }
}