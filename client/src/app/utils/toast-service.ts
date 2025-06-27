import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private activeToasts: HTMLElement[] = [];

  /**
   * @param message The message to display
   * @param duration How long to show the message (ms)
   * @param type Optional type ('success', 'error', 'info', 'warning')
   */
  showToast(message: string, duration: number = 3000, type: 'success' | 'error' | 'info' | 'warning' = 'success'): void {
    console.log('Showing toast:', message);
    
    this.clearExistingToasts();
  
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'toast-icon';
    
    switch (type) {
      case 'error':
        iconSpan.innerHTML = '✕';
        toast.classList.add('toast-error');
        break;
      case 'warning':
        iconSpan.innerHTML = '⚠';
        toast.classList.add('toast-warning');
        break;
      case 'info': 
        iconSpan.innerHTML = 'ℹ';
        toast.classList.add('toast-info');
        break;
      case 'success':
      default:
        iconSpan.innerHTML = '✓';
        toast.classList.add('toast-success');
        break;
    }
    
    const messageSpan = document.createElement('span');
    messageSpan.className = 'toast-message';
    messageSpan.textContent = message;
    
    toast.appendChild(iconSpan);
    toast.appendChild(messageSpan);
    
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%) translateY(100px)',
      backgroundColor: type === 'error' ? '#e53935' : 
                      type === 'warning' ? '#ff9800' : 
                      type === 'info' ? '#2196f3' : 
                      '#4a76a8', 
      color: 'white',
      padding: '12px 16px',
      borderRadius: '10px',
      fontSize: '14px',
      fontWeight: '500',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      zIndex: '10000',
      opacity: '0',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      transition: 'transform 0.3s ease, opacity 0.3s ease',
      minWidth: '200px',
      maxWidth: '80%',
      textAlign: 'center',
      justifyContent: 'center'
    });
    
    // Style icon
    Object.assign(iconSpan.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '20px',
      height: '20px',
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      borderRadius: '50%',
      fontSize: '12px'
    });
    
    // Add toast to DOM
    document.body.appendChild(toast);
    this.activeToasts.push(toast);
    
    void toast.offsetWidth;
    
    requestAnimationFrame(() => {
      Object.assign(toast.style, {
        opacity: '1',
        transform: 'translateX(-50%) translateY(0)'
      });
      
      iconSpan.animate(
        [
          { transform: 'scale(0)', opacity: 0 },
          { transform: 'scale(1.2)', opacity: 1, offset: 0.7 },
          { transform: 'scale(1)', opacity: 1 }
        ],
        { 
          duration: 400,
          easing: 'ease-out',
          fill: 'forwards'
        }
      );
      
      setTimeout(() => {
        Object.assign(toast.style, {
          opacity: '0',
          transform: 'translateX(-50%) translateY(100px)'
        });
        
        setTimeout(() => {
          if (toast.parentNode) {
            document.body.removeChild(toast);
            this.activeToasts = this.activeToasts.filter(t => t !== toast);
          }
        }, 300);
      }, duration);
    });
  }

  private clearExistingToasts(): void {
    this.activeToasts.forEach(toast => {
      if (toast.parentNode) {
        document.body.removeChild(toast);
      }
    });
    this.activeToasts = [];
  }
}