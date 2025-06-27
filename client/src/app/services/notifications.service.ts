import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject, fromEvent, takeUntil } from 'rxjs';

@Injectable({
  providedIn: 'root'
})

export class NotificationService implements OnDestroy {
  private notificationsEnabledSubject = new BehaviorSubject<boolean>(this.getInitialNotificationState());
  public notificationsEnabled$ = this.notificationsEnabledSubject.asObservable();
  
  private isAppVisibleSubject = new BehaviorSubject<boolean>(!document.hidden);
  public isAppVisible$ = this.isAppVisibleSubject.asObservable();
  private destroy$ = new Subject<void>();

  constructor() {
    fromEvent(document, 'visibilitychange')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.isAppVisibleSubject.next(!document.hidden);
        // console.log('App visibility changed:', !document.hidden ? 'visible' : 'hidden');
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
    
    console.log('Notifications ' + (enabled ? 'enabled' : 'disabled'));
    
    if (enabled) {
      this.requestNotificationPermission();
    }
  }
  
  private async requestNotificationPermission(): Promise<void> {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return;
    }
    
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      try {
        const permission = await Notification.requestPermission();
        console.log('Notification permission:', permission);
      } catch (error) {
        console.error('Error requesting notification permission:', error);
      }
    }
  }
  
  async showNotification(title: string, options?: NotificationOptions & { icon?: string; tag?: string; data?: any }): Promise<void> {
    if (!this.notificationsEnabledSubject.value) {
      console.log('NotificationService: Notifications are disabled by user setting.');
      return;
    }
    
    if (!('Notification' in window)) {
      console.log('NotificationService: This browser does not support notifications.');
      return;
    }
    
    if (this.isAppVisibleSubject.value) {
      console.log('NotificationService: App is visible, not showing notification.');
      return;
    }


    const currentPermission = Notification.permission;
    console.log('NotificationService: Current notification permission:', currentPermission);

    if (currentPermission === 'granted') {
      this.createNotification(title, options);
    } else if (currentPermission !== 'denied') {
      console.log('NotificationService: Permission not granted, requesting...');
      try {
        const permission = await Notification.requestPermission();
        console.log('NotificationService: Permission request result:', permission);
        if (permission === 'granted') {
          this.createNotification(title, options);
        } else {
          console.log('NotificationService: Permission denied by user after request.');
        }
      } catch (error) {
        console.error('NotificationService: Error requesting notification permission:', error);
      }
    } else {
      console.log('NotificationService: Notifications permission permanently denied by user.');
    }
  }


  private createNotification(title: string, options?: NotificationOptions & { icon?: string; tag?: string; data?: any }): void {
    const notification = new Notification(title, options);
    console.log('NotificationService: Notification created.', notification);

    notification.onclick = (event) => {
      console.log('Notification clicked!', event);
      window.focus();
      if (options?.data?.chatId) {
        console.log('NotificationService: Would navigate to chat:', options.data.chatId);
      }
      notification.close();
    };

    notification.onerror = (event) => {
      console.error('NotificationService: Notification error:', event);
    };
    
    // setTimeout(() => notification.close(), 5000); // Not sure if we want to auto-close notifications
  }
}