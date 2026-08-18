import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MediaUrlService, DEFAULT_AVATAR } from './media-url.service';
import { ChatApiService } from '../../services/chat-api.service';

describe('MediaUrlService', () => {
  let service: MediaUrlService;
  const base = 'http://localhost:3000';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        MediaUrlService,
      ],
    });
    const api = TestBed.inject(ChatApiService);
    spyOn(api, 'getApiUrl').and.returnValue(base);
    service = TestBed.inject(MediaUrlService);
  });

  describe('resolve', () => {
    it('returns empty string for missing paths', () => {
      expect(service.resolve(null)).toBe('');
      expect(service.resolve(undefined)).toBe('');
      expect(service.resolve('')).toBe('');
    });

    it('passes absolute urls through untouched', () => {
      expect(service.resolve('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
      expect(service.resolve('http://cdn.example.com/a.png')).toBe('http://cdn.example.com/a.png');
    });

    it('prefixes rooted paths with the api base', () => {
      expect(service.resolve('/uploads/a.png')).toBe(`${base}/uploads/a.png`);
    });

    it('leaves client asset paths alone so they are not sent to the api host', () => {
      expect(service.resolve('assets/images/default-group-avatar.png'))
        .toBe('assets/images/default-group-avatar.png');
      expect(service.resolve('/assets/images/default-group-avatar.png'))
        .toBe('/assets/images/default-group-avatar.png');
    });

    it('inserts a separator for relative paths', () => {
      expect(service.resolve('uploads/a.png')).toBe(`${base}/uploads/a.png`);
    });
  });

  describe('thumbnail', () => {
    it('injects cloudinary transform params', () => {
      const src = 'https://res.cloudinary.com/demo/image/upload/v1/a.png';
      expect(service.thumbnail(src)).toBe(
        'https://res.cloudinary.com/demo/image/upload/w_40,q_10,e_blur:1000/v1/a.png'
      );
    });

    it('returns empty string for non-cloudinary paths', () => {
      expect(service.thumbnail('/uploads/a.png')).toBe('');
      expect(service.thumbnail(null)).toBe('');
    });
  });

  describe('videoPoster', () => {
    it('builds a jpg poster from a cloudinary video url', () => {
      const src = 'https://res.cloudinary.com/demo/video/upload/v1/clip.mp4';
      expect(service.videoPoster(src)).toBe(
        'https://res.cloudinary.com/demo/video/upload/w_400,q_auto,so_0/v1/clip.jpg'
      );
    });

    it('returns empty string for non-cloudinary paths', () => {
      expect(service.videoPoster('/uploads/clip.mp4')).toBe('');
      expect(service.videoPoster(undefined)).toBe('');
    });
  });

  describe('avatar', () => {
    it('falls back to the default avatar when there is no path', () => {
      expect(service.avatar(null)).toBe(DEFAULT_AVATAR);
      expect(service.avatar('')).toBe(DEFAULT_AVATAR);
    });

    it('resolves a stored avatar path against the api base', () => {
      expect(service.avatar('/uploads/avatars/me.png')).toBe(`${base}/uploads/avatars/me.png`);
    });

    it('leaves a client asset avatar alone', () => {
      expect(service.avatar('assets/images/saved-messages-icon.png'))
        .toBe('assets/images/saved-messages-icon.png');
    });

    it('leaves an absolute avatar url alone', () => {
      expect(service.avatar('https://cdn.example.com/me.png')).toBe('https://cdn.example.com/me.png');
    });
  });
});
