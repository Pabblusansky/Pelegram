import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ChatService } from '../chat.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { User, Chat } from '../chat.model';
@Component({
  selector: 'app-chat-list',

  imports: [

    CommonModule,

    FormsModule,

    RouterModule

  ],
  templateUrl: './chat-list.component.html',
  styleUrls: ['./chat-list.component.scss']
})
export class ChatListComponent implements OnInit {
  chats: any[] = [];
  searchQuery: string = '';  
  searchResults: User[] = []; 
  selectedUserId: string | null = null;

  constructor(private chatService: ChatService, private http: HttpClient, private router: Router) {}

  ngOnInit(): void {
    this.chatService.getChats()?.subscribe(
      (data: any) => {
        this.chats = data;
        this.formatParticipants();
      },
      (error) => {
        if (error.status === 401 || error.status === 403) {
          this.router.navigate(['/login']);
        }
      }
    );
  }
  searchUsers() {
    const token = localStorage.getItem('token'); 
    
    if (this.searchQuery.trim()) {
      this.http.get<any[]>(`http://localhost:3000/chats/search?query=${this.searchQuery}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      .subscribe(
        users => {
          this.searchResults = users;
        },
        error => {
          if (error.status === 404) {
            console.warn(`No users found for query: ${this.searchQuery}`);
            this.searchResults = [];
          } else {
            console.error('An error occurred:', error);
          }
        }
      );
    } else {
      this.searchResults = [];
    }
  }

  createChat() {
    if (this.selectedUserId) {
      const token = localStorage.getItem('token');  
      this.http.post<Chat>('http://localhost:3000/chats', { recipientId: this.selectedUserId }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      .subscribe(newChat => {
        this.router.navigate(['/chats', newChat._id]); 
      });
    }
  }
  formatParticipants() {
    this.chats.forEach(chat => {
      chat.participantsString = chat.participants.map((participant: any) => participant.username).join(', ');
    });
  }
}
