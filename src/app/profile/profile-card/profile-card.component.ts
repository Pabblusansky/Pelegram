import { Component, Input } from '@angular/core';
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
export class ProfileCardComponent {
  @Input() profile: UserProfile | null = null;
  @Input() isCurrentUser: boolean = true;
  @Input() compact: boolean = false;
  
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
}