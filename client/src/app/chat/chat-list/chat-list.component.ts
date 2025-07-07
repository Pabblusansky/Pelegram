import { Component, EventEmitter, OnInit, OnDestroy, Output, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ChatService } from '../chat.service';
import { Router, RouterModule } from '@angular/router';
import { User, Chat, Message, UnreadCount } from '../chat.model';
import { debounceTime, Subject, Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef } from '@angular/core';
import { takeUntil } from 'rxjs/operators';
import { UserProfile } from '../../profile/profile.model';
import { getFullAvatarUrl } from '../../utils/url-utils';
import { ProfileService } from '../../profile/profile.service';
import { CreateGroupChatComponent } from "../group/create-group-chat/create-group-chat.component";
import { ToastService } from '../../utils/toast-service';
import { ConfirmationService } from '../../shared/services/confirmation.service';

@Component({
  selector: 'app-chat-list',
  templateUrl: './chat-list.component.html',
  styleUrls: ['./chat-list.component.scss'],
  standalone: true,
  imports: [FormsModule, CommonModule, RouterModule, CreateGroupChatComponent],
  providers: []
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
  public currentUserId: string | null = null;
  private subscription: Subscription = new Subscription();
  private destroy$ = new Subject<void>();
  participantStatuses: Map<string, boolean> = new Map();
  
  private userProfilesCache = new Map<string, UserProfile>();
  
  loadingAvatars = new Set<string>();

  savedMessagesChat: Chat | null = null; 

  isCreateGroupDialogOpen = false;
  
  constructor(
    private chatService: ChatService, 
    public router: Router, 
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private profileService: ProfileService,
    private ToastService: ToastService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.currentUserId = localStorage.getItem('userId');
    this.loadInitialChats();
    this.setupSearch();

    this.subscription.add(
      this.chatService.newMessage$.subscribe(message => {
        this.handleNewMessage(message);
      })
    );
    

    this.chatService.userRemovedFromChat$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        console.log(`CHAT-LIST: User removed/left chat ${data.chatId}, reason: ${data.reason}`);
        this.chats = this.chats.filter(chat => chat._id !== data.chatId);
        if (this.router.url.includes(`/chats/${data.chatId}`)) {
          this.ToastService.showToast(data.reason === 'left_group' ? 'You have left the group.' : 'You were removed from the group.');
          this.router.navigate(['/home']);
        }
        this.cdr.detectChanges();
    });
    this.subscription.add(
      this.chatService.chatDeletedGlobally$
        .pipe(takeUntil(this.destroy$))
        .subscribe(data => {
          this.removeChatFromList(data.chatId, data.deletedBy);
        })
    );
    
    this.subscription.add(
      this.chatService.messageDeleted$
        .pipe(takeUntil(this.destroy$))
        .subscribe(event => {
          this.handleMessageDeletedEvent(event);
        })
    );
    this.subscription.add(
      this.chatService.newChatCreated$
        .pipe(takeUntil(this.destroy$))
        .subscribe(newChat => {
          this.handleNewChatCreated(newChat);
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
        // console.log('CHAT-LIST: Received userStatuses in component:', JSON.parse(JSON.stringify(statuses)));
        let changed = false;
        this.chats.forEach(chat => {
          if (chat.isSelfChat || !chat.participants || chat.participants.length < 2) {
            return;
          }
          const otherParticipant = chat.participants.find(
            (p: any) => p._id !== this.currentUserId
          );
          
          if (otherParticipant && otherParticipant._id) {
            const userId = otherParticipant._id;
            const userStatus = statuses[userId];
            const newOnlineStatus = userStatus ? userStatus.online : false;
            // console.log(`CHAT-LIST: Chat ${chat._id}, otherP: ${userId}, newStatus: ${newOnlineStatus}, currentMapStatus: ${this.participantStatuses.get(userId)}`);
            if (this.participantStatuses.get(userId) !== newOnlineStatus) {
              this.participantStatuses.set(userId, newOnlineStatus);
              changed = true;
            }
          }
        });
        if (changed) {
        this.cdr.detectChanges();
        }
      });
  }

loadInitialChats(): void {
  this.loadingChats = true;
  console.log("CHAT-LIST: Attempting to load Saved Messages chat...");
  this.chatService.getSavedMessagesChat().subscribe({
    next: (smChat) => {
      console.log("CHAT-LIST: Received Saved Messages chat data:", smChat);
      if (smChat && smChat._id) {
        this.savedMessagesChat = this.formatChatForDisplay(smChat, true);
        console.log("LOAD_INIT: SavedMessagesChat object AFTER format:", JSON.parse(JSON.stringify(this.savedMessagesChat)));
      } else {
        console.warn("CHAT-LIST: Saved Messages chat data is invalid or missing _id.");
        this.savedMessagesChat = null;
      } 
      this.loadRegularChats(); 
    },
    error: (err) => {
      console.error('CHAT-LIST: Error loading Saved Messages chat, proceeding with regular chats:', err);
      this.savedMessagesChat = null; 
      this.savedMessagesChat = null;
      this.loadRegularChats();
    }
  });
}

loadRegularChats(): void {
  this.chatService.getChats()?.subscribe({
    next: (regularChatsData: any) => {
      let regularChats: Chat[] = Array.isArray(regularChatsData) ? regularChatsData : [];
      console.log("LOAD_REGULAR: Fetched regular chats. Count:", regularChats.length, "SavedMessagesChat ID to filter:", this.savedMessagesChat);

      this.chats = regularChats
        .filter(chat => {
          const shouldKeep = !(this.savedMessagesChat && chat._id === this.savedMessagesChat._id);
          if (!shouldKeep) {
            console.log(`LOAD_REGULAR: Filtering out Saved Messages chat (ID: ${chat._id}) from regular list.`);
          }
          return shouldKeep;
        })
        .map(chat => {
          return this.formatChatForDisplay(chat, false); 
        });

      console.log("LOAD_REGULAR: Chats array AFTER filtering and formatting regular chats. Count:", this.chats.length);

      if (this.savedMessagesChat) {
        const alreadyExistsIndex = this.chats.findIndex(c => c._id === this.savedMessagesChat!._id);
        if (alreadyExistsIndex !== -1) {
            console.warn("LOAD_REGULAR: SavedMessagesChat was already in the list. Replacing.", this.savedMessagesChat);
            this.chats.splice(alreadyExistsIndex, 1);
        }
        console.log("LOAD_REGULAR: Unshifting pre-formatted SavedMessagesChat:", JSON.parse(JSON.stringify(this.savedMessagesChat)));
        this.chats.unshift(this.savedMessagesChat);
      }

      this.sortChatsInPlace();
      this.applyChatFilter();
      this.loadParticipantProfiles();
      this.loadingChats = false;
      this.cdr.detectChanges();
      console.log("LOAD_REGULAR: Final this.chats count:", this.chats.length, "Final this.filteredChats count:", this.filteredChats.length);
      console.log("LOAD_REGULAR: First chat in filteredChats:", this.filteredChats.length > 0 ? JSON.parse(JSON.stringify(this.filteredChats[0])) : "None");
    },
      error: (error) => {
        console.error('Failed to load regular chats:', error);
        this.loadingChats = false;
        if (error.status === 401 || error.status === 403) {
          this.router.navigate(['/login']);
        }
      }
    });
  }

  // General method to format a chat (both regular and Saved Messages)

  formatChatForDisplay(chat: Chat, isSelf: boolean): any {
    const formatted = { ...chat };
    const id = chat._id;

    if (chat.isGroupChat) {
      formatted.participantsString = chat.name || 'Group Chat';
      
      if (chat.groupAvatar) {
        if (chat.groupAvatar.startsWith('/uploads/')) {
          formatted.displayAvatarUrl = `${this.chatService.getApiUrl()}${chat.groupAvatar}`;
        } else {
          formatted.displayAvatarUrl = chat.groupAvatar;
        }
      } else {
        formatted.displayAvatarUrl = 'assets/images/default-group-avatar.png';
      }
      
      console.log(`FORMAT_CHAT (${id}): Formatted as GROUP. Name: ${formatted.participantsString}, Avatar: ${formatted.displayAvatarUrl}`);
    } else if (isSelf) {
      formatted.participantsString = 'Saved Messages'; 
      formatted.displayAvatarUrl = 'assets/images/saved-messages-icon.png'; 
      console.log(`FORMAT_CHAT (${id}): Formatted as SELF. displayAvatarUrl: ${formatted.displayAvatarUrl}`);
    } else {
      const otherParticipants = chat.participants?.filter(p => p._id !== this.currentUserId);

      if (otherParticipants && otherParticipants.length > 0) {
        if (otherParticipants.length > 1) {
          formatted.participantsString = otherParticipants.map(p => p.username || 'User').join(', ');
        } else {
          formatted.participantsString = otherParticipants[0]?.username || 'Chat User';
        }

        const mainOtherParticipant = otherParticipants[0];
        if (mainOtherParticipant && mainOtherParticipant._id) { 
          const userProfile = this.userProfilesCache.get(mainOtherParticipant._id);
          if (userProfile && userProfile.avatar) {
            formatted.displayAvatarUrl = getFullAvatarUrl(userProfile.avatar);
          } else {
            formatted.displayAvatarUrl = 'assets/images/default-avatar.png';
            if (!userProfile && !this.loadingAvatars.has(mainOtherParticipant._id)) {
              this.loadUserProfile(mainOtherParticipant._id);
            }
          }
        } else {
          formatted.displayAvatarUrl = 'assets/images/default-avatar.png';
        }
      } else {
        formatted.participantsString = chat.participants?.map(p => p.username || 'User').join(', ') || 'Chat';
        formatted.displayAvatarUrl = 'assets/images/default-avatar.png';
      }
    }
    return formatted;
  }

  getUserAvatar(chat: any): string {
    return chat.displayAvatarUrl || (chat.isGroupChat ? 'assets/images/default-group-avatar.png' : 'assets/images/default-avatar.png');
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
    const status = this.participantStatuses.get(userId) || false;
    return status;
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
    
    if (chat.isSelfChat) {
      return this.currentUserId; // For saved messages, it's the current user
    }
    
    const otherParticipant = chat.participants.find(
      (p: any) => p._id !== this.currentUserId
    );
    
    return otherParticipant ? otherParticipant._id : null;
  }
  
  sortChatsInPlace(): void {
    this.chats.sort((a, b) => {
      const aIsSavedMessages = a.isSelfChat || a.participantsString === 'Saved Messages';
      const bIsSavedMessages = b.isSelfChat || b.participantsString === 'Saved Messages';
      
      if (aIsSavedMessages && !bIsSavedMessages) return -1;
      if (!aIsSavedMessages && bIsSavedMessages) return 1;
      
      if (aIsSavedMessages === bIsSavedMessages) {
        const timeA = new Date(a.lastMessage?.timestamp || a.updatedAt || 0).getTime();
        const timeB = new Date(b.lastMessage?.timestamp || b.updatedAt || 0).getTime();
        return timeB - timeA;
      }
      
      return 0;
    });
  }

  private handleNewChatCreated(newChat: Chat): void {
    const isSelfChat = newChat.participants.length === 1 &&
                      newChat.participants[0]?._id === this.currentUserId;

    const existingChatIndex = this.chats.findIndex(c => c._id === newChat._id);

    if (existingChatIndex !== -1) {
      console.log(`CHAT-LIST (handleNewChatCreated): Chat ${newChat._id} already exists. Updating it.`);
      
      const targetChat = this.chats[existingChatIndex];
      targetChat.lastMessage = newChat.lastMessage;
      targetChat.updatedAt = newChat.updatedAt;
      
      if (isSelfChat && this.savedMessagesChat) {
        targetChat.participantsString = this.savedMessagesChat.participantsString;
        targetChat.displayAvatarUrl = this.savedMessagesChat.displayAvatarUrl;
      }
      
    } else {
      console.log(`CHAT-LIST (handleNewChatCreated): Adding completely new chat ${newChat._id}.`);
      
      const formattedChat = this.formatChatForDisplay(newChat, isSelfChat);
      this.chats.unshift(formattedChat);

      if (isSelfChat) {
        this.savedMessagesChat = formattedChat;
      }
      
      this.loadParticipantProfilesForSingleChat(formattedChat);
    }

    this.sortChatsInPlace();
    this.applyChatFilter();
    this.cdr.detectChanges();
    
  }

  private handleChatUpdate(updatedChatFromServer: Chat): void {
    const id = updatedChatFromServer._id || 'unknown_id';
    const chatIndex = this.chats.findIndex(chat => chat._id === updatedChatFromServer._id);
    if (chatIndex !== -1) {
      const isSelf = this.chats[chatIndex].isSelfChat; 
      console.log(`HANDLE_CHAT_UPDATE (${id}): Existing chat isSelfChat: ${isSelf}. Re-formatting.`);
      this.chats[chatIndex] = {
        ...this.formatChatForDisplay(updatedChatFromServer, isSelf),
        isSelfChat: isSelf,
        displayAvatarUrl: isSelf ? this.chats[chatIndex].displayAvatarUrl : undefined 
      };
      console.log(`HANDLE_CHAT_UPDATE (${id}): Chat in list AFTER update:`, JSON.parse(JSON.stringify(this.chats[chatIndex])));
      if (!isSelf) {
        const formatted = this.formatChatForDisplay(updatedChatFromServer, false);
        this.chats[chatIndex].displayAvatarUrl = formatted.displayAvatarUrl;
        this.chats[chatIndex].participantsString = formatted.participantsString;
      }

      this.sortChatsInPlace();
      this.applyChatFilter();
      this.cdr.detectChanges();
    } else {
      console.warn(`Received 'chat_updated' for a chat not in the list: ${updatedChatFromServer._id}. Adding it.`);
      this.handleNewChatCreated(updatedChatFromServer);
    }
  }

  handleNewMessage(message: Message): void {
    const chatIndex = this.chats.findIndex(chat => chat._id === message.chatId);
    
    if (chatIndex !== -1) {
      const targetChat = this.chats[chatIndex];

      targetChat.lastMessage = message;

      const isSelfChat = targetChat.isSelfChat || 
                        (targetChat.participants.length === 1 && targetChat.participants[0]._id === this.currentUserId);

      if (isSelfChat && this.savedMessagesChat) {
        targetChat.participantsString = this.savedMessagesChat.participantsString;
        targetChat.displayAvatarUrl = this.savedMessagesChat.displayAvatarUrl;
      }
      
      this.sortChatsInPlace();
      this.applyChatFilter();
      this.cdr.detectChanges();

    } else {
      console.warn(`Chat for new message (ID: ${message.chatId}) not found. Reloading all chats.`);
      this.loadInitialChats(); 
    }
  }

  loadParticipantProfiles() {
    const participantIds = new Set<string>();
    
    this.chats.forEach(chat => {
      if (!chat.isSelfChat) {
        chat.participants.forEach((participant: any) => {
          if (participant._id !== this.currentUserId && !this.userProfilesCache.has(participant._id)) {
            participantIds.add(participant._id);
          }
        });
      }
    });
    
    // Also load current user's profile for Saved Messages
    if (this.currentUserId && !this.userProfilesCache.has(this.currentUserId)) {
      participantIds.add(this.currentUserId);
    }
    
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

  private loadParticipantProfilesForSingleChat(chat: any): void {
    if (!chat || !chat.participants) return;
    
    if (chat.isSelfChat) {
      // For Saved Messages, load current user's profile
      if (this.currentUserId && !this.userProfilesCache.has(this.currentUserId)) {
        this.loadUserProfile(this.currentUserId);
      }
    } else {
      chat.participants.forEach((participant: any) => {
        if (participant._id !== this.currentUserId && !this.userProfilesCache.has(participant._id)) {
          this.loadUserProfile(participant._id);
        }
      });
    }
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
      const baseUrl = this.chatService.getApiUrl(); 
      const searchUrl = `${baseUrl}/chats/search?query=${query}`;
      this.http.get<User[]>(searchUrl, {
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
            this.loadInitialChats(); // Changed from loadChats()
          }
        },
        error: (error) => {
          this.loading = false;
          console.error('Failed to create or get chat with user:', user.username, error);
        }
      });
  }
  
  onChatClick(chatId: string) {
    this.chatSelected.emit(chatId);
    this.router.navigate([`/chats/${chatId}`]);
  }

  getChatDisplayName(chat: any): string {
    if (!chat) return 'Chat';
    return chat.participantsString || 'Chat';
  }
  
  async confirmAndDeleteChat(chatToDelete: Chat, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    event.preventDefault();

    if (!chatToDelete._id) {
      console.error('Cannot delete chat: chat ID is missing.');
      return;
    }

    // Don't allow deleting Saved Messages
    if (chatToDelete.isSelfChat) {
      this.ToastService.showToast('You cannot delete your Saved Messages chat.', 3000, 'error');
      return;
    }

    const chatName = this.getChatDisplayName(chatToDelete);
    
    const confirmed = await this.confirmationService.confirm({
      title: 'Confirm Removal',
      message: `Are you sure you want to delete the chat with "${chatName}"? This action is irreversible and will delete all messages for all participants.`,
      confirmText: 'Remove',
      cancelText: 'Cancel'
    });

    if (confirmed) {
      this.loading = true;
      this.chatService.deleteChat(chatToDelete._id).subscribe({
        next: (response) => {
          console.log(`Chat ${chatToDelete._id} deletion request sent successfully. Response:`, response);
          this.loading = false;
          
          // Manually remove the chat from the lists to prevent waiting for the server event
          this.removeChatFromList(chatToDelete._id);
        },
        error: (err) => {
          console.error(`Failed to delete chat ${chatToDelete._id}:`, err);
          this.ToastService.showToast(`Error deleting chat: ${err.error?.message || err.message || 'Unknown error'}`, 3000, 'error');
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
      
      // If this was the Saved Messages chat, clear the reference
      if (removedChat.isSelfChat) {
        this.savedMessagesChat = null;
      }
      
      this.applyChatFilter();
      this.cdr.detectChanges();
    }
  }

  private addNewChatToList(newChat: Chat): void {
    const existingChatIndex = this.chats.findIndex(c => c._id === newChat._id);
    if (existingChatIndex === -1) {
      console.log(`CHAT-LIST: Adding new chat to list:`, newChat);
      
      const isSelfChat = newChat.participants.length === 1 && 
                         newChat.participants[0]._id === this.currentUserId;
      const formattedChat = this.formatChatForDisplay(newChat, isSelfChat);
      
      this.chats.unshift(formattedChat);
      
      if (isSelfChat) {
        this.savedMessagesChat = formattedChat;
      }
      
      this.sortChatsInPlace();
      this.applyChatFilter();
      this.loadParticipantProfilesForSingleChat(formattedChat);
      this.cdr.detectChanges();
    } else {
      console.log(`CHAT-LIST: New chat event for existing chat ${newChat._id}, possibly updating.`, newChat);
      const isSelf = this.chats[existingChatIndex].isSelfChat;
      this.chats[existingChatIndex] = { 
        ...this.formatChatForDisplay(newChat, isSelf),
        isSelfChat: isSelf
      };
      this.cdr.detectChanges();
    }
  }

  getUnreadCountForChat(chat: Chat): number {
    if (!chat.unreadCounts || !this.currentUserId) {
      return 0;
    }
    const unreadEntry = chat.unreadCounts.find((uc: UnreadCount) => {
      if (typeof uc.userId === 'string') {
        return uc.userId === this.currentUserId;
      } else {
        return (uc.userId as any)?._id === this.currentUserId;
      }
    });
    return unreadEntry ? unreadEntry.count : 0;
  }

  openCreateGroupDialog(): void {
    this.isCreateGroupDialogOpen = true;
  }

  closeCreateGroupDialog(): void {
    this.isCreateGroupDialogOpen = false;
  }

  onGroupCreated(newGroup: Chat): void {
    console.log('Group successfully created from dialog, new chat object:', newGroup);
    this.closeCreateGroupDialog();
  }


  getIsUserGroupAdmin(chat: any): boolean {
    if (!chat.isGroupChat || !chat.admin || !this.currentUserId) {
      return false;
    }

    let adminId: string | null = null;
    const adminField = chat.admin;

    if (Array.isArray(adminField) && adminField.length > 0) {
      const firstAdmin = adminField[0];
      adminId = typeof firstAdmin === 'string' ? 
        firstAdmin : 
        (firstAdmin && typeof firstAdmin === 'object' ? firstAdmin._id : null);
    } 
    else if (typeof adminField === 'string') {
      adminId = adminField;
    } 
    else if (adminField && typeof adminField === 'object') {
      adminId = (adminField as any)._id;
    }

    return !!adminId && adminId.toString() === this.currentUserId.toString();
  }

  private handleMessageDeletedEvent(event: { messageId: string; chatId: string; updatedChat: Chat }): void {
    console.log('CHAT-LIST: Handling message_deleted event:', event);
    
    const chatIndex = this.chats.findIndex(c => c._id === event.chatId);
    if (chatIndex !== -1) {
      if (event.updatedChat) {
        console.log(`CHAT-LIST: Updating chat ${event.chatId} with updatedChat from deletion event. New lastMessage:`, event.updatedChat.lastMessage);


        const isSelf = this.chats[chatIndex].isSelfChat; 
        
        const newlyUpdatedChatFromServer = this.formatChatForDisplay(event.updatedChat, isSelf);

        this.chats[chatIndex] = {
          ...this.chats[chatIndex], 
          ...newlyUpdatedChatFromServer,
          lastMessage: newlyUpdatedChatFromServer.lastMessage, 
          updatedAt: newlyUpdatedChatFromServer.updatedAt 
        };
        
        if (!newlyUpdatedChatFromServer.displayAvatarUrl && this.chats[chatIndex].displayAvatarUrl) {
          newlyUpdatedChatFromServer.displayAvatarUrl = this.chats[chatIndex].displayAvatarUrl;
        }


        console.log('CHAT-LIST: Chat after update in local list:', JSON.parse(JSON.stringify(this.chats[chatIndex])));

        this.sortChatsInPlace();
        this.applyChatFilter();
        this.cdr.detectChanges();
      } else {
        console.warn(`CHAT-LIST: message_deleted event for chat ${event.chatId} did not contain updatedChat. Reloading all chats as a fallback.`);
        this.loadInitialChats(); 
      }
    } else {
      console.warn(`CHAT-LIST: Received message_deleted event for a chat not in the list: ${event.chatId}`);
    }
  }


  isMyLastMessage(chat: any): boolean {
      if (!chat || !chat.lastMessage || !chat.lastMessage.senderId || !this.currentUserId) {
          return false;
      }

      if (chat.isSelfChat) {
          return true;
      }

      const senderId = (typeof chat.lastMessage.senderId === 'object' && chat.lastMessage.senderId !== null) 
                      ? chat.lastMessage.senderId._id 
                      : chat.lastMessage.senderId;
      return senderId === this.currentUserId;
  }
}