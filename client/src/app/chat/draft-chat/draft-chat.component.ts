import { Component, Input, OnChanges, OnDestroy, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MessageInputComponent } from '../message-input/message-input.component';
import { SocketService } from '../services/socket.service';
import { ProfileService } from '../../profile/profile.service';
import { UserProfile } from '../../profile/profile.model';
import { ToastService } from '../../utils/toast-service';
import { LoggerService } from '../../services/logger.service';
import { environment } from '../../../environments/environment';

/**
 * A conversation with someone we have no chat with yet. Nothing exists on the
 * server until the first message is sent; the server then creates the chat
 * and this view hands over to the regular chat room.
 */
@Component({
  selector: 'app-draft-chat',
  standalone: true,
  imports: [CommonModule, MessageInputComponent],
  templateUrl: './draft-chat.component.html',
  styleUrls: ['./draft-chat.component.scss'],
})
export class DraftChatComponent implements OnChanges, OnDestroy {
  private router = inject(Router);
  private socketService = inject(SocketService);
  private profileService = inject(ProfileService);
  private toastService = inject(ToastService);
  private logger = inject(LoggerService);

  @Input({ required: true }) recipientId!: string;

  recipient: UserProfile | null = null;
  isSending = false;
  private destroy$ = new Subject<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['recipientId'] && this.recipientId) {
      this.recipient = null;
      this.profileService.getUserProfile(this.recipientId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: profile => this.recipient = profile,
          error: err => this.logger.error('Failed to load draft chat recipient:', err),
        });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get recipientName(): string {
    return this.recipient?.displayName || this.recipient?.username || 'New chat';
  }

  get avatarUrl(): string {
    const avatar = this.recipient?.avatar;
    if (!avatar) return 'assets/images/default-avatar.png';
    return avatar.startsWith('/uploads') ? `${environment.apiUrl}${avatar}` : avatar;
  }

  onSend(event: { content: string; file?: File }): void {
    if (this.isSending) return;

    // Uploads go to an existing chat, so the chat has to exist first.
    if (event.file) {
      this.toastService.showToast('Send a text message first to start the chat', 3000, 'info');
      return;
    }
    const content = event.content?.trim();
    if (!content) return;

    this.isSending = true;
    this.socketService.sendFirstMessage(this.recipientId, content)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ chatId }) => {
          this.isSending = false;
          this.router.navigate(['/chats', chatId], { replaceUrl: true });
        },
        error: err => {
          this.isSending = false;
          this.logger.error('Failed to start chat:', err);
          this.toastService.showToast('Could not send the message. Please try again.', 3000, 'error');
        },
      });
  }
}
