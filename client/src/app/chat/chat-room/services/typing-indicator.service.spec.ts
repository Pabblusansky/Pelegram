import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TypingIndicatorService, TYPING_TIMEOUT_MS } from './typing-indicator.service';

describe('TypingIndicatorService', () => {
  let service: TypingIndicatorService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [TypingIndicatorService] });
    service = TestBed.inject(TypingIndicatorService);
  });

  describe('track', () => {
    it('starts with nobody typing', () => {
      expect(service.isAnyoneTyping).toBe(false);
    });

    it('records a user who starts typing', () => {
      service.track('u1', true);
      expect(service.isAnyoneTyping).toBe(true);
      expect(service.typingUserIds.has('u1')).toBe(true);
    });

    it('removes a user who stops typing', () => {
      service.track('u1', true);
      service.track('u1', false);
      expect(service.isAnyoneTyping).toBe(false);
    });

    it('tracks several users at once', () => {
      service.track('u1', true);
      service.track('u2', true);
      expect(service.typingUserIds.size).toBe(2);
    });

    it('auto-expires a user who never sends a stop event', fakeAsync(() => {
      service.track('u1', true);
      expect(service.isAnyoneTyping).toBe(true);

      tick(TYPING_TIMEOUT_MS);
      expect(service.isAnyoneTyping).toBe(false);
    }));

    it('notifies on expiry so the view can refresh', fakeAsync(() => {
      let notified = false;
      service.track('u1', true, () => { notified = true; });

      tick(TYPING_TIMEOUT_MS);
      expect(notified).toBe(true);
    }));

    it('restarts the expiry window on a repeated typing event', fakeAsync(() => {
      service.track('u1', true);
      tick(TYPING_TIMEOUT_MS - 1000);
      service.track('u1', true);

      tick(TYPING_TIMEOUT_MS - 1000);
      expect(service.isAnyoneTyping).toBe(true);

      tick(1000);
      expect(service.isAnyoneTyping).toBe(false);
    }));

    it('does not leave a timer running after a stop event', fakeAsync(() => {
      let notified = false;
      service.track('u1', true, () => { notified = true; });
      service.track('u1', false);

      tick(TYPING_TIMEOUT_MS);
      expect(notified).toBe(false);
    }));
  });

  describe('describe', () => {
    it('says nothing when nobody is typing', () => {
      expect(service.describe([])).toBe('');
    });

    it('names a single typist', () => {
      expect(service.describe(['ann'])).toBe('ann is typing...');
    });

    it('joins two typists', () => {
      expect(service.describe(['ann', 'bob'])).toBe('ann and bob are typing...');
    });

    it('summarises three or more', () => {
      expect(service.describe(['ann', 'bob', 'cy'])).toBe('ann, bob and 1 more are typing...');
      expect(service.describe(['ann', 'bob', 'cy', 'di'])).toBe('ann, bob and 2 more are typing...');
    });
  });

  describe('clear', () => {
    it('drops all state and pending timers', fakeAsync(() => {
      let notified = false;
      service.track('u1', true, () => { notified = true; });
      service.track('u2', true);

      service.clear();
      expect(service.isAnyoneTyping).toBe(false);

      tick(TYPING_TIMEOUT_MS);
      expect(notified).toBe(false);
    }));
  });
});
