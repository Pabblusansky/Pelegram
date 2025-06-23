import { Component, EventEmitter, Input, OnInit, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chat, User } from '../../../chat.model';
import { ChatService } from '../../../chat.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms'; 
import { ToastService } from '../../../../utils/toast-service';
import { ElementRef, ViewChild } from '@angular/core';

@Component({
  selector: 'app-group-info-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './group-info-modal.component.html',
  styleUrls: ['./group-info-modal.component.scss']
})
export class GroupInfoModalComponent implements OnInit, OnChanges {
  @Input() chatDetails: Chat | null = null;
  @Output() close = new EventEmitter<void>(); 
  @ViewChild('avatarFileInput') avatarFileInput!: ElementRef<HTMLInputElement>;

  isUploadingAvatar: boolean = false;
  isRemovingParticipant: boolean = false;
  isDeletingGroup: boolean = false;
  showAddParticipantsModal: boolean = false;
  searchQuery: string = '';
  searchResults: User[] = [];
  selectedUsers: User[] = [];
  isSearching: boolean = false;

  currentUserId: string | null = null;
  isAdmin: boolean = false;
  isEditingName: boolean = false;
  newGroupName: string = '';
  isSavingName: boolean = false;
  isDeletingAvatar: boolean = false;

  constructor(
    public chatService: ChatService,
    private router: Router,
    private ToastService: ToastService
  ) {}

