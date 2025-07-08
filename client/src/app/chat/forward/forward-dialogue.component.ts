// forward-dialog.component.ts
import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../chat.service';

@Component({
  selector: 'app-forward-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="forward-dialog-backdrop" (click)="onCancel()">
      <div class="forward-dialog" (click)="$event.stopPropagation()">
        <div class="forward-dialog-header">
          <h3>Forward Message</h3>
          <button class="close-button" (click)="onCancel()">×</button>
        </div>
        
        <div class="forward-dialog-content">
          <div class="forward-message-preview">
          <p class="forward-label">
            Forwarding message from: <strong>{{ message.senderName || 'Unknown User' }}</strong>
          </p>
            <div class="message-content">
              {{ message.content }}
            </div>
          </div>

          <div class="search-container">
            <input
              type="text"
              [(ngModel)]="searchQuery"
              (input)="filterChats()"
              placeholder="Search chats..."
              class="search-input"
            >
          </div>
          
          <div class="chats-list" *ngIf="!loading; else loadingTemplate">
            <div *ngIf="filteredChats.length === 0" class="no-chats">
              No chats available
            </div>
            
            <div 
              *ngFor="let chat of filteredChats" 
              class="chat-item"
              [class.selected]="selectedChatId === chat._id"
              (click)="selectChat(chat._id)"
            >
              <div class="chat-avatar">
                <img 
                  [src]="getChatAvatar(chat)" 
                  alt="Chat avatar"
                  (error)="handleAvatarError($event)"
                >
              </div>
              <div class="chat-info">
                <div class="chat-name">{{ getChatName(chat) }}</div>
                <div class="chat-last-message" *ngIf="chat.lastMessage">
                  {{ chat.lastMessage.content | slice:0:30 }}{{ chat.lastMessage.content.length > 30 ? '...' : '' }}
                </div>
              </div>
            </div>
          </div>
          
          <ng-template #loadingTemplate>
            <div class="loading-container">
              <div class="spinner"></div>
              <p>Loading chats...</p>
            </div>
          </ng-template>
        </div>
        
        <div class="forward-dialog-footer">
          <button class="cancel-btn" (click)="onCancel()">Cancel</button>
          <button 
            class="forward-btn" 
            [disabled]="!selectedChatId || loading" 
            (click)="onForward()"
          >
            Forward
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .forward-dialog-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.65);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1050;
      animation: fadeInBackdrop 0.3s ease-out;
    }
    @keyframes fadeInBackdrop {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .forward-dialog {
      background-color: var(--card-background, #fff);
      border-radius: var(--border-radius-md, 12px);
      box-shadow: var(--box-shadow, 0 8px 24px rgba(0, 0, 0, 0.15));
      width: 90%;
      max-width: 480px;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      animation: scaleInDialog 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
      overflow: hidden;
    }

    @keyframes scaleInDialog {
      from { opacity: 0; transform: scale(0.95) translateY(20px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    
    .forward-dialog-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color, #eee);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0; 

      h3 {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 600;
        color: var(--text-color);
      }

      .close-button {
        background: none;
        border: none;
        font-size: 24px;
        font-weight: 300;
        cursor: pointer;
        color: var(--text-muted, #999);
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        padding: 0;
        line-height: 1;
        transition: background-color 0.2s, color 0.2s;
        position: relative;

        &:hover {
          background-color: var(--hover-background, #f0f0f0);
          color: var(--text-color, #555);
        }

        &:focus {
          outline: none;
        }
      }
    }
    
    .forward-dialog-content {
      padding: 16px 20px;
      flex-grow: 1;
      overflow-y: auto;
      &::-webkit-scrollbar { width: 6px; }
      &::-webkit-scrollbar-thumb { background: var(--text-muted, #aaa); border-radius: 3px; }
      &::-webkit-scrollbar-track { background: transparent; }
      scrollbar-width: thin;
      scrollbar-color: var(--text-muted, #aaa) transparent;
    }
    
    .forward-message-preview {
      margin-bottom: 20px;
      padding: 12px 16px;
      background-color: var(--background-color, #f0f2f5);
      border-radius: var(--border-radius-sm, 6px);
      border: 1px solid var(--border-color, #e0e0e0);

      .forward-label {
        margin: 0 0 8px;
        font-size: 0.875rem; // 14px
        color: var(--text-secondary, #777);
        font-weight: 500;

        strong {
          color: var(--primary-color, #4a76a8);
        }
      }

      .message-content {
        word-break: break-word;
        font-size: 0.9375rem;
        color: var(--text-color);
        line-height: 1.5;
        max-height: 6em;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
      }
    }
    
    .search-container {
      margin-bottom: 16px;
      position: relative; 

      .search-input {
        width: 100%;
        padding: 10px 16px;
        padding-left: 40px;
        border: 1px solid var(--border-color, #ddd);
        border-radius: var(--border-radius-md, 8px);
        font-size: 0.9375rem; // 15px
        color: var(--text-color);
        background-color: var(--card-background);
        transition: border-color 0.2s, box-shadow 0.2s;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%23999' viewBox='0 0 16 16'%3E%3Cpath d='M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z'/%3E%3C/svg%3E"); // Иконка лупы
        background-repeat: no-repeat;
        background-position: 12px center;


        &:focus {
          outline: none;
          border-color: var(--primary-color, #4a76a8);
          box-shadow: 0 0 0 2px var(--primary-light, rgba(74, 118, 168, 0.2));
        }

        &::placeholder {
          color: var(--text-muted);
        }
      }
    }
    
.chats-list {

  .chat-item {
    display: flex;
    align-items: center;
    padding: 10px 12px;
    border-radius: var(--border-radius-sm, 6px);
    cursor: pointer;
    margin-bottom: 6px; 
    transition: background-color 0.2s;

    &:hover {
      background-color: var(--hover-background, #f5f5f5);
    }

    &.selected {
      background-color: var(--primary-light, rgba(74, 118, 168, 0.15)); 

      .chat-name {
        font-weight: 600; 
        color: var(--primary-color);
      }
    }

    .chat-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      overflow: hidden;
      margin-right: 14px;
      flex-shrink: 0;
      background-color: var(--hover-background);

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .chat-info {
      flex: 1;
      overflow: hidden;

      .chat-name {
        font-weight: 500;
        font-size: 0.9375rem;
        color: var(--text-color);
        margin-bottom: 3px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: color 0.2s;
      }

      .chat-last-message {
        font-size: 0.8125rem;
        color: var(--text-secondary, #999);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
  }
}

.no-chats, .loading-container p {
  text-align: center;
  padding: 24px 0;
  color: var(--text-muted, #999);
  font-size: 0.9375rem;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--primary-light, rgba(74, 118, 168, 0.2));
    border-radius: 50%;
    border-top-color: var(--primary-color, #4a76a8);
    animation: spin 0.8s linear infinite;
    margin-bottom: 16px;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.forward-dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border-color, #eee);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  background-color: var(--background-color, #f9f9f9);
  flex-shrink: 0;
}

.cancel-btn, .forward-btn {
  padding: 10px 20px;
  border-radius: var(--border-radius-sm, 6px);
  font-weight: 500;
  font-size: 0.9375rem; // 15px
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s;

  &:active {
    transform: translateY(1px);
  }
}

.cancel-btn {
  background-color: transparent;
  color: var(--text-color, #333);
  border: 1px solid var(--border-color, #ccc);
  position: relative;
  overflow: hidden;
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 100%;
    background-color: var(--hover-background, rgba(0, 0, 0, 0.05));
    transition: width 0.2s ease;
    z-index: -1;
  }

  &:hover {
    border-color: var(--text-secondary, #777);
    
    &::before {
      width: 100%;
    }
  }
}

.forward-btn {
  background-color: var(--primary-color, #4a76a8);
  color: white;
  border: none;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1); 

  &:hover {
    background-color: var(--accent-color, #3d6593); 
    box-shadow: 0 4px 8px rgba(0,0,0,0.15);
  }

  &:disabled {
    background-color: var(--disabled-color, #ccc);
    color: var(--text-muted, #888);
    cursor: not-allowed;
    box-shadow: none;
  }
}

// Adapting for smaller screens
@media (max-width: 480px) {
  .forward-dialog {
    width: 95%;
    max-height: 90vh;
    border-radius: var(--border-radius-md, 10px) var(--border-radius-md, 10px) 0 0; 
  }

  .forward-dialog-header, .forward-dialog-content, .forward-dialog-footer {
    padding-left: 16px;
    padding-right: 16px;
  }
}
  `]
})
export class ForwardDialogComponent implements OnInit {
  @Input() message: any;
  @Output() cancel = new EventEmitter<void>();
  @Output() forward = new EventEmitter<string>();
  
  chats: any[] = [];
  filteredChats: any[] = [];
  searchQuery: string = '';
  selectedChatId: string | null = null;
  loading: boolean = true;
  currentUserId: string | null = null;
  
  constructor(private chatService: ChatService) {}
  
  ngOnInit(): void {
    this.currentUserId = localStorage.getItem('userId');
    this.loadChats();
  }
  
  loadChats(): void {
    this.loading = true;
    this.chatService.getAvailableChatsForForward().subscribe({
      next: (chats) => {
        this.chats = chats;
        this.filteredChats = [...this.chats];
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading chats for forward:', error);
        this.loading = false;
      }
    });
  }
  
  filterChats(): void {
    if (!this.searchQuery.trim()) {
      this.filteredChats = [...this.chats];
      return;
    }
    
    const query = this.searchQuery.toLowerCase();
    this.filteredChats = this.chats.filter(chat => {
      const chatName = this.getChatName(chat).toLowerCase();
      return chatName.includes(query);
    });
  }
  
  selectChat(chatId: string): void {
    this.selectedChatId = chatId;
  }
  
  onCancel(): void {
    this.cancel.emit();
  }
  
  onForward(): void {
    if (this.selectedChatId) {
      this.forward.emit(this.selectedChatId);
    }
  }
  
  getChatName(chat: any): string {
    if (!chat || !chat.participants) {
      return 'Chat';
    }

    if (chat.isGroupChat) {
      return chat.name || 'Group Chat';
    }

    if (chat.participants.length === 1 && chat.participants[0]._id === this.currentUserId) {
      return 'Saved Messages';
    }

    const otherParticipant = chat.participants.find(
      (p: any) => p._id !== this.currentUserId
    );

    return otherParticipant?.username || 'Chat';

  }
  
  getChatAvatar(chat: any): string {
    if (!chat || !chat.participants) {
      return 'assets/images/default-avatar.png';
    }
    
    const otherParticipant = chat.participants.find(
      (p: any) => p._id !== this.currentUserId
    );
    
    if (!otherParticipant || !otherParticipant.avatar) {
      return 'assets/images/default-avatar.png';
    }
    
    if (otherParticipant.avatar.startsWith('/uploads')) {
      return `${this.chatService.getApiUrl()}${otherParticipant.avatar}`;
    }
    
    return otherParticipant.avatar;
  }
  
  handleAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (!img.src.includes('default-avatar.png')) {
      img.src = 'assets/images/default-avatar.png';
    }
  }
}