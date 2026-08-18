import { TestBed } from '@angular/core/testing';
import { MessageListService } from './message-list.service';
import { Message, Reaction } from '../../chat.model';

describe('MessageListService', () => {
  let service: MessageListService;

  const msg = (id: string, senderId: unknown, extra: Partial<Message> = {}): Message =>
    ({ _id: id, senderId, content: id, ...extra } as unknown as Message);

  const reaction = (userId: string, r: string): Reaction => ({ userId, reaction: r });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MessageListService] });
    service = TestBed.inject(MessageListService);
  });

  describe('newerStatus', () => {
    it('advances sent -> delivered -> read', () => {
      expect(service.newerStatus('sent', 'delivered')).toBe('delivered');
      expect(service.newerStatus('delivered', 'read')).toBe('read');
    });

    it('never moves a status backwards', () => {
      expect(service.newerStatus('read', 'delivered')).toBe('read');
      expect(service.newerStatus('read', 'sent')).toBe('read');
      expect(service.newerStatus('delivered', 'sent')).toBe('delivered');
    });

    it('keeps the same status when unchanged', () => {
      expect(service.newerStatus('read', 'read')).toBe('read');
    });

    it('takes the known status when the other is missing', () => {
      expect(service.newerStatus(undefined, 'sent')).toBe('sent');
      expect(service.newerStatus('read', undefined)).toBe('read');
    });

    it('treats an unrecognised status as lowest rank', () => {
      expect(service.newerStatus('read', 'bogus')).toBe('read');
    });
  });

  describe('groupReactions', () => {
    it('returns an empty array for no reactions', () => {
      expect(service.groupReactions(undefined, 'me')).toEqual([]);
      expect(service.groupReactions([], 'me')).toEqual([]);
    });

    it('groups by reaction type with counts', () => {
      const groups = service.groupReactions(
        [reaction('u1', '👍'), reaction('u2', '👍'), reaction('u3', '❤️')],
        'u9'
      );

      const thumbs = groups.find(g => g.type === '👍');
      expect(thumbs?.count).toBe(2);
      expect(groups.find(g => g.type === '❤️')?.count).toBe(1);
    });

    it('marks reactedByMe only for the current user', () => {
      const groups = service.groupReactions([reaction('u1', '👍'), reaction('u2', '❤️')], 'u1');

      expect(groups.find(g => g.type === '👍')?.reactedByMe).toBe(true);
      expect(groups.find(g => g.type === '❤️')?.reactedByMe).toBe(false);
    });

    it('never marks reactedByMe without a user id', () => {
      const groups = service.groupReactions([reaction('u1', '👍')], null);
      expect(groups[0].reactedByMe).toBe(false);
    });

    it('exposes the reacting user ids', () => {
      const groups = service.groupReactions([reaction('u1', '👍'), reaction('u2', '👍')], 'u1');
      expect(groups[0].userIds).toEqual(['u1', 'u2']);
    });
  });

  describe('selectNewMessages', () => {
    it('returns only messages not already present', () => {
      const existing = [msg('a', 'u1'), msg('b', 'u1')];
      const incoming = [msg('b', 'u1'), msg('c', 'u1')];

      const result = service.selectNewMessages(existing, incoming, 'u1');

      expect(result.map(m => m._id)).toEqual(['c']);
    });

    it('returns nothing when everything is already present', () => {
      const existing = [msg('a', 'u1')];
      expect(service.selectNewMessages(existing, [msg('a', 'u1')], 'u1')).toEqual([]);
    });

    it('drops incoming messages without an id', () => {
      const result = service.selectNewMessages([], [msg('', 'u1'), msg('c', 'u1')], 'u1');
      expect(result.map(m => m._id)).toEqual(['c']);
    });

    it('marks ownership from a plain string sender id', () => {
      const [m] = service.selectNewMessages([], [msg('c', 'me')], 'me');
      expect(m.ismyMessage).toBe(true);
    });

    it('marks ownership from a populated sender object', () => {
      const [m] = service.selectNewMessages([], [msg('c', { _id: 'me', username: 'me' })], 'me');
      expect(m.ismyMessage).toBe(true);
    });

    it('marks messages from other users as not mine', () => {
      const [m] = service.selectNewMessages([], [msg('c', { _id: 'someone' })], 'me');
      expect(m.ismyMessage).toBe(false);
    });

    it('does not mutate the incoming messages', () => {
      const incoming = [msg('c', 'me')];
      service.selectNewMessages([], incoming, 'me');
      expect((incoming[0] as Message).ismyMessage).toBeUndefined();
    });

    it('does not mutate the existing list', () => {
      const existing = [msg('a', 'u1')];
      service.selectNewMessages(existing, [msg('c', 'u1')], 'u1');
      expect(existing.length).toBe(1);
    });
  });

  describe('withDateDividers', () => {
    const at = (iso: string, id: string) => msg(id, 'u1', { timestamp: iso } as Partial<Message>);
    const dayOf = (d: Date) => d.toISOString().slice(0, 10);

    it('returns an empty list for no messages', () => {
      expect(service.withDateDividers([], dayOf)).toEqual([]);
    });

    it('puts a divider before the first message', () => {
      const items = service.withDateDividers([at('2026-08-18T10:00:00Z', 'a')], dayOf);

      expect(items.length).toBe(2);
      expect(items[0]).toEqual({ type: 'divider', date: '2026-08-18' });
      expect(items[1].type).toBe('message');
    });

    it('uses one divider for several messages on the same day', () => {
      const items = service.withDateDividers([
        at('2026-08-18T10:00:00Z', 'a'),
        at('2026-08-18T11:00:00Z', 'b'),
        at('2026-08-18T12:00:00Z', 'c'),
      ], dayOf);

      expect(items.filter(i => i.type === 'divider').length).toBe(1);
      expect(items.length).toBe(4);
    });

    it('adds a divider each time the day changes', () => {
      const items = service.withDateDividers([
        at('2026-08-17T10:00:00Z', 'a'),
        at('2026-08-18T10:00:00Z', 'b'),
        at('2026-08-19T10:00:00Z', 'c'),
      ], dayOf);

      expect(items.filter(i => i.type === 'divider').map(i => (i as { date: string }).date))
        .toEqual(['2026-08-17', '2026-08-18', '2026-08-19']);
    });

    it('keeps message order intact', () => {
      const items = service.withDateDividers([
        at('2026-08-17T10:00:00Z', 'a'),
        at('2026-08-18T10:00:00Z', 'b'),
      ], dayOf);

      expect(items.filter(i => i.type === 'message').map(i => (i as Message)._id)).toEqual(['a', 'b']);
    });

    it('copies messages rather than mutating them', () => {
      const source = at('2026-08-18T10:00:00Z', 'a');
      service.withDateDividers([source], dayOf);
      expect((source as unknown as { type?: string }).type).toBeUndefined();
    });

    it('re-emits a divider when the day repeats after a gap', () => {
      const items = service.withDateDividers([
        at('2026-08-17T10:00:00Z', 'a'),
        at('2026-08-18T10:00:00Z', 'b'),
        at('2026-08-17T10:00:00Z', 'c'),
      ], dayOf);

      expect(items.filter(i => i.type === 'divider').length).toBe(3);
    });
  });
});