  ngOnInit(): void {
    this.currentUserId = localStorage.getItem('userId');
    this.updateAdminStatus();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chatDetails'] && this.chatDetails) {
      this.updateAdminStatus();
    }
  }

  private updateAdminStatus(): void {
    if (this.chatDetails && this.chatDetails.admin && this.currentUserId) {
      
      let adminId: string | null = null;
      const adminField = this.chatDetails.admin;
      
      if (Array.isArray(adminField) && adminField.length > 0) {
        const firstAdmin = adminField[0];
        adminId = typeof firstAdmin === 'string' ? 
          firstAdmin : 
          (firstAdmin && typeof firstAdmin === 'object' ? firstAdmin._id : null);
      } 
      else if (typeof adminField === 'string') {
        adminId = adminField;
      } 
      else if (adminField && typeof adminField === 'object') {
        adminId = (adminField as User)._id;
      }
      
      if (this.isEditingName && !this.isAdmin) {
        this.cancelEditName();
      }
      if (adminId) {
        this.isAdmin = adminId.toString() === this.currentUserId.toString();
        console.log('Admin status determined:', {
          adminId,
          currentUserId: this.currentUserId,
          isAdmin: this.isAdmin
        });
      } else {
        this.isAdmin = false;
        console.log('Could not determine admin ID from:', adminField);
      }
    } else {
      this.isAdmin = false;
      console.log('Admin status check failed:', {
        hasDetails: !!this.chatDetails,
        hasAdmin: !!(this.chatDetails && this.chatDetails.admin),
        hasCurrentId: !!this.currentUserId
      });
    }
  }

  
  getIsParticipantAdmin(participantId: string): boolean {
    if (!this.chatDetails || !this.chatDetails.admin || !participantId) {
      console.log('Missing data for admin check:', {
        hasDetails: !!this.chatDetails,
        hasAdmin: !!(this.chatDetails && this.chatDetails.admin),
        participantId
      });
      return false;
    }
    
    let adminId: string;
    const adminField = this.chatDetails.admin;
    
    if (Array.isArray(adminField) && adminField.length > 0) {
      const firstAdmin = adminField[0];
      adminId = typeof firstAdmin === 'string' ? 
        firstAdmin : 
        (firstAdmin && typeof firstAdmin === 'object' ? firstAdmin._id : null);
    } 
    else if (typeof adminField === 'string') {
      adminId = adminField;
    } 
    else if (adminField && typeof adminField === 'object') {
      adminId = (adminField as User)._id;
    }
    else {
      console.log('Unexpected admin field format:', adminField);
      return false;
    }
    
    const result = !!adminId && adminId.toString() === participantId.toString();
    return result;
  }
  
  getGroupAvatarUrl(): string {
    if (this.chatDetails?.groupAvatar) {
      if (this.chatDetails.groupAvatar.startsWith('/uploads/')) {
        return `${this.chatService.getApiUrl()}${this.chatDetails.groupAvatar}`;
      }
      return this.chatDetails.groupAvatar;
    }
    return 'assets/images/default-group-avatar.png';
  }

  getUserAvatarUrl(user: User | string): string {
    let avatarPath: string | undefined;
    if (typeof user === 'string') {
      const participant = this.chatDetails?.participants?.find(p => p._id === user);
      avatarPath = participant?.avatar;
    } else {
      avatarPath = user.avatar;
    }

    if (avatarPath) {
      if (avatarPath.startsWith('/uploads/')) {
        return `${this.chatService.getApiUrl()}${avatarPath}`;
      }
      return avatarPath;
    }
    return 'assets/images/default-avatar.png';
  }
  
  closeModal(): void {
    this.close.emit();
  }

  navigateToUserProfile(participantId: string, event: Event): void {
    event.stopPropagation();
    if (participantId === this.currentUserId) {
      this.router.navigate(['/profile']);
    } else {
      this.router.navigate(['/user', participantId]);
    }
    this.closeModal();
  }

  editGroupName(): void {
    if (!this.isAdmin || !this.chatDetails) return;
    this.isEditingName = true;
    this.newGroupName = this.chatDetails.name || '';
  }

  cancelEditName(): void {
    this.isEditingName = false;
    this.newGroupName = '';
  }

  saveGroupName(): void {
    if (!this.isAdmin || !this.chatDetails || !this.chatDetails._id || this.isSavingName) return;

    const trimmedName = this.newGroupName.trim();
    if (!trimmedName || trimmedName === this.chatDetails.name) {
      this.cancelEditName();
      return;
    }

    this.isSavingName = true;
    this.chatService.updateGroupName(this.chatDetails._id, trimmedName).subscribe({
      next: (updatedChat) => {
        if (this.chatDetails) {
            this.chatDetails.name = updatedChat.name;
        }
        this.ToastService.showToast('Group name updated!', 3000, 'success');
        this.isSavingName = false;
        this.cancelEditName();
      },
      error: (err) => {
        this.isSavingName = false;
        console.error('Error updating group name:', err);
        this.ToastService.showToast('Failed to update group name.', 3000, 'error');
      }
      });
    } 

  changeGroupAvatar(): void {
    if (!this.isAdmin || !this.chatDetails?._id) return;
    this.avatarFileInput.nativeElement.click();
  }

  onAvatarFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0] && this.chatDetails?._id) {
      const file = input.files[0];
      console.log('GroupInfoModal: File selected for avatar:', file.name, file.type, file.size);
    
      if (!file.type.match(/image\/(jpeg|jpg|png|)/)) {
        this.ToastService.showToast('Please select a valid image file (JPEG, PNG, JPG)', 3000, 'error');
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) {
        this.ToastService.showToast('Image size should be less than 5MB', 3000, 'error');
        return;
      }
      
      this.isUploadingAvatar = true;
      this.chatService.updateGroupAvatar(this.chatDetails._id, file).subscribe({
        next: (updatedChat) => {
          if (this.chatDetails) {
            this.chatDetails.groupAvatar = updatedChat.groupAvatar;
          }
          this.ToastService.showToast('Group avatar updated!', 3000, 'success');
          this.isUploadingAvatar = false;
          if (this.avatarFileInput) this.avatarFileInput.nativeElement.value = '';
        },
        error: (err) => {
          this.isUploadingAvatar = false;
          console.error('GroupInfoModal: Error updating group avatar from service:', err.message);
          this.ToastService.showToast('Failed to update group avatar', 3000, 'error');
          if (this.avatarFileInput) this.avatarFileInput.nativeElement.value = '';
        }
      });
    }
  }

  addParticipants(): void {
    if (!this.isAdmin || !this.chatDetails?._id) return;
    this.showAddParticipantsModal = true;
    this.searchQuery = '';
    this.searchResults = [];
    this.selectedUsers = [];
  }

  closeAddParticipantsModal(): void {
    this.showAddParticipantsModal = false;
    this.searchQuery = '';
    this.searchResults = [];
    this.selectedUsers = [];
  }

  searchUsers(): void {
  if (!this.searchQuery.trim()) {
    this.searchResults = [];
    return;
  }
  
  this.isSearching = true;
  this.chatService.searchUsers(this.searchQuery).subscribe({
    next: (users) => {
      this.searchResults = users.filter(user => 
        !this.chatDetails?.participants.some(p => p._id === user._id)
      );
      this.isSearching = false;
    },
    error: (err) => {
      console.error('Error searching users:', err);
      this.ToastService.showToast('Failed to search users', 3000, 'error');
      this.isSearching = false;
    }
  });
}

  toggleUserSelection(user: User): void {
    const index = this.selectedUsers.findIndex(u => u._id === user._id);
    if (index === -1) {
      this.selectedUsers.push(user);
    } else {
      this.selectedUsers.splice(index, 1);
    }
  }

  isUserSelected(userId: string): boolean {
    return this.selectedUsers.some(user => user._id === userId);
  }

  confirmAddParticipants(): void {
    if (!this.chatDetails?._id || this.selectedUsers.length === 0) return;
    
    const participantIds = this.selectedUsers.map(user => user._id);
    this.chatService.addGroupParticipants(this.chatDetails._id, participantIds).subscribe({
      next: (updatedChat) => {
        if (this.chatDetails) {
          this.chatDetails.participants = updatedChat.participants;
        }
        this.ToastService.showToast(`${this.selectedUsers.length} participant(s) added`, 3000, 'success');
        this.closeAddParticipantsModal();
      },
      error: (err) => {
        console.error('Error adding participants:', err);
        this.ToastService.showToast('Failed to add participants', 3000, 'error');
      }
    });
  }

  removeParticipant(participantId: string): void {
    if (!this.isAdmin || !this.chatDetails?._id) return;
    
    const participant = this.chatDetails.participants.find(p => p._id === participantId);
    if (!participant) return;
    
    if (confirm(`Are you sure you want to remove ${participant.username} from the group?`)) {
      this.isRemovingParticipant = true;
      this.chatService.removeGroupParticipant(this.chatDetails._id, participantId).subscribe({
        next: (updatedChat) => {
          if (this.chatDetails) {
            this.chatDetails.participants = updatedChat.participants;
          }
          this.ToastService.showToast('Participant removed successfully', 3000, 'success');
          this.isRemovingParticipant = false;
        },
        error: (err) => {
          this.isRemovingParticipant = false;
          console.error('Error removing participant:', err);
          this.ToastService.showToast('Failed to remove participant', 3000, 'error');
        }
      });
    }
  }

  leaveGroup(): void {
    if (!this.chatDetails?._id) {
      this.ToastService.showToast('Chat details are not available.', 3000, 'error');
      console.error('Chat details are not available for leaving group.');
      return;
    }
    if (confirm('Are you sure you want to leave this group?')) {
      this.chatService.leaveGroup(this.chatDetails._id).subscribe({
        next: (response) => {
          this.ToastService.showToast('You have left the group.', 3000, 'success');
          this.closeModal();
          this.router.navigate(['/home']);
        },
        error: (err) => {
          console.error('Error leaving group:', err);
          this.ToastService.showToast('Failed to leave the group.', 3000, 'error');
        }
      });
    }
  }

  deleteGroup(): void {
    if (!this.isAdmin || !this.chatDetails?._id) return;
    
    if (confirm('Are you sure you want to delete this group? This action cannot be undone.')) {
      this.isDeletingGroup = true;
      this.chatService.deleteGroup(this.chatDetails._id).subscribe({
        next: () => {
          this.isDeletingGroup = false;
          this.closeModal();
        },
        error: (err) => {
          this.isDeletingGroup = false;
          console.error('Error deleting group:', err);
          this.ToastService.showToast('Failed to delete group', 3000, 'error');
        }
      });
    }
  }

  onSearchChange(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.searchQuery = query;
    this.searchUsers();
  }

  deleteGroupAvatar(): void {
    if (!this.isAdmin || !this.chatDetails?._id) return;
    
    if (!this.chatDetails.groupAvatar || this.chatDetails.groupAvatar.includes('default-group-avatar')) {
      this.ToastService.showToast('No custom avatar to delete', 3000, 'error');
      return;
    }
    
    if (confirm('Are you sure you want to delete the group avatar?')) {
      this.isDeletingAvatar = true;
      this.chatService.deleteGroupAvatar(this.chatDetails._id).subscribe({
        next: (updatedChat) => {
          if (this.chatDetails) {
            this.chatDetails.groupAvatar = updatedChat.groupAvatar;
          }
          this.ToastService.showToast('Group avatar deleted successfully!', 3000, 'success');
          this.isDeletingAvatar = false;
        },
        error: (err) => {
          this.isDeletingAvatar = false;
          console.error('GroupInfoModal: Error deleting group avatar:', err.message);
          this.ToastService.showToast('Failed to delete group avatar', 3000, 'error');
        }
      });
    }
  }

  hasCustomAvatar(): boolean {
    return !!(this.chatDetails?.groupAvatar && 
            !this.chatDetails.groupAvatar.includes('default-group-avatar') &&
            !this.chatDetails.groupAvatar.includes('assets/images'));
  }
}