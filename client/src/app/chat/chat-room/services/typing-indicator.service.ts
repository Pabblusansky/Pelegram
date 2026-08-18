import { Injectable, OnDestroy } from '@angular/core';

export const TYPING_TIMEOUT_MS = 5000;

@Injectable()
export class TypingIndicatorService implements OnDestroy {
  private readonly timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  readonly typingUserIds = new Set<string>();

  get isAnyoneTyping(): boolean {
    return this.typingUserIds.size > 0;
  }

  track(senderId: string, isTyping: boolean, onExpire?: () => void): void {
    const existing = this.timeouts.get(senderId);
    if (existing) {
      clearTimeout(existing);
      this.timeouts.delete(senderId);
    }

    if (!isTyping) {
      this.typingUserIds.delete(senderId);
      return;
    }

    this.typingUserIds.add(senderId);
    this.timeouts.set(
      senderId,
      setTimeout(() => {
        this.typingUserIds.delete(senderId);
        this.timeouts.delete(senderId);
        onExpire?.();
      }, TYPING_TIMEOUT_MS)
    );
  }

  describe(names: string[]): string {
    if (names.length === 0) return '';
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    return `${names[0]}, ${names[1]} and ${names.length - 2} more are typing...`;
  }

  clear(): void {
    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts.clear();
    this.typingUserIds.clear();
  }

  ngOnDestroy(): void {
    this.clear();
  }
}
