import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ChatService } from '../chat.service';
import { Router, RouterModule } from '@angular/router';
import { User, Chat, Message } from '../chat.model';
import { debounceTime, Subject, Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, OnDestroy } from '@angular/core';
import { map, takeUntil } from 'rxjs/operators';

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
  private destroy$ = new Subject<void>();
  participantStatuses: Map<string, boolean> = new Map();
  

  constructor(private chatService: ChatService, private http: HttpClient, private router: Router, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.currentUserId = localStorage.getItem('userId');
    this.loadChats();
    this.setupSearch();

    this.subscription.add(
      this.chatService.newMessage$.subscribe(message => {
        this.handleNewMessage(message);
      })
    );
    this.chatService.userStatuses$
    .pipe(takeUntil(this.destroy$))
    .subscribe(statuses => {
      this.chats.forEach(chat => {
        const otherParticipant = chat.participants.find(
          (p: any) => p._id !== this.currentUserId
        );
        
        if (otherParticipant) {
          const userId = otherParticipant._id;
          const userStatus = statuses[userId];
          
          this.participantStatuses.set(userId, userStatus ? userStatus.online : false);
        }
      });
      
      this.cdr.detectChanges();
    });
  
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  isParticipantOnline(userId: string): boolean {
    return this.participantStatuses.get(userId) || false;
  }

  viewUserProfile(userId: string | null): void {
    if (!userId) return;
    
    if (userId === this.currentUserId) {
      this.router.navigate(['/profile']);
    } else {
      this.router.navigate(['/user', userId]);
    }
  }

  onParticipantNameClick(event: Event, userId: string | null): void {
    event.stopPropagation();
    event.preventDefault();
    
    this.viewUserProfile(userId);
  }

  onAvatarClick(event: Event, userId: string | null): void {
    event.stopPropagation();
    event.preventDefault();
    
    this.viewUserProfile(userId);
  }

  getOtherParticipantId(chat: any): string | null {
    if (!chat.participants || chat.participants.length === 0) {
      return null;
    }
    
    const otherParticipant = chat.participants.find(
      (p: any) => p._id !== this.currentUserId
    );
    
    return otherParticipant ? otherParticipant._id : null;
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
    this.loading = true;
    this.chatService.createOrGetDirectChat(this.selectedUserId)
      .subscribe({
        next: (newChat) => {
          this.loading = false;
          this.router.navigate(['/chats', newChat._id]);
        },
        error: (error) => {
          this.loading = false;
          console.error('Failed to create chat:', error);
          
        }
      });
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