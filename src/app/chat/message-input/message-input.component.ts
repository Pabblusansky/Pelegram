import { Component, EventEmitter, Output, Input, ViewChild, ElementRef } from '@angular/core';
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
      <button (click)="send()">Send</button>
    </div>
  `,
})
export class MessageInputComponent {
  @Input() chatId: string | null = null;
  @Output() sendMessageEvent = new EventEmitter<string>(); 
  @Output() inputChange = new EventEmitter<boolean>(); 

  newMessage: string = '';
  @ViewChild('messageTextarea') messageTextarea!: ElementRef<HTMLTextAreaElement>;

  private typingTimeout: any;

  constructor() {}

  onInput(): void {
    this.inputChange.emit(this.newMessage.trim().length > 0);
    clearTimeout(this.typingTimeout);
    if (this.newMessage.trim().length > 0) {
      this.typingTimeout = setTimeout(() => {
        this.inputChange.emit(false);
      }, 3000);
    }
  }

  onEnterPress(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (!keyboardEvent.shiftKey && this.newMessage.trim()) {
      event.preventDefault(); 
      this.send();
    }
  }

  send(): void {
    const content = this.newMessage.trim();
    if (content) {
      this.sendMessageEvent.emit(content);
      this.newMessage = '';
      this.inputChange.emit(false);
    }
  }

  public focusInput(): void {
    this.messageTextarea.nativeElement.focus();
  }
}