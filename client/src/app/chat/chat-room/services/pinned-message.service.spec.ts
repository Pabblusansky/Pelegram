import { TestBed } from '@angular/core/testing';
import { PinnedMessageService } from './pinned-message.service';
import { Message } from '../../chat.model';

describe('PinnedMessageService', () => {
  let service: PinnedMessageService;

  const msg = (id: string): Message => ({ _id: id, content: id } as Message);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [PinnedMessageService] });
    service = TestBed.inject(PinnedMessageService);
  });

  describe('resolve', () => {
    it('returns null when nothing is pinned', () => {
      expect(service.resolve(null, [])).toBeNull();
      expect(service.resolve(undefined, [])).toBeNull();
      expect(service.resolve('', [])).toBeNull();
    });

    it('uses an already populated pinned message', () => {
      const pinned = msg('p1');
      expect(service.resolve(pinned, [])).toBe(pinned);
    });

    it('looks an id up in the loaded messages', () => {
      const messages = [msg('a'), msg('b')];
      expect(service.resolve('b', messages)).toBe(messages[1]);
    });

    it('falls back when the id is not loaded', () => {
      const fallback = msg('zz');
      expect(service.resolve('zz', [msg('a')], () => fallback)).toBe(fallback);
    });

    it('returns null when neither the list nor the fallback has it', () => {
      expect(service.resolve('zz', [msg('a')], () => null)).toBeNull();
    });

    it('prefers the loaded message over the fallback', () => {
      const messages = [msg('a')];
      expect(service.resolve('a', messages, () => msg('other'))).toBe(messages[0]);
    });

    it('returns null for an unexpected shape', () => {
      expect(service.resolve(42, [])).toBeNull();
      expect(service.resolve({ noId: true }, [])).toBeNull();
    });
  });

  describe('canUnpin', () => {
    it('always allows unpinning in a direct chat', () => {
      expect(service.canUnpin(false, null, 'me')).toBe(true);
      expect(service.canUnpin(false, [{ _id: 'someone' }], 'me')).toBe(true);
    });

    it('allows the admin when admin is an array of populated users', () => {
      expect(service.canUnpin(true, [{ _id: 'me', username: 'me' }], 'me')).toBe(true);
    });

    it('allows the admin when admin is an array of ids', () => {
      expect(service.canUnpin(true, ['me'], 'me')).toBe(true);
    });

    it('allows the admin when admin is a single populated user', () => {
      expect(service.canUnpin(true, { _id: 'me' }, 'me')).toBe(true);
    });

    it('allows the admin when admin is a single id', () => {
      expect(service.canUnpin(true, 'me', 'me')).toBe(true);
    });

    it('denies a non-admin member', () => {
      expect(service.canUnpin(true, [{ _id: 'someone' }], 'me')).toBe(false);
    });

    it('denies when there is no admin recorded', () => {
      expect(service.canUnpin(true, null, 'me')).toBe(false);
      expect(service.canUnpin(true, [], 'me')).toBe(false);
    });

    it('denies when there is no signed-in user', () => {
      expect(service.canUnpin(true, [{ _id: 'me' }], null)).toBe(false);
    });

    it('handles several admins', () => {
      expect(service.canUnpin(true, [{ _id: 'other' }, { _id: 'me' }], 'me')).toBe(true);
    });
  });
});
