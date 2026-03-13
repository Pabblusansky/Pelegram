import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject, fromEvent, takeUntil } from 'rxjs';
import { LoggerService } from './logger.service';

@Injectable({
  providedIn: 'root'
})

export class NotificationService implements OnDestroy {
  private notificationsEnabledSubject = new BehaviorSubject<boolean>(this.getInitialNotificationState());
  public notificationsEnabled$ = this.notificationsEnabledSubject.asObservable();

  private isAppVisibleSubject = new BehaviorSubject<boolean>(!document.hidden);
  public isAppVisible$ = this.isAppVisibleSubject.asObservable();
  private destroy$ = new Subject<void>();

  constructor(private logger: LoggerService) {
    fromEvent(document, 'visibilitychange')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.isAppVisibleSubject.next(!document.hidden);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public areNotificationsGloballyEnabled(): boolean {
    return this.notificationsEnabledSubject.getValue();
  }

  public isAppCurrentlyVisible(): boolean {
    return this.isAppVisibleSubject.getValue();
  }
  private getInitialNotificationState(): boolean {
    const saved = localStorage.getItem('notifications');
    return saved ? saved === 'true' : true;
  }

  setNotificationsEnabled(enabled: boolean): void {
    localStorage.setItem('notifications', String(enabled));
    this.notificationsEnabledSubject.next(enabled);

    if (enabled) {
      this.requestNotificationPermission();
    }
  }

  private async requestNotificationPermission(): Promise<void> {
    if (!('Notification' in window)) {
      return;
    }

    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      try {
        await Notification.requestPermission();
      } catch (error) {
        this.logger.error('Error requesting notification permission:', error);
      }
    }
  }

  async showNotification(title: string, options?: NotificationOptions & { icon?: string; tag?: string; data?: { chatId?: string; messageId?: string } }): Promise<void> {
    if (!this.notificationsEnabledSubject.value) {
      return;
    }

    if (!('Notification' in window)) {
      return;
    }

    if (this.isAppVisibleSubject.value) {
      return;
    }


    const currentPermission = Notification.permission;

    if (currentPermission === 'granted') {
      this.createNotification(title, options);
    } else if (currentPermission !== 'denied') {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          this.createNotification(title, options);
        }
      } catch (error) {
        this.logger.error('NotificationService: Error requesting notification permission:', error);
      }
    }
  }


  private createNotification(title: string, options?: NotificationOptions & { icon?: string; tag?: string; data?: { chatId?: string; messageId?: string } }): void {
    const notification = new Notification(title, options);

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    notification.onerror = (event) => {
      this.logger.error('NotificationService: Notification error:', event);
    };

    // setTimeout(() => notification.close(), 5000); // Not sure if we want to auto-close notifications
  }
}