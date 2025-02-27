import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ChatService } from '../chat.service';
import { Router, RouterModule } from '@angular/router';
import { User, Chat, Message } from '../chat.model';
import { debounceTime, Subject, Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-chat-list',
  templateUrl: './chat-list.component.html',
  styleUrls: ['./chat-list.component.scss'],
  standalone: true,
  imports: [FormsModule, CommonModule, RouterModule]
})
export class ChatListComponent implements OnInit {
  @Output() chatSelected = new EventEmitter<string>();
  chats: any[] = [];
  searchQuery: string = '';
  searchResults: User[] = [];
  selectedUserId: string | null = null;
  loading: boolean = false;
  private searchSubject = new Subject<string>();
  private currentUserId: string | null = null;
  private subscription: Subscription = new Subscription();


  constructor(private chatService: ChatService, private http: HttpClient, private router: Router) {}

  ngOnInit(): void {
    this.currentUserId = localStorage.getItem('userId');
    this.loadChats();
    this.setupSearch();

    this.subscription.add(
      this.chatService.newMessage$.subscribe(message => {
        this.handleNewMessage(message);
      })
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }


  loadChats() {
    this.loading = true;
    this.chatService.getChats()?.subscribe(
      (data: any) => {
        this.chats = data;
        this.formatParticipants();
        this.loading = false;
      },
      (error) => {
        this.loading = false;
        if (error.status === 401 || error.status === 403) {
          this.router.navigate(['/login']);
        }
      }
    );
  }

  setupSearch() {
    this.searchSubject.pipe(debounceTime(300)).subscribe(query => {
      this.searchUsers(query);
    });
  }

  onSearchChange() {
    this.searchSubject.next(this.searchQuery);
  }

  searchUsers(query: string) {
    const token = localStorage.getItem('token');
    if (query.trim()) {
      this.http.get<User[]>(`http://localhost:3000/chats/search?query=${query}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).subscribe({
        next: users => this.searchResults = users,
        error: () => this.searchResults = []
      });
    } else {
      this.searchResults = [];
    }
  }

  selectUser(user: User) {
    this.selectedUserId = user._id;
  }

  createChat() {
    if (this.selectedUserId) {
      const token = localStorage.getItem('token');
      this.http.post<Chat>('http://localhost:3000/chats', { recipientId: this.selectedUserId }, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).subscribe(
        newChat => this.router.navigate(['/chats', newChat._id])
      );
    }
  }

  formatParticipants() {
    this.chats.forEach(chat => {
      const otherParticipants = chat.participants.filter(
        (participant: any) => participant._id !== this.currentUserId
      );
      if (otherParticipants.length > 1) {
        chat.participantsString = otherParticipants.map((participant: any) => participant.username).join(', ');
      } else {     
        chat.participantsString = otherParticipants[0]?.username || 'Unknown'; 
      }
    });
  }
  
  onChatClick(chatId: string) {
    this.chatSelected.emit(chatId);
    this.router.navigate([`/chats/${chatId}`]);
  }

  handleNewMessage(message: Message): void {
    const chatIndex = this.chats.findIndex(chat => chat._id === message.chatId);
    
    if (chatIndex !== -1) {
      this.chats[chatIndex].lastMessage = message;
      
      const chat = this.chats.splice(chatIndex, 1)[0];
      this.chats.unshift(chat);
      
      this.formatParticipants();
    } else {
      this.loadChats();
    }
  }
}