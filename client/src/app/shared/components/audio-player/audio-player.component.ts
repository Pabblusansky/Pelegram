import { Component, Input, ViewChild, ElementRef, ChangeDetectorRef, NgZone, OnChanges, SimpleChanges, OnDestroy, AfterViewInit, Output, EventEmitter } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-audio-player',
  templateUrl: './audio-player.component.html',
  styleUrls: ['./audio-player.component.scss'],
  imports: [CommonModule],
  standalone: true
})
export class AudioPlayerComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() src: string = '';
  @Input() preloadedDuration: number = 0;

  @ViewChild('audioElement') audioElementRef!: ElementRef<HTMLAudioElement>;
  @ViewChild('waveformCanvas') waveformCanvasRef!: ElementRef<HTMLCanvasElement>;

  isPlaying: boolean = false;
  duration: number = 0;
  currentTime: number = 0;
  volume: number = 1;
  @Output() error = new EventEmitter<Event>();

  // Flags
  isLoading: boolean = true;
  private waveformDrawn: boolean = false; 

  // Audio context and buffer
  private audioContext: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private animationFrameId?: number;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['src'] && changes['src'].currentValue) {
      this.resetStateAndLoad();
    }
    if (changes['preloadedDuration'] && changes['preloadedDuration'].currentValue > 0) {
        this.duration = changes['preloadedDuration'].currentValue;
        this.isLoading = false;
        this.cdr.detectChanges();
    }
  }

  ngAfterViewInit(): void {
    this.audioElement.volume = this.volume;
  }

  ngOnDestroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }


  togglePlayPause(): void {
    if (this.isPlaying) {
      this.audioElement.pause();
    } else {
      this.audioElement.play();
    }
    this.isPlaying = !this.isPlaying;
  }

  onSeek(event: MouseEvent): void {
    if (this.isLoading || !this.duration) return;

    const canvas = this.waveformCanvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = x / rect.width;
    
    this.audioElement.currentTime = this.duration * percentage;
  }

  onVolumeChange(event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value);
    this.volume = value;
    this.audioElement.volume = value;
  }

  toggleMute(): void {
    this.audioElement.muted = !this.audioElement.muted;
  }


  onMetadataLoaded(): void {
    const newDuration = this.audioElementRef.nativeElement.duration;
    if (this.duration === 0 && isFinite(newDuration) && newDuration > 0) {
      this.duration = newDuration;
    }
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  onTimeUpdate(): void {
    this.currentTime = this.audioElementRef.nativeElement.currentTime;
    if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
    }
    this.animationFrameId = requestAnimationFrame(() => {
        this.drawProgress();
    });
    this.cdr.detectChanges();
  }

  onPlaybackEnded(): void {
    this.isPlaying = false;
    this.audioElementRef.nativeElement.currentTime = 0;
    this.currentTime = 0;
    requestAnimationFrame(() => this.drawProgress());
    this.cdr.detectChanges();
  }


  private get audioElement(): HTMLAudioElement {
    return this.audioElementRef.nativeElement;
  }

  private async loadAndDrawWaveform(): Promise<void> {
    try {
      const response = await this.http.get(this.src, { responseType: 'arraybuffer' }).toPromise();
      if (!response || !this.audioContext) {
          throw new Error('Failed to load audio file.');
      }

      this.audioBuffer = await this.audioContext.decodeAudioData(response);
      
      this.drawFullWaveform();

    } catch (error) {
        console.error('Error loading or drawing waveform:', error);
        this.onError(error instanceof Event ? error : new ErrorEvent('load_error', { error }));
    }
  }

  private drawFullWaveform(): void {
    if (!this.audioBuffer || !this.waveformCanvasRef) return;
    
    const canvas = this.waveformCanvasRef.nativeElement;
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const data = this.audioBuffer.getChannelData(0);
    const width = canvas.width;
    const height = canvas.height;
    
    const step = Math.ceil(data.length / width);
    const amps = [];
    for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step; j++) {
            const datum = data[(i * step) + j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        amps.push(Math.max(1, (max - min) * (height / 1.5)));
    }
    
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    amps.forEach((amp, i) => {
        ctx.fillRect(i, (height - amp) / 2, 1, amp);
    });
  }

  private drawProgress(): void {
    if (!this.audioElementRef || !this.waveformCanvasRef) return;

    const canvas = this.waveformCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    this.drawFullWaveform();

    const progress = this.audioElementRef.nativeElement.currentTime / this.audioElementRef.nativeElement.duration;
    if (progress > 0) {
        ctx.fillStyle = '#00BFFF';
        const progressWidth = width * progress;
        
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillRect(0, 0, progressWidth, height);
        
        ctx.globalCompositeOperation = 'source-over';
    }
  }

  formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds === 0) {
      return '0:00';
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const formattedSeconds = remainingSeconds < 10 ? `0${remainingSeconds}` : remainingSeconds;
    return `${minutes}:${formattedSeconds}`;
  }
  onError(event: Event): void {
    console.error('Audio error:', event);
    this.error.emit(event);
  }

  private resetStateAndLoad(): void {
    this.isLoading = this.preloadedDuration <= 0;
    this.isPlaying = false;
    this.duration = this.preloadedDuration || 0;
    this.currentTime = 0;
    this.waveformDrawn = false;
    this.cdr.detectChanges();
    this.loadAndDrawWaveform();
  }
}