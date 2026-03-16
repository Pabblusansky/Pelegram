import { Component, EventEmitter, Input, Output, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Message } from '../chat.model';
import { animate, style, transition, trigger } from '@angular/animations';
import 'emoji-picker-element';

@Component({
  selector: 'app-message-context-menu',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div
      *ngIf="isVisible && menuPosition"
      class="context-menu"
      [style.left.px]="menuPosition.x"
      [style.top.px]="menuPosition.y"
      @menuAnimation
    >
      <div class="menu-top-bar">
        <div class="reaction-bar-above-menu">
          <span
            *ngFor="let emoji of availableReactions"
            class="reaction-emoji-option"
            (click)="onReactionClick(emoji)"
            [title]="'React: ' + emoji">
            {{ emoji }}
          </span>
          <span
            class="reaction-emoji-option reaction-expand-btn"
            (click)="showReactionPicker = !showReactionPicker"
            title="More reactions">
            +
          </span>
        </div>
      </div>
      <div class="reaction-picker-panel" *ngIf="showReactionPicker">
        <emoji-picker (emoji-click)="onReactionPickerSelect($event)"></emoji-picker>
      </div>
      <div class="menu-header">
        <div class="menu-close" (click)="onClose()">×</div>
      </div>
      <div class="menu-items">
        <button class="menu-item" (click)="onReply()">
          <span class="menu-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1C4.14 1 1 4.14 1 8c0 3.86 3.14 7 7 7 1.34 0 2.6-0.38 3.66-1.03l3.45 1.24c0.38 0.14 0.78-0.17 0.75-0.58L15.44 11.31C15.8 10.3 16 9.19 16 8 16 4.14 12.86 1 9 1H8zM5 7h6c0.55 0 1 0.45 1 1s-0.45 1-1 1H5C4.45 9 4 8.55 4 8s0.45-1 1-1z"/>
            </svg>
          </span> Reply
        </button>
        
        <ng-container *ngIf="isMyMessage">
          <button class="menu-item" (click)="onEdit()">
            <span class="menu-icon">✏️</span> Edit
          </button>
        </ng-container>
        
        <button class="menu-item" (click)="onCopy()">
          <span class="menu-icon">📋</span> Copy
        </button>
        
        <button class="menu-item" (click)="onForward()">
          <span class="menu-icon">↪️</span> Forward
        </button>
        
        <button class="menu-item" (click)="onPin()">
          <span class="menu-icon">
            <span *ngIf="!isPinned">📌</span>
            <span *ngIf="isPinned">🔽</span>
          </span> 
          {{ isPinned ? 'Unpin' : 'Pin' }}
        </button>
        
        <ng-container *ngIf="isMyMessage && isGroupChat && selectedMessage?.readBy?.length">
          <button class="menu-item" (click)="onViewReadReceipts()">
            <span class="menu-icon">👁️</span> Read by {{ selectedMessage!.readBy!.length }}
          </button>
        </ng-container>

        <button class="menu-item" (click)="onSelect()">
          <span class="menu-icon">☑️</span> Select
        </button>
        
        <ng-container *ngIf="isMyMessage">
          <button class="menu-item delete" (click)="onDelete()">
            <span class="menu-icon">🗑️</span> Delete
          </button>
        </ng-container>
      </div>
    </div>
  `,
  styleUrls: ['./message-context-menu.component.scss'],
  animations: [
    trigger('menuAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.9)' }),
        animate('150ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
      ]),
      transition(':leave', [
        animate('100ms ease-in', style({ opacity: 0, transform: 'scale(0.9)' }))
      ])
    ]),
    trigger('scrollToBottomButtonAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px) scale(0.8)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0) scale(1)' }))
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ opacity: 0, transform: 'translateY(20px) scale(0.8)' }))
      ])
    ]),
    trigger('fadeInOut', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease-out', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0 }))
      ])
    ]),
    trigger('scaleIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.9)' }),
        animate('300ms cubic-bezier(0.175, 0.885, 0.32, 1.275)', 
                style({ opacity: 1, transform: 'scale(1)' }))
      ])
    ])
  ]
})
export class MessageContextMenuComponent {
  @Input() isVisible: boolean = false;
  @Input() menuPosition: { x: number; y: number } | null = null;
  @Input() selectedMessage: Message | null = null;
  @Input() isMyMessage: boolean = false;
  @Input() isPinned: boolean = false;
  @Input() userId: string | null = null;
  @Input() availableReactions: string[] = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
  @Input() isGroupChat: boolean = false;

  showReactionPicker: boolean = false;

  @Output() close = new EventEmitter<void>();
  @Output() viewReadReceipts = new EventEmitter<Message>();
  @Output() reactionClick = new EventEmitter<string>();
  @Output() reply = new EventEmitter<Message>();
  @Output() edit = new EventEmitter<Message>();
  @Output() copy = new EventEmitter<Message>();
  @Output() forward = new EventEmitter<Message>();
  @Output() pin = new EventEmitter<Message>();
  @Output() select = new EventEmitter<Message>();
  @Output() delete = new EventEmitter<Message>();

  onClose(): void {
    this.showReactionPicker = false;
    this.close.emit();
  }

  onReactionClick(emoji: string): void {
    this.showReactionPicker = false;
    this.reactionClick.emit(emoji);
  }

  onReactionPickerSelect(event: any): void {
    const emoji = event.detail?.unicode;
    if (emoji) {
      this.reactionClick.emit(emoji);
    }
    this.showReactionPicker = false;
  }

  onReply(): void {
    if (this.selectedMessage) {
      this.reply.emit(this.selectedMessage);
      this.onClose();
    }
  }

  onEdit(): void {
    if (this.selectedMessage) {
      this.edit.emit(this.selectedMessage);
      this.onClose();
    }
  }

  onCopy(): void {
    if (this.selectedMessage) {
      this.copy.emit(this.selectedMessage);
      this.onClose();
    }
  }

  onForward(): void {
    if (this.selectedMessage) {
      this.forward.emit(this.selectedMessage);
      this.onClose();
    }
  }

  onPin(): void {
    if (this.selectedMessage) {
      this.pin.emit(this.selectedMessage);
      this.onClose();
    }
  }

  onViewReadReceipts(): void {
    if (this.selectedMessage) {
      this.viewReadReceipts.emit(this.selectedMessage);
      this.onClose();
    }
  }

  onSelect(): void {
    if (this.selectedMessage) {
      this.select.emit(this.selectedMessage);
      this.onClose();
    }
  }

  onDelete(): void {
    if (this.selectedMessage) {
      this.delete.emit(this.selectedMessage);
      this.onClose();
    }
  }
}