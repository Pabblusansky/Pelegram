import { Injectable, OnDestroy } from '@angular/core';

export const CONTENT_WRAPPER_SELECTOR = '.cdk-virtual-scroll-content-wrapper';
export const QUIET_PERIOD_MS = 150;
export const HARD_TIMEOUT_MS = 1500;

export interface StabilizeOptions {
  quietMs?: number;
  timeoutMs?: number;
}

/**
 * Watches the virtual scroll content for DOM mutations and snaps the viewport to the
 * true pixel bottom once rendering has gone quiet, with a hard timeout as a safety net.
 */
@Injectable()
export class ScrollStabilizerService implements OnDestroy {
  private cancelCurrent: (() => void) | null = null;

  stabilize(el: HTMLElement | null | undefined, onComplete: () => void, options: StabilizeOptions = {}): void {
    this.cancel();

    if (!el) {
      onComplete();
      return;
    }

    const contentWrapper = el.querySelector(CONTENT_WRAPPER_SELECTOR);
    if (!contentWrapper) {
      onComplete();
      return;
    }

    const quietMs = options.quietMs ?? QUIET_PERIOD_MS;
    const timeoutMs = options.timeoutMs ?? HARD_TIMEOUT_MS;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let hardTimeout: ReturnType<typeof setTimeout> | null = null;
    let observer: MutationObserver | null = null;
    let cleaned = false;

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (observer) { observer.disconnect(); observer = null; }
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
      if (hardTimeout) { clearTimeout(hardTimeout); hardTimeout = null; }
      if (this.cancelCurrent === cleanup) {
        this.cancelCurrent = null;
      }
    };

    const finish = () => {
      el.scrollTop = el.scrollHeight;
      cleanup();
      onComplete();
    };

    const resetDebounce = () => {
      el.scrollTop = el.scrollHeight;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(finish, quietMs);
    };

    observer = new MutationObserver(resetDebounce);
    observer.observe(contentWrapper, { childList: true, subtree: true });

    hardTimeout = setTimeout(finish, timeoutMs);

    resetDebounce();

    this.cancelCurrent = cleanup;
  }

  cancel(): void {
    if (this.cancelCurrent) {
      this.cancelCurrent();
      this.cancelCurrent = null;
    }
  }

  ngOnDestroy(): void {
    this.cancel();
  }
}
