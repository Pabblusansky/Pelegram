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

  describe('ownershipFor', () => {
    it('treats a matching string sender as mine', () => {
      expect(service.ownershipFor(msg('a', 'me'), 'me', false)).toBe(true);
    });

    it('treats a matching populated sender as mine', () => {
      expect(service.ownershipFor(msg('a', { _id: 'me' }), 'me', false)).toBe(true);
    });

    it('treats another user as not mine', () => {
      expect(service.ownershipFor(msg('a', 'someone'), 'me', false)).toBe(false);
    });

    it('never attributes a system event to the user', () => {
      const systemMsg = msg('a', 'me', { category: 'system_event' } as Partial<Message>);
      expect(service.ownershipFor(systemMsg, 'me', false)).toBe(false);
      expect(service.ownershipFor(systemMsg, 'me', true)).toBe(false);
    });

    it('trusts the just-sent flag over the sender id', () => {
      expect(service.ownershipFor(msg('a', 'someone-else'), 'me', true)).toBe(true);
    });

    it('is not mine when there is no user id', () => {
      expect(service.ownershipFor(msg('a', 'me'), null, false)).toBe(false);
    });

    it('is not mine when the sender cannot be resolved', () => {
      expect(service.ownershipFor(msg('a', undefined), 'me', false)).toBe(false);
    });
  });

  describe('mergeIncoming', () => {
    const existing = () => msg('a', 'me', { status: 'read', isSelected: true, content: 'old' } as Partial<Message>);
    const incoming = () => msg('a', 'me', { status: 'delivered', content: 'new', ismyMessage: true } as Partial<Message>);

    it('takes the incoming fields', () => {
      expect(service.mergeIncoming(existing(), incoming(), false).content).toBe('new');
    });

    it('never downgrades the status', () => {
      expect(service.mergeIncoming(existing(), incoming(), false).status).toBe('read');
    });

    it('accepts a status that moves forward', () => {
      const older = msg('a', 'me', { status: 'sent' } as Partial<Message>);
      const newer = msg('a', 'me', { status: 'read' } as Partial<Message>);
      expect(service.mergeIncoming(older, newer, false).status).toBe('read');
    });

    it('preserves the local selection state', () => {
      expect(service.mergeIncoming(existing(), incoming(), false).isSelected).toBe(true);
    });

    it('forces ownership for a message the user just sent', () => {
      const notMine = msg('a', 'other', { ismyMessage: false } as Partial<Message>);
      expect(service.mergeIncoming(existing(), notMine, true).ismyMessage).toBe(true);
    });

    it('otherwise keeps the incoming ownership', () => {
      const notMine = msg('a', 'other', { ismyMessage: false } as Partial<Message>);
      expect(service.mergeIncoming(existing(), notMine, false).ismyMessage).toBe(false);
    });

    it('does not mutate either input', () => {
      const e = existing();
      const i = incoming();
      service.mergeIncoming(e, i, true);
      expect(e.content).toBe('old');
      expect(i.content).toBe('new');
    });
  });
});
