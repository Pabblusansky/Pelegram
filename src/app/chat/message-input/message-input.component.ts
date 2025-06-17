import { Component, EventEmitter, Output, Input, ViewChild, ElementRef, HostListener, OnDestroy, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core'; // Добавим OnInit, OnChanges, SimpleChanges, ChangeDetectorRef
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { FileSizePipe } from '../../pipes/fileSize/file-size.pipe';
import { text } from 'express';

@Component({
  selector: 'app-message-input',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    FileSizePipe 
  ],
  styleUrls: ['./message-input.component.scss'],
  templateUrl: './message-input.component.html',
})
export class MessageInputComponent implements OnDestroy, OnInit, OnChanges {
  @Input() chatId: string | null = null;
  @Output() sendMessageEvent = new EventEmitter<{
    content: string;
    file?: File;
    caption?: string;
    replyTo?: any;
  }>(); 
  @Output() inputChange = new EventEmitter<boolean>(); 
  @Output() editLastMessageRequest = new EventEmitter<void>();

  newMessage: string = '';
  @ViewChild('messageTextarea') messageTextarea!: ElementRef<HTMLTextAreaElement>;

  private typingTimeout: any;
  private readonly typingDelay: number = 2000;
  private isCurrentlyTyping: boolean = false;
  

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  selectedFile: File | null = null;
  filePreviewUrl: SafeUrl | null = null;
  fileCaption: string = '';
  isPreviewLoading: boolean = false;

  constructor(
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.adjustTextareaHeight();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chatId'] && !changes['chatId'].firstChange) {
      this.resetAllInputState();
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.typingTimeout);
  }

  resetAllInputState(): void {
    this.newMessage = '';
    this.selectedFile = null;
    this.filePreviewUrl = null;
    this.fileCaption = '';
    this.isPreviewLoading = false;
    if (this.fileInput && this.fileInput.nativeElement) {
        this.fileInput.nativeElement.value = '';
    }
    if (this.isCurrentlyTyping) {
      this.isCurrentlyTyping = false;
      this.inputChange.emit(false);
    }
    clearTimeout(this.typingTimeout);
    this.cdr.detectChanges();
    if (this.messageTextarea && this.messageTextarea.nativeElement) {
        this.adjustTextareaHeight();
    }
  }
  
  onInput(): void {
    this.adjustTextareaHeight(); 
    const textIsNotEmpty = this.newMessage.trim().length > 0;
    const activityPresent = textIsNotEmpty || !!this.selectedFile; 

    clearTimeout(this.typingTimeout);

    if (activityPresent) {
      if (!this.isCurrentlyTyping) {
        this.isCurrentlyTyping = true;
        this.inputChange.emit(true);
      }
      this.typingTimeout = setTimeout(() => {
        if (this.isCurrentlyTyping && (this.newMessage.trim().length > 0 || !!this.selectedFile)) {
        } else if (this.isCurrentlyTyping) {
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
  
  adjustTextareaHeight(): void {
    if (this.messageTextarea && this.messageTextarea.nativeElement) {
      const textarea = this.messageTextarea.nativeElement;
      textarea.style.height = 'auto';
      const maxHeight = 120; 
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    }
  }

  onEnterPress(event: Event): void {
    if ((event as KeyboardEvent).shiftKey) {
      return;
    }
    if (this.newMessage.trim() || this.selectedFile) {
      event.preventDefault(); 
      this.send();
    }
  }

  send(): void {
    const textContent = this.newMessage.trim();

    if (!textContent && !this.selectedFile) { 
      return;
    }
    
    this.sendMessageEvent.emit({
      content: textContent,
      file: this.selectedFile || undefined, 
      caption: this.selectedFile ? (this.fileCaption.trim() || textContent) : undefined
    });

    this.resetAllInputState();
  }

  onFileSelected(event: Event): void {
    const element = event.target as HTMLInputElement;
    const file = element.files?.[0];

    this.removeSelectedFile();

    if (file) {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/ogg'];
      const maxSize = 25 * 1024 * 1024; // 25MB

      if (!allowedTypes.includes(file.type)) {
        alert('Unsupported file type: ' + file.type); // Change to Toast
        if (this.fileInput?.nativeElement) this.fileInput.nativeElement.value = '';
        return;
      }
      if (file.size > maxSize) {
        alert('File is too large. Max size is 25MB.'); // Change to Toast
        if (this.fileInput?.nativeElement) this.fileInput.nativeElement.value = '';
        return;
      }

      this.selectedFile = file;
      this.fileCaption = '';

      if (file.type.startsWith('image/')) {
        this.isPreviewLoading = true;
        this.filePreviewUrl = null;
        this.cdr.detectChanges();

        const reader = new FileReader();
        reader.onload = (e: any) => {
          this.filePreviewUrl = this.sanitizer.bypassSecurityTrustUrl(e.target.result);
          this.isPreviewLoading = false;
          this.cdr.detectChanges();
        };
        reader.onerror = () => {
          console.error('Error reading file for preview');
          this.isPreviewLoading = false;
          this.removeSelectedFile();
          this.cdr.detectChanges();
        };
        reader.readAsDataURL(file);
      } else {
        this.filePreviewUrl = null;
        this.isPreviewLoading = false;
      }
      this.onInput();
    }
  }

  removeSelectedFile(): void {
    this.selectedFile = null;
    this.filePreviewUrl = null;
    this.fileCaption = '';
    this.isPreviewLoading = false;
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
    this.onInput();
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
      if (this.newMessage.trim() === '' && 
          this.messageTextarea?.nativeElement &&
          this.messageTextarea.nativeElement.selectionStart === 0 && 
          this.messageTextarea.nativeElement.selectionEnd === 0) {
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
        this.adjustTextareaHeight();
      }
    }, 0);
  }
}