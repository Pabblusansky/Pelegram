import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserProfile, ProfileUpdateDto } from '../profile.model';
import { ThemeService } from '../../services/theme.service';
import { NotificationService } from '../../services/notifications.service';
import { SoundService } from '../../services/sound.service';
import { getFullAvatarUrl } from '../../utils/url-utils';

@Component({
  selector: 'app-profile-edit',
  templateUrl: './profile-edit.component.html',
  styleUrls: ['./profile-edit.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class ProfileEditComponent implements OnInit {
[x: string]: any;
  @Input() profile: UserProfile | null = null;
  @Output() save = new EventEmitter<ProfileUpdateDto>();
  @Output() cancel = new EventEmitter<void>();
  @Output() avatarUpload = new EventEmitter<File>();
  
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
    private soundService: SoundService
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
    
    console.log('Initialized editableProfile:', this.editableProfile);
  }
  
  onSubmit(): void {
    console.log('Submitting profile update with settings:', this.editableProfile.settings);
    this.save.emit(this.editableProfile);
  }
  
  onCancel(): void {
    console.log('Cancelling profile edit');
    this.cancel.emit();
  }
  
  onFileSelected(event: Event): void {
    const element = event.target as HTMLInputElement;
    if (!element || !element.files || element.files.length === 0) {
      console.error('No file selected or file input is invalid');
      return;
    }
    
    const file = element.files[0];
    
    if (!file.type.startsWith('image/')) {
      console.error('Selected file is not an image');
      return;
    }
    
    this.previewAvatar(file);
    
    this.avatarUpload.emit(file);
    
    console.log('Avatar file selected for upload:', file.name, file.type, file.size);
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
    
    console.log('Theme changed to:', theme);
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
    
    console.log('Notifications ' + (enabled ? 'enabled' : 'disabled'));
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
    
    console.log('Sound ' + (enabled ? 'enabled' : 'disabled'));
  }
}