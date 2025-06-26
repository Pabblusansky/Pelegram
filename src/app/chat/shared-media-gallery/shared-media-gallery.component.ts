import { Component, Input, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatService, MediaGalleryResponse } from '../chat.service';
import { Message } from '../chat.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-shared-media-gallery',
  templateUrl: './shared-media-gallery.component.html',
  styleUrls: ['./shared-media-gallery.component.scss'],
  standalone: true,
  imports: [CommonModule],
})
export class SharedMediaGalleryComponent implements OnInit, OnDestroy {
  @Input() chatId!: string; 
  @Output() imageSelected = new EventEmitter<{ items: Message[], startIndex: number }>();

  mediaItems: Message[] = [];
  isLoading: boolean = false;
  error: string | null = null;

  currentFilter: 'images' | 'videos' | 'documents' = 'images';
  currentPage: number = 1;
  totalPages: number = 1;
  hasMoreToLoad: boolean = true;

  private destroy$ = new Subject<void>();

  constructor(private chatService: ChatService) {}

  ngOnInit(): void {
    if (!this.chatId) {
      this.error = 'Chat ID is required to load media gallery.';
      console.error(this.error);
      return;
    }
    this.loadMedia(true);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadMedia(isInitialLoad: boolean = false): void {
    if (this.isLoading || !this.hasMoreToLoad && !isInitialLoad) {
      return;
    }

    this.isLoading = true;
    if (isInitialLoad) {
      this.mediaItems = [];
      this.currentPage = 1;
    }

    this.chatService.getChatMedia(this.chatId, this.currentFilter, this.currentPage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: MediaGalleryResponse) => {
          this.mediaItems = [...this.mediaItems, ...response.media];
          this.totalPages = response.totalPages;
          this.currentPage++;
          this.hasMoreToLoad = this.currentPage <= this.totalPages;
          this.isLoading = false;
          this.error = null;
        },
        error: (err) => {
          console.error('Error loading media gallery:', err);
          this.error = 'Failed to load media. Please try again later.';
          this.isLoading = false;
        }
      });
  }

  setFilter(filter: 'images' | 'videos' | 'documents'): void {
    if (this.currentFilter === filter) return;

    this.currentFilter = filter;
    this.hasMoreToLoad = true;
    this.loadMedia(true);
  }

  getFullUrl(filePath: string | null | undefined): string {
    if (!filePath) {
      return 'assets/images/file-placeholder.png';
    }
    
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }

    const baseUrl = this.chatService.getApiUrl();

    if (filePath.startsWith('/')) {
      return `${baseUrl}${filePath}`;
    }
    
    return `${baseUrl}/${filePath}`;
  }

  onScroll(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.scrollHeight - target.scrollTop - target.clientHeight < 50 && this.hasMoreToLoad && !this.isLoading) {
      this.loadMedia();
    }
  }

  onMediaClick(item: Message, index: number): void {
    console.log('Clicked on media item:', item);
    if (item.fileMimeType?.startsWith('image/')) {
      const imageItems = this.mediaItems.filter(m => m.fileMimeType?.startsWith('image/'));
      const startIndex = imageItems.findIndex(m => m._id === item._id);
      this.imageSelected.emit({ 
        items: imageItems, 
        startIndex: startIndex
      });
    } else {
      const url = this.getFullUrl(item.filePath);
      if (url) {
        window.open(url, '_blank');
      }
    }
  }

  handleImageError(event: Event, item: Message): void {
      console.error(`Failed to load image: ${item.filePath}`);
      const imgElement = event.target as HTMLImageElement;
      imgElement.style.display = 'none'; 
  }

  getPlaceholderClass(mimeType: string | null | undefined): string {
    if (mimeType?.startsWith('video/')) return 'video';
    if (mimeType?.startsWith('audio/')) return 'audio';
    return 'document';
  }
}




