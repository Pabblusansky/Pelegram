import { Component, OnInit, OnDestroy } from '@angular/core';
import { ChatListComponent } from "../chat/chat-list/chat-list.component";
import { ChatRoomComponent } from "../chat/chat-room/chat-room.component";
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ProfileCardComponent } from "../profile/profile-card/profile-card.component";
import { ProfileService } from "../profile/profile.service";
import { UserProfile } from "../profile/profile.model";
import { Subscription, filter } from 'rxjs';
import { ChatService } from '../chat/chat.service';
import { FaviconService } from '../services/favicon/favicon.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [
    ChatListComponent, 
    ChatRoomComponent, 
    CommonModule, 
    RouterModule, 
    ProfileCardComponent
  ],
})
export class HomeComponent implements OnInit, OnDestroy {
  selectedChatId: string | null = null;
  isProfileRoute: boolean = false;
  userProfile: UserProfile | null = null;
  
  private routerSubscription: Subscription | null = null;
  private profileSubscription: Subscription | null = null;
  private unreadFaviconSubscription: Subscription | null = null;

  constructor(
    private router: Router, 
    private route: ActivatedRoute,
    private profileService: ProfileService,
    private chatService: ChatService,
    private faviconService: FaviconService
  ) {}

  ngOnInit(): void {
    this.loadUserProfile();
    
    this.route.paramMap.subscribe((params) => {
      this.selectedChatId = params.get('chatId') || null;
    });
    
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.isProfileRoute = 
          event.url.includes('/profile') || 
          event.url.includes('/user/');
        
        // console.log('Current route:', event.url, 'isProfileRoute:', this.isProfileRoute);
      });
    
    this.isProfileRoute = 
      this.router.url.includes('/profile') || 
      this.router.url.includes('/user/');
      this.unreadFaviconSubscription = this.chatService.totalUnreadCount$
        .subscribe(unreadCount => {
          // console.log('HOME_COMPONENT: Favicon update - TotalUnreadCount:', unreadCount);
          if (unreadCount > 0) {
            this.faviconService.setNotificationBadge(unreadCount);
          } else {
            this.faviconService.resetFavicon();
          }
      });
  }

  ngOnDestroy(): void {
    this.routerSubscription?.unsubscribe();
    this.profileSubscription?.unsubscribe();
    this.unreadFaviconSubscription?.unsubscribe();

    this.faviconService.resetFavicon();
    console.log('HOME_COMPONENT: ngOnDestroy, favicon reset.');
  }

  loadUserProfile(): void {
    this.profileSubscription = this.profileService.getMyProfile()
      .subscribe({
        next: (profile) => {
          this.userProfile = profile;
          console.log('User profile loaded:', profile);
        },
        error: (error) => {
          console.error('Error loading user profile:', error);
        }
      });
  }

  onChatSelect(chatId: string): void {
    console.log('Chat selected:', chatId);
    this.selectedChatId = chatId;
    this.router.navigate([`/chats/${chatId}`]);
  }
  
  navigateToProfile(): void {
    this.router.navigate(['/profile']);
  }
}