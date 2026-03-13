import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfileService } from './profile.service';
import { UserProfile, ProfileUpdateDto } from './profile.model';
import { ProfileEditComponent } from "./profile-edit/profile-edit.component";
import { ThemeService } from '../services/theme.service';
import { NotificationService } from '../services/notifications.service';
import { SoundService } from '../services/sound.service';
import { AuthService } from '../auth/auth.service';
import { LoggerService } from '../services/logger.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ProfileEditComponent]
})
export class ProfileComponent implements OnInit {
  isLoading = true;
  error: string | null = null;
  isEditing = false;
  @Input() profile: UserProfile | null = null;
  @Input() isCurrentUser: boolean = true;
  @Input() compact: boolean = false;
  @Output() profileClick = new EventEmitter<void>();
  uploadProgress = 0;
  
  private apiUrl = environment.apiUrl;
  
  get displayName(): string {
    if (!this.profile) return 'User';
    return this.profile.displayName || this.profile.username;
  }
  
  get avatarUrl(): string {
  if (!this.profile || !this.profile.avatar) {
    return 'assets/images/default-avatar.png';
  }
  
  if (this.profile.avatar.startsWith('/uploads')) {
    return `${this.apiUrl}${this.profile.avatar}`;
  }


  return this.profile.avatar;
  }
  
  get username(): string {
    return this.profile?.username || '';
  }
  
  get currentAppliedTheme(): string {
    return this.themeService.getAppliedTheme();
  }
  
  get themeDisplayName(): string {
    if (!this.profile || !this.profile.settings) return 'System';
    
    switch (this.profile.settings.theme) {
      case 'light': return 'Light';
      case 'dark': return 'Dark';
      case 'system': 
        const applied = this.currentAppliedTheme;
        return `System (${applied === 'dark' ? 'Dark' : 'Light'})`;
      default: return this.profile.settings.theme || 'System';
    }
  }
  
  constructor(
    private profileService: ProfileService,
    public themeService: ThemeService,
    private notificationService: NotificationService,
    private soundService: SoundService,
    private authService: AuthService,
    private logger: LoggerService
  ) {}

  ngOnInit(): void {
    if (!this.profile) {
      this.loadProfile();
    }
    this.profileService.avatarUploadProgress$.subscribe(progress => {
      this.uploadProgress = progress;
    });
  }
  
  onProfileClick(): void {
    this.profileClick.emit();
  }

  handleImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    this.logger.error('Failed to load image: ' + img.src);
    
    // Set default avatar image if the current one failed to load
    if (!img.src.includes('default-avatar.png')) {
      img.src = 'assets/images/default-avatar.png';
    }
  }
  
  loadProfile(): void {
    this.isLoading = true;
    this.error = null;
    
    this.profileService.getMyProfile().subscribe({
      next: (profile: UserProfile) => {
        this.profile = profile;
        this.isLoading = false;
        
        this.applyProfileSettings(profile);
        
      },
      error: (err: unknown) => {
        this.error = this.handleError(err, 'Failed to load profile');
        this.isLoading = false;
      }
    });
  }

  private applyProfileSettings(profile: UserProfile): void {
    if (!profile.settings) {
      return;
    }

    if (profile.settings.theme) {
      this.themeService.setTheme(profile.settings.theme);
    }

    const notificationsEnabled = profile.settings.notifications !== false;
    this.notificationService.setNotificationsEnabled(notificationsEnabled);

    const soundEnabled = profile.settings.soundEnabled !== false;
    this.soundService.setSoundEnabled(soundEnabled);
  }

  startEditing(): void {
    this.isEditing = true;
  }

  cancelEditing(): void {
    this.isEditing = false;
        this.loadProfile();
  }

  saveProfile(updateData: ProfileUpdateDto): void {
    if (!this.profile) return;
    
    this.isLoading = true;
    
    this.profileService.updateProfile(updateData).subscribe({
      next: (profile: UserProfile) => {
        this.profile = profile;
        this.isLoading = false;
        this.isEditing = false;
        
        this.applyProfileSettings(profile);
        
      },
      error: (err: unknown) => {
        this.error = this.handleError(err, 'Failed to update profile');
        this.isLoading = false;
      }
    });
  }

  onLogout(): void {
    this.authService.logout();
  }
  uploadAvatar(fileOrEvent: File | Event): void {
    let file: File | null = null;
    
    if (fileOrEvent instanceof Event) {
      const target = fileOrEvent.target as HTMLInputElement;
      if (target && target.files && target.files.length > 0) {
        file = target.files[0];
      } else {
        this.logger.error('No file selected or file input is invalid');
        return;
      }
    } else if (fileOrEvent instanceof File) {
      file = fileOrEvent;
    } else {
      this.logger.error('Invalid input type for uploadAvatar:', fileOrEvent);
      return;
    }
    
    if (!file) {
      this.logger.error('No valid file to upload');
      return;
    }
    
    if (!file.type.startsWith('image/')) {
      this.error = 'Only image files are allowed';
      this.logger.error(this.error);
      return;
    }
    
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      this.error = `File is too large. Maximum size is ${maxSize / (1024 * 1024)}MB`;
      this.logger.error(this.error);
      return;
    }
    
    this.isLoading = true;
    this.error = null;
    
    this.profileService.uploadAvatar(file).subscribe({
      next: (response: { avatar: string; user: UserProfile }) => {
        if (this.profile) {
          this.profile.avatar = response.avatar;

          if (response.user) {
            this.profile = response.user;
          }
        }
        
        this.isLoading = false;
      },
      error: (err: unknown) => {
        this.error = this.handleError(err, 'Failed to upload avatar');
        this.logger.error('Avatar upload error:', this.error);
        this.isLoading = false;
      }
    });
  }

  private handleError(error: unknown, defaultMessage: string): string {
    this.logger.error('Error:', error);

    if (typeof error === 'string') {
      return error;
    }

    if (error instanceof Error) {
      return error.message;
    }

    if (error && typeof error === 'object') {
      const err = error as Record<string, unknown>;
      if (err['error'] && typeof err['error'] === 'object' && (err['error'] as Record<string, unknown>)['message']) {
        return String((err['error'] as Record<string, unknown>)['message']);
      }
      if (err['message'] && typeof err['message'] === 'string') {
        return err['message'];
      }
    }

    return defaultMessage;
  }

  handleProfileUpdateFromEdit(updatedProfile: UserProfile): void {
    this.profile = updatedProfile;
    this.isEditing = false;
  }
}