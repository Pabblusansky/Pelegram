// src/app/services/sound.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SoundService {
  private soundEnabledSubject = new BehaviorSubject<boolean>(this.getInitialSoundState());
  public soundEnabled$ = this.soundEnabledSubject.asObservable();
  
  private sounds: {[key: string]: HTMLAudioElement} = {};
  
  constructor() {
    this.preloadSounds();
  }
  
  private getInitialSoundState(): boolean {
    const saved = localStorage.getItem('soundEnabled');
    return saved ? saved === 'true' : true; 
  }
  
  setSoundEnabled(enabled: boolean): void {
    localStorage.setItem('soundEnabled', String(enabled));
    this.soundEnabledSubject.next(enabled);
    
    console.log('Sound ' + (enabled ? 'enabled' : 'disabled'));
  }
  
  private preloadSounds(): void {
    this.sounds = {
      message: new Audio('assets/sounds/message.mp3'),
      notification: new Audio('assets/sounds/notification.mp3'),
      call: new Audio('assets/sounds/call.mp3')
    };
    
    Object.values(this.sounds).forEach(audio => {
      audio.load();
      audio.volume = 0.5; 
    });
  }
  
  playSound(soundName: 'message' | 'notification' | 'call'): void {
    if (!this.soundEnabledSubject.value) {
      console.log('Sound is disabled, not playing:', soundName);
      return;
    }
    
    const sound = this.sounds[soundName];
    if (sound) {
      sound.currentTime = 0; 
      sound.play().catch(error => {
        console.error(`Error playing ${soundName} sound:`, error);
      });
    } else {
      console.error(`Sound "${soundName}" not found`);
    }
  }
}