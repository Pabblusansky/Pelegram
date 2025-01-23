import { Component, Input, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-message-input',
  templateUrl: './message-input.component.html',
  styleUrls: ['./message-input.component.scss'],
  imports: [FormsModule]
})
export class MessageInputComponent {
  @Input() chatId: string | null = null; // Getting chatId from input
  @Output() messageSent = new EventEmitter<string>(); // Event for sending message

  message: string = '';

  sendMessage(): void {
    if (this.message.trim() && this.chatId) {
      this.messageSent.emit(this.message);
      this.message = '';
    }
  }
}
