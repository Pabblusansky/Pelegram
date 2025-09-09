import { Component, Input, OnDestroy, OnInit, ChangeDetectorRef, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserProfile } from '../profile.model';
import { RouterModule } from '@angular/router';
import { ProfileService } from '../profile.service';
import { Subject } from 'rxjs';
import { takeUntil, distinctUntilChanged } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-profile-card',
  templateUrl: './profile-card.component.html',
  styleUrls: ['./profile-card.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule]
})
export class ProfileCardComponent implements OnInit, OnChanges, OnDestroy {
  @Input() profile: UserProfile | null = null;
  @Input() isCurrentUser: boolean = true;
  @Input() compact: boolean = false;
  
  public displayableProfile: UserProfile | null = null;
  private destroy$ = new Subject<void>();

  private readonly defaultAvatarPath = 'assets/images/default-avatar.png';
  private apiUrl = environment.apiUrl;

  constructor(
    private profileService: ProfileService,
    private cdr: ChangeDetectorRef
  ) {} 

  ngOnInit(): void {
    if (this.isCurrentUser) {
      this.profileService.currentProfile$
        .pipe(
          takeUntil(this.destroy$),
          distinctUntilChanged((prev: UserProfile | null, curr: UserProfile | null) => {
            if (!prev && !curr) return true;
            if (!prev || !curr) return false;
            return prev._id === curr._id && 
                   prev.avatar === curr.avatar && 
                   prev.displayName === curr.displayName && 
                   prev.username === curr.username;
          })
        )
        .subscribe(profileFromService => {
          if (profileFromService) {
            this.displayableProfile = { ...profileFromService };
          } else {
            this.displayableProfile = null;
          }
          this.cdr.detectChanges();
        });
    } else {
      this.displayableProfile = this.profile;
      this.cdr.detectChanges();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['profile'] && !this.isCurrentUser) {
      this.displayableProfile = this.profile;
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get displayName(): string {
    if (!this.displayableProfile) return 'User';
    return this.displayableProfile.displayName || this.displayableProfile.username;
  }
  
  get avatarUrl(): string {
    const avatarPath = this.displayableProfile?.avatar;

    if (avatarPath) {
      if (avatarPath.startsWith('http://') || 
          avatarPath.startsWith('https://') || 
          avatarPath.startsWith('data:')) {
        return avatarPath;
      }
      if (avatarPath.startsWith('/uploads')) {
        return `${this.apiUrl}${avatarPath}`;
      }
      return avatarPath;
    }
    
    return this.defaultAvatarPath;
  }
  
  handleAvatarError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement.src !== this.defaultAvatarPath) {
      imgElement.src = this.defaultAvatarPath;
    }
    imgElement.onerror = null;
  }
}