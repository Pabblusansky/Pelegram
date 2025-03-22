import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ProfileService } from '../profile.service';
import { UserProfile } from '../profile.model';
import { ChatService } from '../../chat/chat.service';
import { Observable } from 'rxjs';
import { Location } from '@angular/common';
@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.scss'],
  standalone: true,
  imports: [CommonModule]
})
export class UserProfileComponent implements OnInit {
  userId: string | null = null;
  profile: UserProfile | null = null;
  isLoading = true;
  error: string | null = null;
  userStatus$: Observable<string> | null = null;
  isOnline$: Observable<boolean> | null = null;
  
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private profileService: ProfileService,
    private chatService: ChatService,
    private location: Location
  ) {}
  
  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.userId = params.get('userId');
      if (this.userId) {
        this.loadUserProfile();
        this.userStatus$ = this.chatService.getUserStatusText(this.userId);
        this.isOnline$ = this.chatService.isUserOnline(this.userId);
      }
    });
  }
  
  loadUserProfile(): void {
    if (!this.userId) {
      this.error = 'User ID is missing';
      this.isLoading = false;
      return;
    }
    
    this.isLoading = true;
    this.error = null;
    
    this.profileService.getUserProfile(this.userId).subscribe({
      next: (profile) => {
        this.profile = profile;
        this.isLoading = false;
      },
      error: (err) => {
        this.error = this.getErrorMessage(err);
        this.isLoading = false;
      }
    });
  }
  
  private getErrorMessage(error: any): string {
    if (typeof error === 'string') {
      return error;
    }
    
    if (error instanceof Error) {
      return error.message;
    }
    
    if (error.error && error.error.message) {
      return error.error.message;
    }
    
    if (error.message) {
      return error.message;
    }
    
    return 'Failed to load user profile';
  }
  
  startChat(): void {
    if (!this.userId) return;
    
    this.isLoading = true;
    
    this.chatService.createOrGetDirectChat(this.userId)
      .subscribe({
        next: (chat) => {
          this.isLoading = false;
          this.router.navigate(['/chats', chat._id]);
        },
        error: (err) => {
          this.error = err.message || 'Failed to start chat';
          this.isLoading = false;
        }
      });
  }

  goBack(): void {
    this.location.back();
  }
}