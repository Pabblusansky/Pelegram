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
    private authService: AuthService
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
    console.error(`Failed to load image: ${img.src}`);
    
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
        
        console.log('Profile loaded with settings:', profile.settings);
      },
      error: (err: any) => {
        this.error = this.handleError(err, 'Failed to load profile');
        this.isLoading = false;
      }
    });
  }

  private applyProfileSettings(profile: UserProfile): void {
    if (!profile.settings) {
      console.log('No settings in profile, using defaults');
      return;
    }
    
    console.log('Applying profile settings:', profile.settings);
    
    if (profile.settings.theme) {
      console.log('Setting theme from profile:', profile.settings.theme);
      this.themeService.setTheme(profile.settings.theme);
    }
    
    const notificationsEnabled = profile.settings.notifications !== false;
    console.log('Setting notifications to:', notificationsEnabled);
    this.notificationService.setNotificationsEnabled(notificationsEnabled);
    
    const soundEnabled = profile.settings.soundEnabled !== false;
    console.log('Setting sound to:', soundEnabled);
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
    
    console.log('Saving profile with settings:', updateData.settings);
    
    this.isLoading = true;
    
    this.profileService.updateProfile(updateData).subscribe({
      next: (profile: UserProfile) => {
        this.profile = profile;
        this.isLoading = false;
        this.isEditing = false;
        
        this.applyProfileSettings(profile);
        
        console.log('Profile updated successfully with settings:', profile.settings);
      },
      error: (err: any) => {
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
        console.log('File selected from event:', file.name, file.type, file.size);
      } else {
        console.error('No file selected or file input is invalid');
        return;
      }
    } else if (fileOrEvent instanceof File) {
      file = fileOrEvent;
      console.log('File provided directly:', file.name, file.type, file.size);
    } else {
      console.error('Invalid input type for uploadAvatar:', fileOrEvent);
      return;
    }
    
    if (!file) {
      console.error('No valid file to upload');
      return;
    }
    
    if (!file.type.startsWith('image/')) {
      this.error = 'Only image files are allowed';
      console.error(this.error);
      return;
    }
    
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      this.error = `File is too large. Maximum size is ${maxSize / (1024 * 1024)}MB`;
      console.error(this.error);
      return;
    }
    
    this.isLoading = true;
    this.error = null;
    
    this.profileService.uploadAvatar(file).subscribe({
      next: (response: { avatar: string; user: UserProfile }) => {
        console.log('Avatar upload successful:', response);
        
        if (this.profile) {
          this.profile.avatar = response.avatar;
          
          console.log('Full avatar URL:', this.avatarUrl);

          if (response.user) {
            this.profile = response.user;
          }
        }
        
        this.isLoading = false;
      },
      error: (err: any) => {
        this.error = this.handleError(err, 'Failed to upload avatar');
        console.error('Avatar upload error:', this.error);
        this.isLoading = false;
      }
    });
  }

  private handleError(error: any, defaultMessage: string): string {
    console.error('Error:', error);
    
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
    
    return defaultMessage;
  }

  handleProfileUpdateFromEdit(updatedProfile: UserProfile): void {
    this.profile = updatedProfile;
    this.isEditing = false;
  }
}