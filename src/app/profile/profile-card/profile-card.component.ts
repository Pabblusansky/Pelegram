import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserProfile } from '../profile.model';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-profile-card',
  templateUrl: './profile-card.component.html',
  styleUrls: ['./profile-card.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule]
})
export class ProfileCardComponent implements OnInit {
  @Input() profile: UserProfile | null = null;
  @Input() isCurrentUser: boolean = true;
  @Input() compact: boolean = false;
  
  private readonly defaultAvatarPath = 'assets/images/default-avatar.png';
  avatarLoaded = false;
  
  ngOnInit(): void {
    if (this.profile?.avatar) {
      const img = new Image();
      img.onload = () => {
        this.avatarLoaded = true;
      };
      img.src = this.avatarUrl;
    }
  }
  
  get displayName(): string {
    if (!this.profile) return 'User';
    return this.profile.displayName || this.profile.username;
  }
  
  get avatarUrl(): string {
    if (!this.profile || !this.profile.avatar) {
      return this.defaultAvatarPath;
    }
    
    if (this.profile.avatar.startsWith('http://') || 
        this.profile.avatar.startsWith('https://') || 
        this.profile.avatar.startsWith('data:')) {
      return this.profile.avatar;
    }
    
    if (this.profile.avatar.startsWith('/uploads')) {
      return `http://localhost:3000${this.profile.avatar}`;
    }
    
    return this.profile.avatar;
  }
  
  handleAvatarError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    console.error(`Failed to load image: ${imgElement.src}`);
    
    if (!imgElement.src.includes('default-avatar.png')) {
      imgElement.src = this.defaultAvatarPath;
    } else {
      this.avatarLoaded = false;
    }
    
    imgElement.onerror = null;
  }
  
  onAvatarLoad(): void {
    this.avatarLoaded = true;
  }
  
  getInitials(): string {
    if (!this.profile) return '?';
    
    const name = this.profile.displayName || this.profile.username || '';
    if (!name) return '?';
    
    return name.charAt(0).toUpperCase();
  }
}