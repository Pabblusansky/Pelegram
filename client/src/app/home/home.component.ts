import { Component, OnInit, OnDestroy } from '@angular/core';
import { ChatListComponent } from "../chat/chat-list/chat-list.component";
import { ChatRoomComponent } from "../chat/chat-room/chat-room.component";
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ProfileCardComponent } from "../profile/profile-card/profile-card.component";
import { ProfileService } from "../profile/profile.service";
import { UserProfile } from "../profile/profile.model";
import { Subject, filter, takeUntil } from 'rxjs';
import { ChatService } from '../chat/chat.service';
import { FaviconService } from '../services/favicon/favicon.service';
import { LoggerService } from '../services/logger.service';

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
  private destroy$ = new Subject<void>();

  constructor(
    private router: Router, 
    private route: ActivatedRoute,
    private profileService: ProfileService,
    private chatService: ChatService,
    private faviconService: FaviconService,
    private logger: LoggerService
  ) {}

  ngOnInit(): void {
    this.loadUserProfile();
    
    this.route.paramMap
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        this.selectedChatId = params.get('chatId') || null;
      });

    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event: NavigationEnd) => {
        this.isProfileRoute =
          event.url.includes('/profile') ||
          event.url.includes('/user/');
      });

    this.isProfileRoute =
      this.router.url.includes('/profile') ||
      this.router.url.includes('/user/');

    this.chatService.totalUnreadCount$
      .pipe(takeUntil(this.destroy$))
      .subscribe(unreadCount => {
        if (unreadCount > 0) {
          this.faviconService.setNotificationBadge(unreadCount);
        } else {
          this.faviconService.resetFavicon();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.faviconService.resetFavicon();
  }

  loadUserProfile(): void {
    this.profileService.getMyProfile()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (profile) => {
          this.userProfile = profile;
        },
        error: (error) => {
          this.logger.error('Error loading user profile:', error);
        }
      });
  }

  onChatSelect(chatId: string): void {
    this.selectedChatId = chatId;
    this.router.navigate([`/chats/${chatId}`]);
  }
  
  navigateToProfile(): void {
    this.router.navigate(['/profile']);
  }
}