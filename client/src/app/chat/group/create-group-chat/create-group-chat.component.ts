import { Component, ElementRef, EventEmitter, OnInit, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, filter, switchMap, takeUntil, tap, map } from 'rxjs/operators';
import { Subject, timer, of } from 'rxjs';
import { ChatService } from '../../chat.service';
import { User, Chat } from '../../chat.model';
import { HttpClient } from '@angular/common/http';
import { ProfileService } from '../../../profile/profile.service';
import { getFullAvatarUrl } from '../../../utils/url-utils';

@Component({
  selector: 'app-create-group-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule
  ],
  templateUrl: './create-group-chat.component.html',
  styleUrls: ['./create-group-chat.component.scss']
})
export class CreateGroupChatComponent implements OnInit {
  @Output() closeDialog = new EventEmitter<void>();
  @Output() groupCreated = new EventEmitter<Chat>();
  @ViewChild('userSearchInput') userSearchInput!: ElementRef<HTMLInputElement>;

  createGroupForm: FormGroup;
  userSearchQuery = '';
  userSearchResults: User[] = [];
  selectedParticipants: User[] = [];
  isLoadingUsers = false;
  isCreatingGroup = false;
  errorMessage: string | null = null;
  currentUserId: string | null = null;

  public searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();
  private userProfilesCache = new Map<string, { avatar?: string }>();

  constructor(
    private fb: FormBuilder,
    private chatService: ChatService,
    private http: HttpClient,
    private profileService: ProfileService
  ) {
    this.createGroupForm = this.fb.group({
      groupName: ['', [Validators.required, Validators.minLength(3)]]
    });
  }

  ngOnInit(): void {
    this.currentUserId = localStorage.getItem('userId');
    this.setupUserSearch();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupUserSearch(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      filter(query => { 
        if (query.trim().length === 0) {
          this.userSearchResults = [];
          this.isLoadingUsers = false;
          return false;
        }
        return true;
      }),
      tap(() => this.isLoadingUsers = true),
      switchMap(query => {
        const startTime = Date.now();
        return this.http.get<User[]>(`${this.chatService.getApiUrl()}/chats/search?query=${query}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }).pipe(
          switchMap(users => {
            const elapsed = Date.now() - startTime;
            const minDelay = 200;
            
            if (elapsed < minDelay) {
              return timer(minDelay - elapsed).pipe(map(() => users));
            }
            return of(users);
          })
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: users => {
        this.userSearchResults = users.filter(user =>
          user._id !== this.currentUserId &&
          !this.selectedParticipants.some(p => p._id === user._id)
        );
        this.loadAvatarsForUsers(this.userSearchResults);
        this.isLoadingUsers = false;
      },
      error: err => {
        console.error('Error searching users:', err);
        this.errorMessage = 'Failed to search users.';
        this.isLoadingUsers = false;
        this.userSearchResults = [];
      }
    });
  }

  onUserSearchChange(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.userSearchQuery = query;
    this.searchSubject.next(query);
  }

  selectParticipant(user: User): void {
    if (!this.selectedParticipants.some(p => p._id === user._id)) {
      this.selectedParticipants.push(user);
      this.userSearchResults = this.userSearchResults.filter(u => u._id !== user._id);
      this.userSearchQuery = '';

      setTimeout(() => this.userSearchInput.nativeElement.focus(), 0); 
    }
  }

  removeParticipant(userToRemove: User): void {
    this.selectedParticipants = this.selectedParticipants.filter(p => p._id !== userToRemove._id);

  }

  getAvatar(user: User): string {
    const cached = this.userProfilesCache.get(user._id);
    return cached?.avatar ? getFullAvatarUrl(cached.avatar) : 'assets/images/default-avatar.png';
  }

  private loadAvatarsForUsers(users: User[]): void {
    users.forEach(user => {
      if (user._id && !this.userProfilesCache.has(user._id) && !user.avatar) {
        this.profileService.getUserProfile(user._id).subscribe(profile => {
          if (profile.avatar) {
            this.userProfilesCache.set(user._id, { avatar: profile.avatar });
          }
        });
      } else if (user.avatar && !this.userProfilesCache.has(user._id)) {
        this.userProfilesCache.set(user._id, { avatar: user.avatar });
      }
    });
  }


  onSubmit(): void {
    if (this.createGroupForm.invalid) {
      this.errorMessage = 'Group name is required (minimum 3 characters).';
      return;
    }
    if (this.selectedParticipants.length === 0) {
      this.errorMessage = 'Please select at least one participant for the group.';
      return;
    }

    this.isCreatingGroup = true;
    this.errorMessage = null;

    const groupName = this.createGroupForm.value.groupName;
    const participantIds = this.selectedParticipants.map(p => p._id);

    this.chatService.createGroupChat({ name: groupName, participantIds })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (newGroupChat) => {
          this.isCreatingGroup = false;
          console.log('Group created successfully:', newGroupChat);
          this.groupCreated.emit(newGroupChat);
          this.close();
        },
        error: (err: any) => {
          this.isCreatingGroup = false;
          console.error('Error creating group chat:', err);
          this.errorMessage = err.error?.message || err.message || 'Failed to create group. Please try again.';
        }
      });
  }

  close(): void {
    this.closeDialog.emit();
  }

  get showSearchResults(): boolean {
    return !!(this.userSearchQuery && this.userSearchQuery.trim().length > 0);
  }

  get hasSearchQuery(): boolean {
    return !!(this.userSearchQuery && this.userSearchQuery.trim().length > 0);
  }
}