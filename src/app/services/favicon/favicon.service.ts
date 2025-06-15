import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class FaviconService {
  private linkElement: HTMLLinkElement | null = null;
  private originalFaviconHref: string | null = null;
  private renderer: Renderer2;

  constructor(
    private rendererFactory: RendererFactory2,
    @Inject(DOCUMENT) private document: Document
  ) {
    this.renderer = rendererFactory.createRenderer(null, null);
    this.initializeFavicon();
  }

  private initializeFavicon(): void {
    this.linkElement = this.document.querySelector<HTMLLinkElement>("link[rel*='icon']");
    if (this.linkElement) {
      this.originalFaviconHref = this.linkElement.href;
    } else {
      console.warn('Favicon link element not found.');
    }
  }

  /**
   * @param count
   */
  public setNotificationBadge(count: number | null): void {
    if (!this.linkElement || !this.originalFaviconHref) {
      return;
    }

    if (count === 0) {
      this.resetFavicon();
      return;
    }

    const img = new Image();
    img.src = this.originalFaviconHref;

    img.onload = () => {
      const canvas = this.renderer.createElement('canvas') as HTMLCanvasElement;
      const size = Math.max(img.width, img.height, 16);
      canvas.width = size;
      canvas.height = size;

      const context = canvas.getContext('2d');
      if (!context) return;

      context.drawImage(img, 0, 0, size, size);

      const badgeRadius = size * 0.3; 
      const badgeX = size - badgeRadius - size * 0.05;
      const badgeY = badgeRadius + size * 0.05;

      context.beginPath();
      context.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI, false);
      context.fillStyle = '#FF0000'; 
      context.fill();

      // Рисуем текст (количество), если count - число
      if (typeof count === 'number' && count > 0) {
        const text = count > 9 ? '9+' : count.toString();
        context.font = `bold ${size * 0.35}px Arial`;
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, badgeX, badgeY + size * 0.03);
      }

      // Обновляем href у link элемента
      if (this.linkElement) {
        this.linkElement.href = canvas.toDataURL('image/png');
      }
    };

    img.onerror = () => {
      console.error('Failed to load original favicon for badge drawing.');
      const canvas = this.renderer.createElement('canvas') as HTMLCanvasElement;
      const size = 16;
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context || !this.linkElement) return;

      context.beginPath();
      context.arc(size * 0.7, size * 0.3, size * 0.3, 0, 2 * Math.PI, false);
      context.fillStyle = '#FF0000';
      context.fill();
      this.linkElement.href = canvas.toDataURL('image/png');
    };
  }

  public resetFavicon(): void {
    if (this.linkElement && this.originalFaviconHref) {
      this.linkElement.href = this.originalFaviconHref;
    }
  }
  }