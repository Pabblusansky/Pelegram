import { Component, EventEmitter, Output, Input, ViewChild, ElementRef, HostListener, OnDestroy, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { FileSizePipe } from '../../pipes/fileSize/file-size.pipe';
import { ToastService } from '../../utils/toast-service';

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
  @Input() replyingToMessage: any | null = null;
  @Output() sendMessageEvent = new EventEmitter<{
    content: string;
    file?: File;
    replyTo?: any;
  }>(); 
  @Output() inputChange = new EventEmitter<boolean>(); 
  @Output() editLastMessageRequest = new EventEmitter<void>();

  newMessage: string = '';
  @ViewChild('messageTextarea') messageTextarea!: ElementRef<HTMLTextAreaElement>;

  private typingTimeout: any;
  private readonly typingDelay: number = 2000;
  private isCurrentlyTyping: boolean = false;

  isDragOver: boolean = false;
  private boundOnPaste: (event: ClipboardEvent) => void;

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  selectedFile: File | null = null;
  filePreviewUrl: SafeUrl | null = null;
  isPreviewLoading: boolean = false;

  constructor(
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private ToastService: ToastService
  ) {
    this.boundOnPaste = this.onPaste.bind(this);
  }

  ngOnInit(): void {
    this.adjustTextareaHeight();
  }

  ngAfterViewInit(): void {
    if (this.messageTextarea && this.messageTextarea.nativeElement) {
      this.messageTextarea.nativeElement.addEventListener('paste', this.boundOnPaste);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chatId'] && !changes['chatId'].firstChange) {
      this.resetAllInputState();
    }
    if (changes['replyingToMessage']) {
        if (this.replyingToMessage) {
            this.focusInput();
        }
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.typingTimeout);
    if (this.messageTextarea && this.messageTextarea.nativeElement) {
      this.messageTextarea.nativeElement.removeEventListener('paste', this.boundOnPaste);
    }
  }

  resetAllInputState(): void {
    this.newMessage = '';
    this.selectedFile = null;
    this.filePreviewUrl = null;
    this.isPreviewLoading = false;
    if (this.fileInput && this.fileInput.nativeElement) {
        this.fileInput.nativeElement.value = '';
    }
    if (this.isCurrentlyTyping) {
      this.isCurrentlyTyping = false;
      this.inputChange.emit(false);
    }
    clearTimeout(this.typingTimeout);
    this.replyingToMessage = null;
    this.cdr.detectChanges();
    if (this.messageTextarea && this.messageTextarea.nativeElement) {
        this.adjustTextareaHeight();
    }
  }
  
  onInput(): void {
    this.adjustTextareaHeight();
    
    if (!this.isCurrentlyTyping) {
      this.isCurrentlyTyping = true;
      this.inputChange.emit(true);
    }

    clearTimeout(this.typingTimeout);

    this.typingTimeout = setTimeout(() => {
      this.isCurrentlyTyping = false;
      this.inputChange.emit(false);
    }, this.typingDelay);
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
    const dataToSend: { content: string; file?: File; caption?: string; replyTo?: any } = {
      content: textContent,
      file: this.selectedFile || undefined,
    };
    if (this.replyingToMessage) {
      dataToSend.replyTo = this.replyingToMessage;
    }
    this.sendMessageEvent.emit(dataToSend);
    clearTimeout(this.typingTimeout);
      if (this.isCurrentlyTyping) {
        this.isCurrentlyTyping = false;
        this.inputChange.emit(false);
    }
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
        this.ToastService.showToast('Unsupported file type: ' + file.type, 3000, 'error');
        if (this.fileInput?.nativeElement) this.fileInput.nativeElement.value = '';
        return;
      }
      if (file.size > maxSize) {
        this.ToastService.showToast('File is too large. Max size is 25MB.', 3000, 'error');
        if (this.fileInput?.nativeElement) this.fileInput.nativeElement.value = '';
        return;
      }

      this.selectedFile = file;

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


  @HostListener('document:dragover', ['$event']) 
  onDocumentDragOver(event: DragEvent) {
    event.preventDefault(); 
  }

  @HostListener('document:drop', ['$event'])
  onDocumentDrop(event: DragEvent) {
    event.preventDefault();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target as HTMLElement;
    const relatedTarget = event.relatedTarget as HTMLElement;
    if (!target.contains(relatedTarget)) {
        this.isDragOver = false;
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      
      this.handleDroppedFile(file);
      
      if (event.dataTransfer.items) {
        event.dataTransfer.items.clear();
      } else if (event.dataTransfer.clearData) {
        event.dataTransfer.clearData();
      }
    }
  }


  private onPaste(event: ClipboardEvent): void {
    if (event.clipboardData && event.clipboardData.files && event.clipboardData.files.length > 0) {
      const file = event.clipboardData.files[0];

      if (file.type.startsWith('image/')) { // Paste only images for now (06.2025)
        event.preventDefault();
        this.handleDroppedFile(file);
      }
    }
  }
  
  private handleDroppedFile(file: File): void {
    this.removeSelectedFile(); 

    if (file) {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/ogg'];
      const maxSize = 25 * 1024 * 1024; // 25MB

      if (!allowedTypes.includes(file.type)) {
        this.ToastService.showToast('Unsupported file type: ' + file.type, 3000, 'error');
        return;
      }
      if (file.size > maxSize) {
        this.ToastService.showToast('File is too large. Max size is 25MB.', 3000, 'error');
        return;
      }

      this.selectedFile = file;
      // this.newMessage = ''; 

      if (file.type.startsWith('image/')) {
        this.isPreviewLoading = true;
        this.filePreviewUrl = null;
        this.cdr.detectChanges();

        const reader = new FileReader();
        reader.onload = (e: any) => {
          this.filePreviewUrl = this.sanitizer.bypassSecurityTrustUrl(e.target.result);
          this.isPreviewLoading = false;
          this.cdr.detectChanges();
          this.focusInput();
        };
        reader.onerror = () => {
          this.isPreviewLoading = false;
          this.removeSelectedFile();
          this.cdr.detectChanges();
        };
        reader.readAsDataURL(file);
      } else {
        this.filePreviewUrl = null;
        this.isPreviewLoading = false;
        this.focusInput();
      }
      this.onInput();
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