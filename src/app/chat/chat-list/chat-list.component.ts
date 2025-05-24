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
  filteredChats: any[] = [];
  searchQuery: string = '';
  searchResults: User[] = [];
  // selectedUserId: string | null = null;
  loading: boolean = false;
  loadingChats: boolean = false;
  loadingUserSearch: boolean = false;
  private searchSubject = new Subject<string>();
  private currentUserId: string | null = null;
  private subscription: Subscription = new Subscription();
  private destroy$ = new Subject<void>();
  participantStatuses: Map<string, boolean> = new Map();
  
  private userProfilesCache = new Map<string, UserProfile>();
  
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
    

    this.subscription.add(
      this.chatService.chatDeletedGlobally$
        .pipe(takeUntil(this.destroy$))
        .subscribe(data => {
          this.removeChatFromList(data.chatId, data.deletedBy);
        })
    );
    this.subscription.add(
      this.chatService.newChatCreated$
        .pipe(takeUntil(this.destroy$))
        .subscribe(newChat => {
          this.addNewChatToList(newChat);
        })
    );
    this.subscription.add(
      this.chatService.chatUpdated$.pipe(takeUntil(this.destroy$)).subscribe(updatedChat => {
        this.handleChatUpdate(updatedChat);
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
  
  private handleChatUpdate(updatedChat: Chat): void {
    const chatIndex = this.chats.findIndex(chat => chat._id === updatedChat._id);
    
    if (chatIndex !== -1) {
    this.chats[chatIndex] = {
      ...this.chats[chatIndex],
      ...updatedChat,
    };
    this.formatSingleChat(this.chats[chatIndex]); 

    const chatToMove = this.chats.splice(chatIndex, 1)[0];
    this.chats.unshift(chatToMove);
    this.loadParticipantProfilesForSingleChat(chatToMove);
    this.applyChatFilter();
    this.cdr.detectChanges();
  } else {
    console.warn(`Chat with ID ${updatedChat._id} not found in local list. Reloading all chats.`);
    this.loadChats();
  }
}

  loadChats() {
    this.loadingChats = true;
    this.chatService.getChats()?.subscribe(
      (data: any) => {
        console.log('Loaded chats:', data);
          this.chats = data;
          this.formatParticipants();
          
          this.applyChatFilter();
          this.loadParticipantProfiles();
          
          this.loadingChats = false;
        },
        (error) => {
          console.error('Failed to load chats:', error);
          this.loadingChats = false;
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
    
    participantIds.forEach(userId => {
      this.loadUserProfile(userId);
    });
  }
  
  loadUserProfile(userId: string) {
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
    this.searchSubject.pipe(
      debounceTime(300),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      this.applyChatFilter();
      
      if (this.filteredChats.length === 0 && query.trim().length > 0) {
        this.searchUsersInternal(query);
      } else {
        this.searchResults = []; 
      }
      this.cdr.detectChanges();
    });
  }

  onSearchChange() {
    this.searchSubject.next(this.searchQuery);
  }

  private applyChatFilter(): void {
    const query = this.searchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredChats = [...this.chats]; // If no query, show all chats
    } else {
      this.filteredChats = this.chats.filter(chat =>

        chat.participantsString && chat.participantsString.toLowerCase().includes(query)
      );
    }
  }
  private searchUsersInternal(query: string) { 
    const token = localStorage.getItem('token');
    if (query.trim()) {
      this.loadingUserSearch = true;
      this.searchResults = [];
      this.http.get<User[]>(`http://localhost:3000/chats/search?query=${query}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).subscribe({
        next: users => {
          this.searchResults = users.filter(user => user._id !== this.currentUserId); 
          this.searchResults.forEach(user => {
            if (user._id && !this.userProfilesCache.has(user._id)) {
              this.loadUserProfile(user._id);
            }
          });
          this.loadingUserSearch = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Search error:', err);
          this.searchResults = [];
          this.loadingUserSearch = false;
          this.cdr.detectChanges();
        }
      });
    } else {
      this.searchResults = [];
      this.loadingUserSearch = false;
      this.cdr.detectChanges();
    }
  }

  // selectUser(user: User) {
  //   this.selectedUserId = user._id;
  // }

  startChatWithUser(user: User) {
    if (!user || !user._id) return;

    console.log('Attempting to start chat with user:', user.username);
    this.loading = true;
    this.chatService.createOrGetDirectChat(user._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (newChat: Chat) => {
          this.loading = false;
          this.searchQuery = '';
          this.searchResults = [];
          this.router.navigate(['/chats', newChat._id]);
          if (!this.chats.find(c => c._id === newChat._id)) {
            this.loadChats();
          }
        },
        error: (error) => {
          this.loading = false;
          console.error('Failed to create or get chat with user:', user.username, error);
        }
      });
  }
  formatParticipants() {
    this.chats.forEach(chat => {
      if (!chat.participants) {
        chat.participantsString = 'Unknown Chat';
        return;
      }
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
      
      // this.formatParticipants();
      this.applyChatFilter();
      this.cdr.detectChanges();
    } else {
      this.loadChats();
    }
  }

  private loadParticipantProfilesForSingleChat(chat: any): void {
    if (chat && chat.participants) {
      chat.participants.forEach((participant: any) => {
        if (participant._id !== this.currentUserId && !this.userProfilesCache.has(participant._id)) {
          this.loadUserProfile(participant._id);
        }
      });
    }
  }

  private formatSingleChat(chat: any): void {
    if (!chat || !chat.participants) return;
    const otherParticipants = chat.participants.filter(
      (participant: any) => participant._id !== this.currentUserId
    );
    if (otherParticipants.length > 0) {
      if (otherParticipants.length > 1) {
          chat.participantsString = otherParticipants.map((participant: any) => participant.username || 'User').join(', ');
      } else {
          chat.participantsString = otherParticipants[0]?.username || 'Saved Messages'; 
      }
    } else {
      chat.participantsString = 'Saved Messages';
    }
  }

  getChatDisplayName(chat: any): string {
    if (!chat) return 'Chat';
    return chat.participantsString || chat.participants?.find((p: { _id: string, username: string }) => p._id !== this.currentUserId)?.username || 'Chat';
  }
  confirmAndDeleteChat(chatToDelete: Chat, event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();

    if (!chatToDelete._id) {
      console.error('Cannot delete chat: chat ID is missing.');
      return;
    }

    const chatName = this.getChatDisplayName(chatToDelete);
    const confirmed = confirm(
      `Are you sure you want to delete the chat with "${chatName}"? This action is irreversible and will delete all messages for all participants.`
    );

    if (confirmed) {
      this.loading = true;
      this.chatService.deleteChat(chatToDelete._id).subscribe({
        next: (response) => {
          console.log(`Chat ${chatToDelete._id} deletion request sent successfully. Response:`, response);
          this.loading = false;
        },
        error: (err) => {
          console.error(`Failed to delete chat ${chatToDelete._id}:`, err);
          alert(`Error deleting chat: ${err.error?.message || err.message || 'Unknown error'}`);
          this.loading = false;
        }
      });
    }
  }

  private removeChatFromList(chatIdToRemove: string, deletedBy?: string): void {
    const index = this.chats.findIndex(chat => chat._id === chatIdToRemove);
    if (index > -1) {
      const removedChat = this.chats.splice(index, 1)[0];
      console.log(`Chat '${this.getChatDisplayName(removedChat)}' (ID: ${chatIdToRemove}) removed from list.`);
      this.applyChatFilter();
      this.cdr.detectChanges();
    }
  }

    private addNewChatToList(newChat: Chat): void {
    const existingChatIndex = this.chats.findIndex(c => c._id === newChat._id);
    if (existingChatIndex === -1) {
      console.log(`CHAT-LIST: Adding new chat to list:`, newChat);
      this.chats.unshift(newChat);
      
      this.formatSingleChat(this.chats[0]);
      this.loadParticipantProfilesForSingleChat(this.chats[0]);
      this.applyChatFilter();
      this.cdr.detectChanges();
    } else {
      console.log(`CHAT-LIST: New chat event for existing chat ${newChat._id}, possibly updating.`, newChat);
      this.chats[existingChatIndex] = { ...this.chats[existingChatIndex], ...newChat };
      this.formatSingleChat(this.chats[existingChatIndex]);
      this.cdr.detectChanges();
    }
  }
}