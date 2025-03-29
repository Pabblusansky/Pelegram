import { Component, EventEmitter, OnInit, OnDestroy, Output } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ChatService } from '../chat.service';
import { Router, RouterModule } from '@angular/router';
import { User, Chat, Message } from '../chat.model';
import { debounceTime, Subject, Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef } from '@angular/core';
import { takeUntil } from 'rxjs/operators';
import { UserProfile } from '../../profile/profile.model';
import { getFullAvatarUrl } from '../../utils/url-utils';
import { ProfileService } from '../../profile/profile.service';

@Component({
  selector: 'app-chat-list',
  templateUrl: './chat-list.component.html',
  styleUrls: ['./chat-list.component.scss'],
  standalone: true,
  imports: [FormsModule, CommonModule, RouterModule]
})
export class ChatListComponent implements OnInit, OnDestroy {
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
  
  // Кэш для профилей пользователей
  private userProfilesCache = new Map<string, UserProfile>();
  
  // Отслеживание загрузки аватаров
  loadingAvatars = new Set<string>();
  

  constructor(
    private chatService: ChatService, 
    private http: HttpClient, 
    private router: Router, 
    private cdr: ChangeDetectorRef,
    private profileService: ProfileService
  ) {}

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

  getUserAvatar(chat: any): string {
    if (!chat || !chat.participants) {
      return 'assets/images/default-avatar.png';
    }
    
    const otherParticipant = chat.participants.find(
      (p: any) => p._id !== this.currentUserId
    );
    
    if (!otherParticipant) {
      return 'assets/images/default-avatar.png';
    }
    
    const userId = otherParticipant._id;
    
    if (this.userProfilesCache.has(userId)) {
      const profile = this.userProfilesCache.get(userId);
      return getFullAvatarUrl(profile?.avatar);
    }
    
    if (this.loadingAvatars.has(userId)) {
      return 'assets/images/avatar-loading.png';
    }
    
    this.loadUserProfile(userId);
    
    return 'assets/images/default-avatar.png';
  }

  getSearchResultAvatar(user: User): string {
    if (!user || !user._id) {
      return 'assets/images/default-avatar.png';
    }
    
    if (this.userProfilesCache.has(user._id)) {
      const profile = this.userProfilesCache.get(user._id);
      return getFullAvatarUrl(profile?.avatar);
    }
    
    
    this.loadUserProfile(user._id);
    
    return 'assets/images/default-avatar.png';
  }

  handleAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    console.error(`Failed to load avatar image: ${img.src}`);
    
    // Set default avatar image if the current one failed to load
    if (!img.src.includes('default-avatar.png')) {
      img.src = 'assets/images/default-avatar.png';
    }
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
        console.log('Loaded chats:', data);
        this.chats = data;
        this.formatParticipants();
        
        this.loadParticipantProfiles();
        
        this.loading = false;
      },
      (error) => {
        console.error('Failed to load chats:', error);
        this.loading = false;
        if (error.status === 401 || error.status === 403) {
          this.router.navigate(['/login']);
        }
      }
    );
  }
  
  loadParticipantProfiles() {
    const participantIds = new Set<string>();
    
    this.chats.forEach(chat => {
      chat.participants.forEach((participant: any) => {
        if (participant._id !== this.currentUserId && !this.userProfilesCache.has(participant._id)) {
          participantIds.add(participant._id);
        }
      });
    });
    
    console.log('Loading profiles for participants:', Array.from(participantIds));
    
    // Загружаем профиль для каждого участника
    participantIds.forEach(userId => {
      this.loadUserProfile(userId);
    });
  }
  
  // Метод для загрузки профиля отдельного пользователя
  loadUserProfile(userId: string) {
    // Если профиль уже в кэше или загружается, не загружаем снова
    if (this.userProfilesCache.has(userId) || this.loadingAvatars.has(userId)) {
      return;
    }
    
    this.loadingAvatars.add(userId);
    
    this.profileService.getUserProfile(userId).subscribe({
      next: (profile: UserProfile) => {
        console.log(`Loaded profile for user ${userId}:`, profile);
        
        this.userProfilesCache.set(userId, profile);
        
        this.loadingAvatars.delete(userId);
        
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error(`Failed to load profile for user ${userId}:`, err);
        
        this.loadingAvatars.delete(userId);
      }
    });
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
        next: users => {
          console.log('Search results:', users);
          this.searchResults = users;
          
          users.forEach(user => {
            if (user._id && !this.userProfilesCache.has(user._id)) {
              this.loadUserProfile(user._id);
            }
          });
        },
        error: (err) => {
          console.error('Search error:', err);
          this.searchResults = [];
        }
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