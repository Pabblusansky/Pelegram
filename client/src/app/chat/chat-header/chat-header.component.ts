import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';


@Component({
  selector: 'app-chat-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chat-header.component.html',
  styleUrl: './chat-header.component.scss'
})

export class ChatHeaderComponent {
  // INPUTS
  @Input() isSelectionModeActive: boolean = false;
  @Input() isGroupChat: boolean = false;
  @Input() getAvatarUrl: string = '';
  @Input() getChatName: string = '';
  @Input() chatDetails: any = null;
  @Input() otherParticipant: any = null;
  @Input() showKeyboardHelp: boolean = false;
  @Input() showMediaGallery: boolean = false;
  @Input() selectedMessagesCount: number = 0;
  @Input() canDeleteSelected: boolean = false;
  @Input() isOtherParticipantOnline$: Observable<boolean> | null = null;
  @Input() otherParticipantStatus$: Observable<string> | null = null;

  // OUTPUTS
  @Output() backClick = new EventEmitter<void>();
  @Output() chatNameClick = new EventEmitter<Event>();
  @Output() keyboardHelpClick = new EventEmitter<void>();
  @Output() mediaGalleryClick = new EventEmitter<void>();
  @Output() searchClick = new EventEmitter<void>();
  @Output() cancelSelectionClick = new EventEmitter<void>();
  @Output() copySelectedClick = new EventEmitter<void>();
  @Output() forwardSelectedClick = new EventEmitter<void>();
  @Output() deleteSelectedClick = new EventEmitter<void>();
  @Output() avatarError = new EventEmitter<Event>();

  handleBackButton(): void {
    this.backClick.emit();
  }

  onChatNameClick(event: Event): void {
    this.chatNameClick.emit(event);
  }

  handleAvatarError(event: Event): void {
    this.avatarError.emit(event);
  }
}