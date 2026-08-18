import { TestBed } from '@angular/core/testing';
import { MessageSearchService } from './message-search.service';
import { Message } from '../../chat.model';

describe('MessageSearchService', () => {
  let service: MessageSearchService;
  let messages: Message[];
  let dividerUpdates: number;
  let changeDetections: number;

  const msg = (id: string, content: string): Message =>
    ({ _id: id, content } as Message);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MessageSearchService] });
    service = TestBed.inject(MessageSearchService);

    messages = [msg('a', 'one'), msg('b', 'two'), msg('c', 'three')];
    dividerUpdates = 0;
    changeDetections = 0;

    service.init({
      messages: () => messages,
      updateMessagesWithDividers: () => { dividerUpdates++; },
      detectChanges: () => { changeDetections++; },
    });
  });

  describe('setResults', () => {
    it('flags only the matching messages', () => {
      service.setResults([messages[0], messages[2]]);

      expect(messages.map(m => !!m.isSearchResult)).toEqual([true, false, true]);
      expect(service.hasResults).toBe(true);
    });

    it('clears flags from a previous search before applying the new one', () => {
      service.setResults([messages[0]]);
      service.setResults([messages[1]]);

      expect(messages.map(m => !!m.isSearchResult)).toEqual([false, true, false]);
    });

    it('handles an empty result set', () => {
      service.setResults([]);

      expect(messages.every(m => !m.isSearchResult)).toBe(true);
      expect(service.hasResults).toBe(false);
    });

    it('ignores results for messages that are not loaded', () => {
      service.setResults([msg('zz', 'not loaded')]);

      expect(messages.every(m => !m.isSearchResult)).toBe(true);
    });

    it('refreshes dividers and change detection', () => {
      service.setResults([messages[0]]);

      expect(dividerUpdates).toBeGreaterThan(0);
      expect(changeDetections).toBe(1);
    });
  });

  describe('markCurrent', () => {
    it('marks exactly one message as the current result', () => {
      service.setResults(messages);
      service.markCurrent('b');

      expect(messages.map(m => !!m.isCurrentSearchResult)).toEqual([false, true, false]);
    });

    it('moves the marker on a subsequent navigation', () => {
      service.setResults(messages);
      service.markCurrent('b');
      service.markCurrent('c');

      expect(messages.map(m => !!m.isCurrentSearchResult)).toEqual([false, false, true]);
    });

    it('clears the marker when the id is not loaded', () => {
      service.setResults(messages);
      service.markCurrent('b');
      service.markCurrent('zz');

      expect(messages.every(m => !m.isCurrentSearchResult)).toBe(true);
    });
  });

  describe('clearResults', () => {
    it('drops results and all flags', () => {
      service.setResults(messages);
      service.markCurrent('a');

      service.clearResults();

      expect(service.hasResults).toBe(false);
      expect(messages.every(m => !m.isSearchResult && !m.isCurrentSearchResult)).toBe(true);
    });
  });

  describe('toggle and close', () => {
    it('toggles active state and reports it', () => {
      expect(service.isActive).toBe(false);
      expect(service.toggle()).toBe(true);
      expect(service.isActive).toBe(true);
      expect(service.toggle()).toBe(false);
    });

    it('close resets state and every flag', () => {
      service.toggle();
      service.setResults(messages);
      service.markCurrent('a');

      service.close();

      expect(service.isActive).toBe(false);
      expect(service.hasResults).toBe(false);
      expect(messages.every(m => !m.isSearchResult && !m.isCurrentSearchResult)).toBe(true);
    });
  });

  describe('findResult', () => {
    it('finds a message among the results', () => {
      service.setResults([messages[1]]);
      expect(service.findResult('b')).toBe(messages[1]);
    });

    it('returns null for unknown or missing ids', () => {
      service.setResults([messages[1]]);
      expect(service.findResult('a')).toBeNull();
      expect(service.findResult(null)).toBeNull();
      expect(service.findResult(undefined)).toBeNull();
    });
  });
});
