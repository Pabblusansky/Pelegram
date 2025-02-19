import { Component, Input, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../chat.service';

@Component({
  selector: 'app-message-input',
  templateUrl: './message-input.component.html',
  styleUrls: ['./message-input.component.scss'],
  imports: [FormsModule]
})
export class MessageInputComponent {
  @Input() chatId: string | null = null; // Getting chatId from input
  @Output() messageSent = new EventEmitter<string>(); // Event for sending message
  @Output() inputChange = new EventEmitter<boolean>();

  constructor(private ChatService: ChatService) {}
  message: string = '';
  
  private typingTimeout: any;
  onInputChange(): void {
    console.log('Input changed');
    this.inputChange.emit(this.message.trim().length > 0);

    clearTimeout(this.typingTimeout);

    if(this.message.trim().length > 0) {
      this.typingTimeout = setTimeout(() => {
        this.inputChange.emit(false);
      }, 3000);
    }
  }

  sendMessage(): void {
    if (this.message.trim() && this.chatId) {
      this.messageSent.emit(this.message);
      this.message = '';
      this.inputChange.emit(false);
    }
  }
}
