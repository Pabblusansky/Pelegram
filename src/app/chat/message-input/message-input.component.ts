import { Component, EventEmitter, Output, Input, ViewChild, ElementRef, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-message-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styleUrls: ['./message-input.component.scss'],
  template: `
    <div class="message-input">
      <textarea 
        #messageTextarea
        [(ngModel)]="newMessage"
        (input)="onInput()"
        (keydown.enter)="onEnterPress($event)"
        placeholder="Type a message..."></textarea>
      <button (click)="send()" [disabled]="!newMessage.trim()">Send</button>
    </div>
  `,
})
export class MessageInputComponent implements OnDestroy {
  @Input() chatId: string | null = null;
  @Output() sendMessageEvent = new EventEmitter<string>(); 
  @Output() inputChange = new EventEmitter<boolean>(); 
  @Output() editLastMessageRequest = new EventEmitter<void>();

  newMessage: string = '';
  @ViewChild('messageTextarea') messageTextarea!: ElementRef<HTMLTextAreaElement>;

  private typingTimeout: any;
  private typingDelay: number = 2000; // 2 seconds for now
  private isCurrentlyTyping: boolean = false;

  constructor() {}

  ngOnDestroy(): void {
    clearTimeout(this.typingTimeout);
  }
  onInput(): void {
    const messageIsNotEmpty = this.newMessage.trim().length > 0;

    clearTimeout(this.typingTimeout);

    if (messageIsNotEmpty) {
      if (!this.isCurrentlyTyping) {
        this.isCurrentlyTyping = true;
        this.inputChange.emit(true);
      }
      this.typingTimeout = setTimeout(() => {
        if (this.isCurrentlyTyping) {
            this.isCurrentlyTyping = false;
            this.inputChange.emit(false);
        }
      }, this.typingDelay);
    } else {
      if (this.isCurrentlyTyping) {
        this.isCurrentlyTyping = false;
        this.inputChange.emit(false);
      }
    }
  }

  onEnterPress(event: Event): void {
    const keyEvent = event as KeyboardEvent;
    if (keyEvent.shiftKey) {
      return;
    }
    if (this.newMessage.trim()) {
      keyEvent.preventDefault(); 
      this.send();
    }
  }

  send(): void {
    const content = this.newMessage.trim();
    if (content) {
      this.sendMessageEvent.emit(content);
      this.newMessage = '';

      clearTimeout(this.typingTimeout);
      if (this.isCurrentlyTyping) {
        this.isCurrentlyTyping = false;
        this.inputChange.emit(false);
      }
    }
  }

  public focusInput(): void {
    if (this.messageTextarea && this.messageTextarea.nativeElement) {
        this.messageTextarea.nativeElement.focus();
    } else {
        setTimeout(() => this.messageTextarea?.nativeElement.focus(), 0);
    }
  }

  @HostListener('keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowUp') {
      if (this.newMessage.trim() === '' && this.messageTextarea.nativeElement.selectionStart === 0 && this.messageTextarea.nativeElement.selectionEnd === 0) {
        event.preventDefault();
        this.editLastMessageRequest.emit();
      }
    }
  }

  public setInputValue(text: string): void {
    this.newMessage = text;
    this.onInput();
    setTimeout(() => {
      if (this.messageTextarea && this.messageTextarea.nativeElement) {
        this.messageTextarea.nativeElement.focus();
        const len = text.length;
        this.messageTextarea.nativeElement.setSelectionRange(len, len);
      }
    }, 0);
  }
}
