import { Injectable, inject } from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { LoggerService } from '../../../services/logger.service';

export const HIGHLIGHT_CLASS = 'highlighted-search-term';

@Injectable({ providedIn: 'root' })
export class MessageTextService {
  private logger = inject(LoggerService);

  format(content: string): string {
    if (!content) return '';
    return DOMPurify.sanitize(content.replace(/\n/g, '<br>'));
  }

  highlight(text: string, query: string): SafeHtml {
    if (!query || !text) {
      return this.format(text);
    }

    try {
      const re = new RegExp(`(${this.escapeRegExp(query.trim())})`, 'gi');
      const highlighted = this.format(text).replace(re, `<span class="${HIGHLIGHT_CLASS}">$1</span>`);
      return DOMPurify.sanitize(highlighted, { ADD_TAGS: ['span'], ADD_ATTR: ['class'] });
    } catch (error) {
      this.logger.error('Error highlighting text:', error);
      return this.format(text);
    }
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  formatEditedTime(editedAt?: string): string {
    if (!editedAt) return '';
    return new Date(editedAt).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
