import { Component, EventEmitter, Output, Input, ViewChild, ElementRef, HostListener, OnDestroy, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef, AfterViewInit, NgZone } from '@angular/core';
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
    duration?: number;
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

  // Recording state
  isRecording: boolean = false;
  recordingTime: number = 0;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingTimerInterval: any;
  private recordingStartTime: number = 0;

  private micButtonRect: DOMRect | null = null;
  @ViewChild('waveformCanvas') waveformCanvas?: ElementRef<HTMLCanvasElement>;
  
  private audioContext?: AudioContext;
  private analyser?: AnalyserNode;
  private mediaStreamSource?: MediaStreamAudioSourceNode;
  private animationFrameId?: number;
  private dataArray: Uint8Array = new Uint8Array();
  private smoothedBars: number[] = new Array(20).fill(0); 

  private bars: number = 20;
  private barWidth: number = 0;
  private barSpacing: number = 2;

  @HostListener('document:mouseup', ['$event'])
  onGlobalMouseUp(event: MouseEvent): void {
    if (this.isRecording) {
      if (!this.micButtonRect) {
        console.warn('Mic button rect not saved');
        this.stopRecording(false);
        return;
      }
      
      const isPointerOverButton = (
        event.clientX >= this.micButtonRect.left &&
        event.clientX <= this.micButtonRect.right &&
        event.clientY >= this.micButtonRect.top &&
        event.clientY <= this.micButtonRect.bottom
      );
      
      console.log('Mouse release:', { 
        x: event.clientX, 
        y: event.clientY, 
        rect: this.micButtonRect,
        isOver: isPointerOverButton 
      });
      
      this.stopRecording(isPointerOverButton);
    }
  }

  @HostListener('document:touchend', ['$event'])
  onGlobalTouchEnd(event: TouchEvent): void {
    if (this.isRecording) {
      const touch = event.changedTouches[0];
      if (!touch) {
        this.stopRecording(false);
        return;
      }

      if (!this.micButtonRect) {
        console.warn('Mic button rect not saved');
        this.stopRecording(false);
        return;
      }
      
      const isPointerOverButton = (
        touch.clientX >= this.micButtonRect.left &&
        touch.clientX <= this.micButtonRect.right &&
        touch.clientY >= this.micButtonRect.top &&
        touch.clientY <= this.micButtonRect.bottom
      );
      
      console.log('Touch release:', { 
        x: touch.clientX, 
        y: touch.clientY, 
        rect: this.micButtonRect,
        isOver: isPointerOverButton 
      });
      
      this.stopRecording(isPointerOverButton);
    }
  }
  constructor(
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private ToastService: ToastService,
    private ngZone: NgZone
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
    this.cleanupWaveform();
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
    
    const chatRoom = document.querySelector('cdk-virtual-scroll-viewport.messages');
    const scrollPosition = chatRoom ? chatRoom.scrollTop : 0;
    
    textarea.style.height = 'auto';
    const maxHeight = 120; 
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    
    if (chatRoom && scrollPosition > 0) {
      chatRoom.scrollTop = scrollPosition;
    }
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
    if (this.isRecording) {
      this.cancelRecording();
      return;
    }
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


  // Recording functionality
  async startRecording(event?: MouseEvent | TouchEvent): Promise<void> {
      if (event) event.preventDefault();
      if (this.isRecording) return;

      const micButton = document.querySelector('.mic-button') as HTMLElement;
      if (micButton) {
        this.micButtonRect = micButton.getBoundingClientRect();
        console.log('Saved mic button rect:', this.micButtonRect);
      }

      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          this.isRecording = true;
          this.audioChunks = [];
          const mimeType = 'audio/ogg; codecs=opus';
          let options: MediaRecorderOptions;
          if (MediaRecorder.isTypeSupported(mimeType)) {
            console.log(`Using preferred mimeType: ${mimeType}`);
            options = { mimeType: mimeType };
          } else {
            console.warn(`Mime type ${mimeType} is not supported. Falling back to default.`);
            options = {}; 
          }
    
          this.mediaRecorder = new MediaRecorder(stream, options);
          this.mediaRecorder.ondataavailable = (e) => this.audioChunks.push(e.data);
          this.mediaRecorder.onstop = () => {
              stream.getTracks().forEach(track => track.stop());
          };
          this.mediaRecorder.start();
          this.recordingStartTime = Date.now();
          this.recordingTimerInterval = setInterval(() => {
              this.recordingTime = Math.floor((Date.now() - this.recordingStartTime) / 1000);
              this.cdr.detectChanges();
          }, 1000);
          this.cdr.detectChanges();
          this.initializeWaveform(stream);
      } catch (err) {
          console.error('Error accessing microphone:', err);
          this.ToastService.showToast('Microphone access denied.', 5000, 'error');
          this.isRecording = false;
          this.micButtonRect = null;
      }
    }

  stopRecording(shouldSend: boolean): void {
    if (!this.isRecording || !this.mediaRecorder) return;

    const recordedDuration = this.recordingTime;
    console.log(`Stopping recording. Should send: ${shouldSend}`);
    
    this.mediaRecorder.onstop = () => {
        if (shouldSend) {
            const usedMimeType = this.mediaRecorder?.mimeType || 'audio/ogg'; // 'audio/ogg' is a common fallback
            console.log(`Creating blob with used mimeType: ${usedMimeType}`);
            const audioBlob = new Blob(this.audioChunks, { type: usedMimeType });
            const fileExtension = usedMimeType.includes('ogg') ? 'ogg' : 'webm';
            const audioFile = new File([audioBlob], `voice-message-${new Date().toISOString()}.${fileExtension}`, {
                type: audioBlob.type,
                lastModified: Date.now()
            });

            if (audioFile.size > 1000) { 
              this.sendMessageEvent.emit({ content: '', file: audioFile, duration: recordedDuration });
            } else {
                console.warn("Recorded audio is too short, not sending.");
            }
        }
        this.resetRecordingState();
    };
    
    if (this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
    }
  }
  cancelRecording(): void {
      this.stopRecording(false);
  }

  private resetRecordingState(): void {
    clearInterval(this.recordingTimerInterval);
    this.isRecording = false;
    this.recordingTime = 0;
    this.audioChunks = [];
    this.mediaRecorder = null;
    this.micButtonRect = null;
    this.cleanupWaveform();
    this.cdr.detectChanges();
  }

  formatRecordingTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const formattedSeconds = remainingSeconds < 10 ? `0${remainingSeconds}` : remainingSeconds;
    return `${minutes}:${formattedSeconds}`;
  }

  private async initializeWaveform(stream: MediaStream): Promise<void> {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.6;
      
      const bufferLength = this.analyser.frequencyBinCount; 
      this.dataArray = new Uint8Array(bufferLength);

      this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);
      this.mediaStreamSource.connect(this.analyser);

      setTimeout(() => {
        this.startWaveformAnimation();
      }, 100);

    } catch (error) {
      console.error('Error initializing equalizer:', error);
    }
  }


  private startWaveformAnimation(): void {
    if (!this.analyser || !this.waveformCanvas) return;

    const animate = () => {
      if (!this.isRecording) return;

      this.animationFrameId = requestAnimationFrame(animate);
      this.drawWaveform();
    };

    this.ngZone.runOutsideAngular(() => {
      animate();
    });
  }

  private cleanupWaveform(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
    
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = undefined;
    }
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = undefined;
    }
    
    this.analyser = undefined;
  }

  private drawWaveform(): void {
    if (!this.analyser || !this.waveformCanvas?.nativeElement) return;

    this.analyser.getByteFrequencyData(this.dataArray);

    const canvas = this.waveformCanvas.nativeElement;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const width = canvas.width;
    const height = canvas.height;
    const bufferLength = this.analyser.frequencyBinCount;
    const numBars = this.bars; 

    const barSpacing = 2;
    const barWidth = (width - (numBars - 1) * barSpacing) / numBars;
    const cornerRadius = 2;
    const smoothingFactor = 0.1; 

    canvasCtx.clearRect(0, 0, width, height);

    let x = 0;

    for (let i = 0; i < numBars; i++) {
      const dataIndexStart = Math.floor(i * (bufferLength / numBars));
      const dataIndexEnd = Math.floor((i + 1) * (bufferLength / numBars));
      let sum = 0;
      for (let j = dataIndexStart; j < dataIndexEnd; j++) {
          sum += this.dataArray[j];
      }
      const avg = sum / (dataIndexEnd - dataIndexStart) || 0;

      const targetHeight = (avg / 255.0) * height + 1;

      this.smoothedBars[i] += (targetHeight - this.smoothedBars[i]) * smoothingFactor;
      const barHeight = this.smoothedBars[i];

      const gradient = canvasCtx.createLinearGradient(x, height, x, height - barHeight);
      
      gradient.addColorStop(0, 'rgba(135, 108, 183, 0.2)');
      gradient.addColorStop(0.7, 'rgba(135, 108, 183, 0.4)');
      gradient.addColorStop(1, 'rgba(168, 85, 247, 0.5)');
      
      canvasCtx.fillStyle = gradient;

      this.drawRoundedRect(canvasCtx, x, height - barHeight, barWidth, barHeight, cornerRadius);

      const highlightHeight = Math.min(barHeight, 5); 
      if (highlightHeight > 1) {
          canvasCtx.fillStyle = 'rgba(192, 132, 252, 0.8)';
          canvasCtx.shadowColor = 'rgba(168, 85, 247, 0.7)';
          canvasCtx.shadowBlur = 5;
          this.drawRoundedRect(canvasCtx, x, height - highlightHeight, barWidth, highlightHeight, cornerRadius);
          canvasCtx.shadowBlur = 0;
      }
      
      x += barWidth + barSpacing;
    }
  }

  private drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    if (width < 2 * radius) radius = width / 2;
    if (height < 2 * radius) radius = height / 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
    ctx.fill();
  }
}