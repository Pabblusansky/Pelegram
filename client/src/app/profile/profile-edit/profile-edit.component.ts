import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserProfile, ProfileUpdateDto } from '../profile.model';
import { ThemeService } from '../../services/theme.service';
import { NotificationService } from '../../services/notifications.service';
import { SoundService } from '../../services/sound.service';
import { getFullAvatarUrl } from '../../utils/url-utils';
import { ProfileService } from '../profile.service';
import { ConfirmationService } from '../../shared/services/confirmation.service';
import { LoggerService } from '../../services/logger.service';

@Component({
  selector: 'app-profile-edit',
  templateUrl: './profile-edit.component.html',
  styleUrls: ['./profile-edit.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class ProfileEditComponent implements OnInit {
  @Input() profile: UserProfile | null = null;
  @Output() save = new EventEmitter<ProfileUpdateDto>();
  @Output() cancel = new EventEmitter<void>();
  @Output() avatarUpload = new EventEmitter<File>();
  @Output() profileUpdated = new EventEmitter<UserProfile>();
  isDeletingAvatar = false;

  editableProfile: ProfileUpdateDto = {
    settings: {
      theme: 'system',
      notifications: true,
      soundEnabled: true
    }
  };
  
  previewAvatarUrl: string | null = null;
  
  constructor(
    private themeService: ThemeService,
    private notificationService: NotificationService,
    private soundService: SoundService,
    private profileService: ProfileService,
    private confirmationService: ConfirmationService,
    private logger: LoggerService
  ) {}
  
  ngOnInit(): void {
    this.initializeEditableProfile();
  }
  
  get displayAvatarUrl(): string {
    if (this.previewAvatarUrl && this.previewAvatarUrl.startsWith('data:')) {
      return this.previewAvatarUrl;
    }
    return getFullAvatarUrl(this.previewAvatarUrl || this.profile?.avatar);
  }
  private initializeEditableProfile(): void {
    if (this.profile) {
      this.editableProfile = {
        displayName: this.profile.displayName || '',
        bio: this.profile.bio || '',
        phoneNumber: this.profile.phoneNumber || '',
        settings: {
          theme: this.profile.settings?.theme || 'system',
          notifications: this.profile.settings?.notifications !== false,
          soundEnabled: this.profile.settings?.soundEnabled !== false
        }
      };
      
      this.previewAvatarUrl = this.profile.avatar || null;
    }
    
  }

  onSubmit(): void {
    // this.save.emit(this.editableProfile);
      this.profileService.updateProfile(this.editableProfile).subscribe({
      next: (updatedUser) => {
        this.profileUpdated.emit(updatedUser);
        this.save.emit(this.editableProfile);
      }, error: (err) => {
        this.logger.error('Error updating profile:', err);
        this.notificationService.showNotification('Profile update failed', {
          body: 'There was an error updating your profile. Please try again later.',
          icon: 'assets/logo.png'
        });
      }
    });
  }
  
  onCancel(): void {
    this.cancel.emit();
  }
  
  onFileSelected(event: Event): void {
    const element = event.target as HTMLInputElement;
    if (!element || !element.files || element.files.length === 0) {
      this.logger.error('No file selected or file input is invalid');
      return;
    }
    
    const file = element.files[0];
    
    if (!file.type.startsWith('image/')) {
      this.logger.error('Selected file is not an image');
      return;
    }
    
    this.previewAvatar(file);
    
    this.avatarUpload.emit(file);
    
  }
  
  previewAvatar(file: File): void {
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      if (e.target?.result && typeof e.target.result === 'string') {
        this.previewAvatarUrl = e.target.result;
      }
    };
    reader.readAsDataURL(file);
  }
  
  onThemeChange(theme: 'light' | 'dark' | 'system'): void {
    this.editableProfile.settings = this.editableProfile.settings || {
      theme: 'system',
      notifications: true,
      soundEnabled: true
    };
    
    this.editableProfile.settings.theme = theme;
    
    this.themeService.setTheme(theme);
    
  }

  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    imgElement.src = 'assets/images/default-avatar.png';
    imgElement.onerror = null;
  }
  onNotificationsChange(enabled: boolean): void {
    this.editableProfile.settings = this.editableProfile.settings || {
      theme: 'system',
      notifications: true,
      soundEnabled: true
    };
    
    this.editableProfile.settings.notifications = enabled;
    
    if (this.notificationService) {
      this.notificationService.setNotificationsEnabled(enabled);
      
      if (enabled) {
        this.notificationService.showNotification('Notifications enabled', {
          body: 'You will now receive notifications from Pelegram',
          icon: 'assets/logo.png'
        });
      }
    }
    
  }
  
  onSoundChange(enabled: boolean): void {
    if (!this.editableProfile.settings) {
      this.editableProfile.settings = {
        theme: 'system',
        notifications: true,
        soundEnabled: true
      };
    }
    
    this.editableProfile.settings.soundEnabled = enabled;
    
    this.soundService.setSoundEnabled(enabled);
    
    if (enabled) {
      this.soundService.playSound('notification');
    }
    
  }

  async onDeleteAvatar(): Promise<void> {
        if (!this.profile || !this.profile.avatar) {
      return;
    }

    const confirmed = await this.confirmationService.confirm({
        title: 'Delete Avatar',
        message: 'Are you sure you want to delete your current avatar? This action cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Cancel'
    });
    
    if (confirmed) {
      this.isDeletingAvatar = true;
      this.profileService.deleteAvatar().subscribe({
        next: (response) => {
          this.isDeletingAvatar = false;
          if (response.success && response.user) {
            if (this.profile) {
              this.profile.avatar = response.user.avatar;
            }
            this.previewAvatarUrl = null;

            if (this.profile) this.initializeEditableProfile();
            this.profileUpdated.emit(response.user);

          } else {
            this.logger.error('Failed to delete avatar:', response.message);
          }
        },
        error: (err) => {
          this.isDeletingAvatar = false;
          this.logger.error('Error deleting avatar:', err);
        }
      });
    }
  }
}