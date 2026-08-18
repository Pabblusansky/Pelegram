import { TestBed } from '@angular/core/testing';
import { MediaModalService, MEDIA_MODAL_CLASS, MEDIA_MODAL_IMAGE_CLASS } from './media-modal.service';

describe('MediaModalService', () => {
  let service: MediaModalService;

  const overlays = () => document.querySelectorAll(`.${MEDIA_MODAL_CLASS}`);
  const pressEscape = () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MediaModalService] });
    service = TestBed.inject(MediaModalService);
  });

  afterEach(() => {
    service.close();
    overlays().forEach(o => o.remove());
  });

  it('adds an overlay with the image to the document', () => {
    service.open('http://example.com/a.png');

    expect(overlays().length).toBe(1);
    const img = document.querySelector(`.${MEDIA_MODAL_IMAGE_CLASS}`) as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain('a.png');
    expect(service.isOpen).toBe(true);
  });

  it('closes when the overlay is clicked', () => {
    service.open('http://example.com/a.png');
    (overlays()[0] as HTMLElement).click();

    expect(overlays().length).toBe(0);
    expect(service.isOpen).toBe(false);
  });

  it('closes on Escape', () => {
    service.open('http://example.com/a.png');
    pressEscape();

    expect(overlays().length).toBe(0);
    expect(service.isOpen).toBe(false);
  });

  it('ignores other keys', () => {
    service.open('http://example.com/a.png');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));

    expect(overlays().length).toBe(1);
  });

  it('removes the key listener when closed by click, not just by Escape', () => {
    const removeSpy = spyOn(document, 'removeEventListener').and.callThrough();

    service.open('http://example.com/a.png');
    (overlays()[0] as HTMLElement).click();

    expect(removeSpy).toHaveBeenCalledWith('keydown', jasmine.any(Function));
  });

  it('does not leave listeners behind across repeated open and click-close cycles', () => {
    const addSpy = spyOn(document, 'addEventListener').and.callThrough();
    const removeSpy = spyOn(document, 'removeEventListener').and.callThrough();

    for (let i = 0; i < 5; i++) {
      service.open(`http://example.com/${i}.png`);
      (overlays()[0] as HTMLElement).click();
    }

    const added = addSpy.calls.allArgs().filter(a => a[0] === 'keydown').length;
    const removed = removeSpy.calls.allArgs().filter(a => a[0] === 'keydown').length;

    expect(added).toBe(5);
    expect(removed).toBe(5);
    expect(overlays().length).toBe(0);
  });

  it('never stacks overlays when opened repeatedly', () => {
    service.open('http://example.com/a.png');
    service.open('http://example.com/b.png');
    service.open('http://example.com/c.png');

    expect(overlays().length).toBe(1);
    const img = document.querySelector(`.${MEDIA_MODAL_IMAGE_CLASS}`) as HTMLImageElement;
    expect(img.src).toContain('c.png');
  });

  it('closing twice is harmless', () => {
    service.open('http://example.com/a.png');

    service.close();
    service.close();

    expect(overlays().length).toBe(0);
    expect(service.isOpen).toBe(false);
  });

  it('tears the overlay down on destroy', () => {
    service.open('http://example.com/a.png');
    service.ngOnDestroy();

    expect(overlays().length).toBe(0);
  });

  it('stops responding to Escape once closed', () => {
    service.open('http://example.com/a.png');
    (overlays()[0] as HTMLElement).click();

    expect(() => pressEscape()).not.toThrow();
    expect(overlays().length).toBe(0);
  });
});
