import { TestBed } from '@angular/core/testing';
import { MessageTextService, HIGHLIGHT_CLASS } from './message-text.service';

describe('MessageTextService', () => {
  let service: MessageTextService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MessageTextService] });
    service = TestBed.inject(MessageTextService);
  });

  describe('format', () => {
    it('returns empty string for empty content', () => {
      expect(service.format('')).toBe('');
    });

    it('converts newlines to line breaks', () => {
      expect(service.format('a\nb')).toBe('a<br>b');
    });

    it('strips script tags', () => {
      const out = String(service.format('hi <script>alert(1)</script>'));
      expect(out).not.toContain('<script>');
      expect(out).toContain('hi');
    });

    it('strips inline event handlers', () => {
      const out = String(service.format('<img src=x onerror="alert(1)">'));
      expect(out).not.toContain('onerror');
    });
  });

  describe('highlight', () => {
    it('wraps the matched term', () => {
      const out = String(service.highlight('hello world', 'world'));
      expect(out).toContain(`<span class="${HIGHLIGHT_CLASS}">world</span>`);
    });

    it('matches case-insensitively', () => {
      const out = String(service.highlight('Hello World', 'world'));
      expect(out).toContain(`class="${HIGHLIGHT_CLASS}"`);
    });

    it('highlights every occurrence', () => {
      const out = String(service.highlight('ba ba ba', 'ba'));
      expect(out.split(HIGHLIGHT_CLASS).length - 1).toBe(3);
    });

    it('falls back to plain formatting with no query', () => {
      expect(String(service.highlight('hello', ''))).toBe('hello');
    });

    it('treats regex metacharacters in the query as literal text', () => {
      const out = String(service.highlight('price is 5*6 today', '5*6'));
      expect(out).toContain(`<span class="${HIGHLIGHT_CLASS}">5*6</span>`);
    });

    it('does not crash or highlight everything on a lone metacharacter', () => {
      const out = String(service.highlight('nothing to see', '('));
      expect(out).toBe('nothing to see');
    });

    it('still sanitizes markup while highlighting', () => {
      const out = String(service.highlight('<script>bad</script> find me', 'find'));
      expect(out).not.toContain('<script>');
      expect(out).toContain(HIGHLIGHT_CLASS);
    });
  });

  describe('date formatting', () => {
    it('formats a timestamp as hours and minutes', () => {
      expect(service.formatTimestamp('2026-08-18T13:45:00Z')).toMatch(/\d{1,2}:\d{2}/);
    });

    it('returns empty string when there is no edit time', () => {
      expect(service.formatEditedTime(undefined)).toBe('');
      expect(service.formatEditedTime('')).toBe('');
    });

    it('formats a full date', () => {
      expect(service.formatDate(new Date('2026-08-18T00:00:00'))).toContain('2026');
    });
  });
});
