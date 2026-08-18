import { Injectable } from '@angular/core';
import { Message } from '../../chat.model';

export interface MessageSearchContext {
  messages: () => Message[];
  updateMessagesWithDividers: () => void;
  detectChanges: () => void;
}

@Injectable()
export class MessageSearchService {
  isActive = false;
  results: Message[] = [];
  private ctx!: MessageSearchContext;

  init(context: MessageSearchContext): void {
    this.ctx = context;
  }

  get hasResults(): boolean {
    return this.results.length > 0;
  }

  setResults(results: Message[]): void {
    this.results = results ?? [];
    this.applyFlags();
    this.ctx.detectChanges();
  }

  clearResults(): void {
    this.results = [];
    this.resetFlags();
    this.ctx.detectChanges();
  }

  /** Returns the new active state so the caller can react to being closed. */
  toggle(): boolean {
    this.isActive = !this.isActive;
    return this.isActive;
  }

  close(): void {
    this.isActive = false;
    this.results = [];
    this.resetFlags();
  }

  markCurrent(messageId: string): void {
    this.ctx.messages().forEach(m => {
      m.isCurrentSearchResult = m._id === messageId;
    });
    this.ctx.updateMessagesWithDividers();
  }

  findResult(messageId: string | null | undefined): Message | null {
    if (!messageId) return null;
    return this.results.find(m => m._id === messageId) ?? null;
  }

  applyFlags(): void {
    const messages = this.ctx.messages();
    messages.forEach(msg => {
      msg.isSearchResult = false;
    });

    if (this.results.length > 0) {
      const resultIds = new Set(this.results.map(r => r._id));
      messages.forEach(msg => {
        if (msg._id && resultIds.has(msg._id)) {
          msg.isSearchResult = true;
        }
      });
    }

    this.ctx.updateMessagesWithDividers();
  }

  resetFlags(): void {
    this.ctx.messages().forEach(msg => {
      msg.isSearchResult = false;
      msg.isCurrentSearchResult = false;
    });
    this.ctx.updateMessagesWithDividers();
  }
}
