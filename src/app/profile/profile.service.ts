import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpEvent, HttpEventType } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, tap, map, finalize } from 'rxjs/operators';
import { UserProfile, ProfileUpdateDto } from './profile.model';
import { ThemeService } from '../services/theme.service';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private apiUrl = 'http://localhost:3000/api/profile';
  private currentProfileSubject = new BehaviorSubject<UserProfile | null>(null);
  
  public currentProfile$ = this.currentProfileSubject.asObservable();
  
  private avatarUploadProgress = new BehaviorSubject<number>(0);
  public avatarUploadProgress$ = this.avatarUploadProgress.asObservable();
  
  constructor(
    private http: HttpClient,
    private themeService: ThemeService
  ) {
    this.getMyProfile().subscribe({
      next: (profile) => this.currentProfileSubject.next(profile),
      error: () => {} 
    });
  }


  getMyProfile(): Observable<UserProfile> {
    const token = localStorage.getItem('token');
    if (!token) {
      return throwError(() => new Error('Authentication required'));
    }
    
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
    
    return this.http.get<UserProfile>(`${this.apiUrl}/me`, { headers })
      .pipe(
        tap(profile => {
          console.log('Profile loaded successfully');
          this.currentProfileSubject.next(profile);
        }),
        catchError(error => {
          console.error('Error loading profile:', error);
          return throwError(() => new Error(`Failed to load profile: ${error.message}`));
        })
      );
  }

  private applyProfileSettings(profile: UserProfile): void {
    if (profile.settings?.theme) {
      console.log('Applying theme from profile:', profile.settings.theme);
      this.themeService.setTheme(profile.settings.theme);
    }
  
  
  }

  getUserProfile(userId: string): Observable<UserProfile> {
    const token = localStorage.getItem('token');
    if (!token) {
      return throwError(() => new Error('Authentication required'));
    }
    
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
    
    return this.http.get<UserProfile>(`${this.apiUrl}/${userId}`, { headers })
      .pipe(
        catchError(error => {
          console.error(`Error loading profile for user ${userId}:`, error);
          return throwError(() => new Error(`Failed to load user profile: ${error.message}`));
        })
      );
  }

  updateProfile(profileData: ProfileUpdateDto): Observable<UserProfile> {
    const token = localStorage.getItem('token');
    if (!token) {
      return throwError(() => new Error('Authentication required'));
    }
    
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
    
    return this.http.patch<UserProfile>(`${this.apiUrl}/me`, profileData, { headers })
      .pipe(
        tap(profile => {
          console.log('Profile updated successfully');
          this.currentProfileSubject.next(profile);
        }),
        catchError(error => {
          console.error('Error updating profile:', error);
          return throwError(() => new Error(`Failed to update profile: ${error.message}`));
        })
      );
  }


  uploadAvatar(file: File): Observable<{ avatar: string; user: UserProfile }> {
    const token = localStorage.getItem('token');
    if (!token) {
      return throwError(() => new Error('Authentication required'));
    }
    
    this.avatarUploadProgress.next(0);
    
    const formData = new FormData();
    formData.append('avatar', file);
    
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
    
    return this.http.post<{ avatar: string; user: UserProfile }>(
      `${this.apiUrl}/avatar`, 
      formData, 
      { 
        headers,
        reportProgress: true,
        observe: 'events'
      }
    ).pipe(
      map(event => this.getUploadEventData(event)),
      finalize(() => {
        this.avatarUploadProgress.next(0);
      }),
      catchError(error => {
        console.error('Error uploading avatar:', error);
        return throwError(() => new Error(`Failed to upload avatar: ${error.message}`));
      })
    );
  }
  

  private getUploadEventData(event: HttpEvent<any>): { avatar: string; user: UserProfile } {
    switch (event.type) {
      case HttpEventType.UploadProgress:
        const progress = Math.round((100 * event.loaded) / (event.total || 1));
        this.avatarUploadProgress.next(progress);
        throw new Error('still uploading');
        
      case HttpEventType.Response:
        if (event.body && event.body.user) {
          this.currentProfileSubject.next(event.body.user);
        }
        return event.body;
        
      default:
        throw new Error('Unknown event type');
    }
  }
}