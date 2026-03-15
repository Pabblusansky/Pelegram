import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime } from 'rxjs';
import { ChatApiService } from '../services/chat-api.service';
import { Message } from '../chat.model';
import { LoggerService } from '../../services/logger.service';

@Component({
  selector: 'app-chat-search-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-search-bar.component.html',
  styleUrl: './chat-search-bar.component.scss'
})
export class ChatSearchBarComponent implements OnInit, OnDestroy {
  @Input() chatId: string | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() resultNavigated = new EventEmitter<{ messageId: string; isInitial: boolean }>();
  @Output() resultsChanged = new EventEmitter<Message[]>();
  @Output() resultsCleared = new EventEmitter<void>();

  @ViewChild('searchInputEl') searchInputEl!: ElementRef;

  searchQuery = '';
  searchResults: Message[] = [];
  currentSearchResultIndex = -1;
  isSearching = false;

  private searchDebounce = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private chatApiService: ChatApiService,
    private logger: LoggerService
  ) {}

  ngOnInit(): void {
    this.searchDebounce.pipe(
      debounceTime(400),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      if (query.trim().length > 0) {
        this.performSearch(query.trim());
      } else {
        this.clearResultsLocally(false);
      }
    });

    setTimeout(() => this.focus(), 0);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  focus(): void {
    this.searchInputEl?.nativeElement?.focus();
  }

  onQueryChange(): void {
    this.searchQuery = this.searchQuery.trim();

    if (!this.searchQuery) {
      this.clearResultsLocally(true);
      return;
    }

    this.searchDebounce.next(this.searchQuery);
  }

  private performSearch(query: string): void {
    if (!this.chatId) return;
    this.isSearching = true;
    this.resultsCleared.emit();

    this.chatApiService.searchMessages(this.chatId, query).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (results) => {
        this.isSearching = false;
        this.searchResults = results.sort((a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        if (this.searchResults.length > 0) {
          this.currentSearchResultIndex = 0;
          this.resultsChanged.emit(this.searchResults);
          this.navigateToResult(this.currentSearchResultIndex, true);
        } else {
          this.currentSearchResultIndex = -1;
        }
      },
      error: (err) => {
        this.isSearching = false;
        this.logger.error('Search error:', err);
        this.searchResults = [];
        this.currentSearchResultIndex = -1;
        this.resultsCleared.emit();
      }
    });
  }

  private clearResultsLocally(resetQuery: boolean): void {
    this.searchResults = [];
    this.currentSearchResultIndex = -1;
    if (resetQuery) {
      this.searchQuery = '';
    }
    this.resultsCleared.emit();
  }

  navigateToResult(index: number, isInitial: boolean = false): void {
    if (index < 0 || index >= this.searchResults.length) return;

    const targetMessage = this.searchResults[index];
    if (!targetMessage?._id) return;

    this.currentSearchResultIndex = index;
    this.resultNavigated.emit({ messageId: targetMessage._id, isInitial });
  }

  nextResult(): void {
    if (this.searchResults.length === 0) {
      if (this.searchQuery.trim()) this.performSearch(this.searchQuery.trim());
      return;
    }

    if (this.currentSearchResultIndex < this.searchResults.length - 1) {
      this.currentSearchResultIndex++;
    } else {
      this.currentSearchResultIndex = 0;
    }

    this.navigateToResult(this.currentSearchResultIndex);
  }

  prevResult(): void {
    if (this.searchResults.length === 0) return;

    if (this.currentSearchResultIndex > 0) {
      this.currentSearchResultIndex--;
    } else {
      this.currentSearchResultIndex = this.searchResults.length - 1;
    }

    this.navigateToResult(this.currentSearchResultIndex);
  }

  close(): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.currentSearchResultIndex = -1;
    this.resultsCleared.emit();
    this.closed.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.searchResults.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'F3') {
        event.preventDefault();
        this.nextResult();
        return;
      }

      if (event.key === 'ArrowUp' || (event.shiftKey && event.key === 'F3')) {
        event.preventDefault();
        this.prevResult();
        return;
      }
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }
}
