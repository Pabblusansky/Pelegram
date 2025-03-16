import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { ProfileService } from './profile.service';
import { UserProfile, ProfileUpdateDto } from './profile.model';
import { ProfileEditComponent } from "./profile-edit/profile-edit.component";

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
  themeService: any;
  notificationService: any;
  soundService: any;
  
  get displayName(): string {
    if (!this.profile) return 'User';
    return this.profile.displayName || this.profile.username;
  }
  
  get avatarUrl(): string {
    if (!this.profile || !this.profile.avatar) {
      return 'assets/default-avatar.png';
    }
    return this.profile.avatar;
  }
  
  onProfileClick(): void {
    this.profileClick.emit();
  }
  
  get username(): string {
    return this.profile?.username || '';
  }
  
  constructor(private profileService: ProfileService) {}

  ngOnInit(): void {
    this.loadProfile();
  }

  loadProfile(): void {
    this.isLoading = true;
    this.error = null;
    
    this.profileService.getMyProfile().subscribe({
      next: (profile: UserProfile) => {
        this.profile = profile;
        this.isLoading = false;
      },
      error: (err: any) => {
        this.error = this.handleError(err, 'Failed to load profile');
        this.isLoading = false;
      }
    });
  }

  private applyProfileSettings(profile: UserProfile): void {
    if (profile.settings) {
      if (profile.settings.theme) {
        this.themeService.setTheme(profile.settings.theme);
      }
      
      this.notificationService.setNotificationsEnabled(
        profile.settings.notifications !== false
      );
      
      // Применяем настройки звука
      this.soundService.setSoundEnabled(
        profile.settings.soundEnabled !== false
      );
    }
  }

  startEditing(): void {
    this.isEditing = true;
  }

  cancelEditing(): void {
    this.isEditing = false;
    this.loadProfile();
  }

  saveProfile(formValue: any): void {
    if (!this.profile) return;
    
    const updateData: ProfileUpdateDto = {
      displayName: formValue.displayName || undefined,
      bio: formValue.bio || undefined,
      phoneNumber: formValue.phoneNumber || undefined,
      settings: {
        theme: formValue.theme || this.profile.settings.theme,
        notifications: formValue.notifications !== undefined ? 
          formValue.notifications : this.profile.settings.notifications,
        soundEnabled: formValue.soundEnabled !== undefined ? 
          formValue.soundEnabled : this.profile.settings.soundEnabled
      }
    };
    
    this.isLoading = true;
    
    this.profileService.updateProfile(updateData).subscribe({
      next: (profile: UserProfile) => {
        this.profile = profile;
        this.isLoading = false;
        this.isEditing = false;
      },
      error: (err: any) => {
        this.error = this.handleError(err, 'Failed to update profile');
        this.isLoading = false;
      }
    });
  }

uploadAvatar(fileOrEvent: File | Event): void {
    let file: File | null = null;
    
    if (fileOrEvent instanceof Event) {
      const target = fileOrEvent.target as HTMLInputElement;
      if (target && target.files && target.files.length > 0) {
        file = target.files[0];
      }
    } else if (fileOrEvent instanceof File) {
      file = fileOrEvent;
    }
    
    if (!file) {
      return;
    }
    
    this.isLoading = true;
    
    this.profileService.uploadAvatar(file).subscribe({
      next: (response: { avatar: string }) => {
        if (this.profile) {
          this.profile.avatar = response.avatar;
        }
        this.isLoading = false;
      },
      error: (err: any) => {
        this.error = this.handleError ? 
          this.handleError(err, 'Failed to upload avatar') : 
          (err.message || 'Failed to upload avatar');
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
}