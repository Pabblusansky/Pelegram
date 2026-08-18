import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AudioPlayerComponent } from './audio-player.component';

describe('AudioPlayerComponent seeking', () => {
  let fixture: ComponentFixture<AudioPlayerComponent>;
  let component: AudioPlayerComponent;
  let audio: { currentTime: number };

  const pressKey = (k: string, shiftKey = false) => new KeyboardEvent('keydown', { key: k, shiftKey });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AudioPlayerComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(AudioPlayerComponent);
    component = fixture.componentInstance;

    audio = { currentTime: 0 };
    Object.defineProperty(component, 'audioElement', {
      get: () => audio,
      configurable: true,
    });

    component.isLoading = false;
    component.duration = 100;
    component.currentTime = 50;
  });

  describe('seekTo', () => {
    it('moves to the requested position', () => {
      component.seekTo(30);
      expect(component.currentTime).toBe(30);
      expect(audio.currentTime).toBe(30);
    });

    it('clamps below zero', () => {
      component.seekTo(-20);
      expect(component.currentTime).toBe(0);
    });

    it('clamps beyond the duration', () => {
      component.seekTo(500);
      expect(component.currentTime).toBe(100);
    });

    it('does nothing while loading', () => {
      component.isLoading = true;
      component.seekTo(10);
      expect(component.currentTime).toBe(50);
    });

    it('does nothing with no duration', () => {
      component.duration = 0;
      component.seekTo(10);
      expect(component.currentTime).toBe(50);
    });
  });

  describe('keyboard seeking', () => {
    it('steps forward 5 seconds on ArrowRight', () => {
      component.onSeekKeydown(pressKey('ArrowRight'));
      expect(component.currentTime).toBe(55);
    });

    it('steps back 5 seconds on ArrowLeft', () => {
      component.onSeekKeydown(pressKey('ArrowLeft'));
      expect(component.currentTime).toBe(45);
    });

    it('treats ArrowUp and ArrowDown the same as right and left', () => {
      component.onSeekKeydown(pressKey('ArrowUp'));
      expect(component.currentTime).toBe(55);
      component.onSeekKeydown(pressKey('ArrowDown'));
      expect(component.currentTime).toBe(50);
    });

    it('uses a larger step when shift is held', () => {
      component.onSeekKeydown(pressKey('ArrowRight', true));
      expect(component.currentTime).toBe(60);
    });

    it('jumps to the start on Home and the end on End', () => {
      component.onSeekKeydown(pressKey('Home'));
      expect(component.currentTime).toBe(0);
      component.onSeekKeydown(pressKey('End'));
      expect(component.currentTime).toBe(100);
    });

    it('jumps 30 seconds on PageUp and PageDown', () => {
      component.onSeekKeydown(pressKey('PageUp'));
      expect(component.currentTime).toBe(80);
      component.onSeekKeydown(pressKey('PageDown'));
      expect(component.currentTime).toBe(50);
    });

    it('never seeks past the ends with repeated keys', () => {
      for (let i = 0; i < 40; i++) component.onSeekKeydown(pressKey('ArrowRight'));
      expect(component.currentTime).toBe(100);

      for (let i = 0; i < 40; i++) component.onSeekKeydown(pressKey('ArrowLeft'));
      expect(component.currentTime).toBe(0);
    });

    it('ignores unrelated keys and leaves them to the page', () => {
      const event = pressKey('a');
      spyOn(event, 'preventDefault');

      component.onSeekKeydown(event);

      expect(component.currentTime).toBe(50);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('prevents the default page scroll for handled keys', () => {
      const event = pressKey('ArrowRight');
      spyOn(event, 'preventDefault');

      component.onSeekKeydown(event);

      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('does nothing while still loading', () => {
      component.isLoading = true;
      component.onSeekKeydown(pressKey('ArrowRight'));
      expect(component.currentTime).toBe(50);
    });
  });

  describe('announced value', () => {
    it('reads out the position and total', () => {
      expect(component.seekAriaValueText).toBe('0:50 of 1:40');
    });
  });

  describe('slider markup', () => {
    it('exposes the seek bar as a focusable slider', () => {
      fixture.detectChanges();
      const slider: HTMLElement = fixture.nativeElement.querySelector('.progress-wrapper');

      expect(slider).toBeTruthy();
      expect(slider.getAttribute('role')).toBe('slider');
      expect(slider.getAttribute('tabindex')).toBe('0');
      expect(slider.getAttribute('aria-label')).toBeTruthy();
    });
  });
});
