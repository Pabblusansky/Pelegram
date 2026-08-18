import { Injectable, OnDestroy } from '@angular/core';

export const MEDIA_MODAL_CLASS = 'media-modal-overlay';
export const MEDIA_MODAL_IMAGE_CLASS = 'media-modal-image';

/**
 * Full-screen image preview. The overlay and its Escape handler are torn down together
 * through a single close path, so dismissing by click cannot leave a document-level
 * key listener behind.
 */
@Injectable()
export class MediaModalService implements OnDestroy {
  private closeCurrent: (() => void) | null = null;

  get isOpen(): boolean {
    return this.closeCurrent !== null;
  }

  open(imageUrl: string): void {
    this.close();

    const modal = document.createElement('div');
    modal.className = MEDIA_MODAL_CLASS;
    Object.assign(modal.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: '2000',
      cursor: 'zoom-out',
    });

    const img = document.createElement('img');
    img.src = imageUrl;
    img.className = MEDIA_MODAL_IMAGE_CLASS;
    Object.assign(img.style, {
      maxWidth: '90%',
      maxHeight: '90%',
      objectFit: 'contain',
      cursor: 'zoom-out',
    });

    modal.appendChild(img);
    document.body.appendChild(modal);

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.close();
      }
    };

    const teardown = () => {
      document.removeEventListener('keydown', handleEscape);
      modal.removeEventListener('click', teardownOnClick);
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
      if (this.closeCurrent === teardown) {
        this.closeCurrent = null;
      }
    };

    const teardownOnClick = () => teardown();

    modal.addEventListener('click', teardownOnClick);
    document.addEventListener('keydown', handleEscape);

    this.closeCurrent = teardown;
  }

  close(): void {
    if (this.closeCurrent) {
      const teardown = this.closeCurrent;
      this.closeCurrent = null;
      teardown();
    }
  }

  ngOnDestroy(): void {
    this.close();
  }
}
