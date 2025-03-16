import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notificationsEnabledSubject = new BehaviorSubject<boolean>(this.getInitialNotificationState());
  public notificationsEnabled$ = this.notificationsEnabledSubject.asObservable();
  
  constructor() {}
  
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
  
  async showNotification(title: string, options?: NotificationOptions): Promise<void> {
    if (!this.notificationsEnabledSubject.value) {
      console.log('Notifications are disabled');
      return;
    }
    
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return;
    }
    
    if (Notification.permission === 'granted') {
      new Notification(title, options);
    } else if (Notification.permission !== 'denied') {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          new Notification(title, options);
        }
      } catch (error) {
        console.error('Error showing notification:', error);
      }
    }
  }
}