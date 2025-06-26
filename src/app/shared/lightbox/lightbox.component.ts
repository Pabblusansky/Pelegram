import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-lightbox',
  template: `
    <div class="lightbox-overlay" (click)="onOverlayClick($event)">
      <button class="nav-btn prev" (click)="onPrevClick($event)" title="Previous (←)">‹</button>
      
      <div class="lightbox-content">
        <img [src]="src" [alt]="alt" (load)="onImageLoad($event)" (click)="$event.stopPropagation()" />
        
        <div class="lightbox-header">
          <div class="image-info">
            <span class="image-alt">{{ alt || 'Shared media' }}</span>
          </div>
          <div class="header-actions">
            <button class="action-btn" (click)="onGoToMessageClick($event)" title="Go to message">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 5a2 2 0 012-2h14a2 2 0 012 2v9a2 2 0 01-2 2H7l-4 4V5z" />
                <path d="M13.293 8.293a1 1 0 011.414 0L17 10.586V9a1 1 0 112 0v4a1 1 0 01-1 1h-4a1 1 0 110-2h1.586l-2.293-2.293a1 1 0 010-1.414z" />
              </svg>
            </button>
            <button class="action-btn close-btn" (click)="onCloseClick($event)" title="Close (Esc)">×</button>
          </div>
        </div>
      </div>

      <button class="nav-btn next" (click)="onNextClick($event)" title="Next (→)">›</button>
    </div>
  `,
  styles: [`
    .lightbox-overlay {
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.9);
      z-index: 2000;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 20px;
      box-sizing: border-box;
      animation: fadeIn 0.3s ease;
      cursor: pointer;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    .lightbox-content {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      cursor: default;
    }

    img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      box-shadow: 0 0 35px rgba(0,0,0,0.5);
      border-radius: 4px;
      opacity: 0;
      transition: opacity 0.3s ease;
      cursor: default;
    }
    img.loaded { opacity: 1; }

    .lightbox-header {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 20px;
      background: linear-gradient(to bottom, rgba(0,0,0,0.5), transparent);
      z-index: 10;
      color: white;
      transition: opacity 0.3s ease, transform 0.3s ease;
      opacity: 0;
      transform: translateY(-100%);
      pointer-events: none;
    }

    .lightbox-content:hover .lightbox-header {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }

    .image-info { font-size: 0.9rem; font-weight: 500; }
    .header-actions { display: flex; gap: 10px; }

    .action-btn {
      background: rgba(30, 30, 30, 0.7);
      border: 1px solid rgba(255,255,255,0.2);
      color: white;
      cursor: pointer;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.2s, transform 0.2s;
    }
    .action-btn:hover { background-color: rgba(0,0,0,0.8); transform: scale(1.1); }
    .action-btn svg { width: 20px; height: 20px; }
    .close-btn { font-size: 1.8rem; line-height: 1; padding: 0; }

    .nav-btn {
      background: rgba(30, 30, 30, 0.5);
      border: 1px solid rgba(255,255,255,0.1);
      color: white;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      cursor: pointer;
      transition: background-color 0.2s, transform 0.2s;
      z-index: 5;
    }
    .nav-btn:hover { background-color: rgba(0,0,0,0.7); transform: scale(1.05); }

    @media (max-width: 768px) {
      .lightbox-overlay { padding: 0; }
      .lightbox-header { 
        background: rgba(0,0,0,0.5); 
        opacity: 1; 
        transform: translateY(0); 
        pointer-events: auto;
      }
      .nav-btn { display: none; }
    }
  `],
  standalone: true,
  imports: [CommonModule]
})
export class LightboxComponent {
  @Input() src: string = '';
  @Input() alt: string = '';
  @Output() close = new EventEmitter<void>();
  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @Output() goToMessage = new EventEmitter<void>();

  onImageLoad(event: Event) {
    const imgElement = event.target as HTMLImageElement;
    imgElement.classList.add('loaded');
  }
  
  onOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }

  onPrevClick(event: MouseEvent) {
    event.stopPropagation();
    this.prev.emit();
  }
  
  onNextClick(event: MouseEvent) {
    event.stopPropagation();
    this.next.emit();
  }
  
  onCloseClick(event: MouseEvent) {
    event.stopPropagation();
    this.close.emit();
  }
  onGoToMessageClick(event: MouseEvent) {
    event.stopPropagation();
    this.goToMessage.emit();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.key === 'Escape') this.close.emit();
    if (event.key === 'ArrowLeft') this.prev.emit();
    if (event.key === 'ArrowRight') this.next.emit();
  }

}