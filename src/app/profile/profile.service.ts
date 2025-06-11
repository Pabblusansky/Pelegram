import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpEvent, HttpEventType } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, tap, map, finalize, filter } from 'rxjs/operators';
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
    
    if (!file.type.startsWith('image/')) {
      return throwError(() => new Error('Only image files are allowed'));
    }
    
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      return throwError(() => new Error(`File is too large. Maximum size is ${maxSize / (1024 * 1024)}MB`));
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
      filter((response): response is { avatar: string; user: UserProfile } => response !== null),
      tap(response => {
        console.log('Avatar upload complete:', response);
      }),
      finalize(() => {
        this.avatarUploadProgress.next(0);
      }),
      catchError(error => {
        console.error('Error uploading avatar:', error);
        return throwError(() => new Error(`Failed to upload avatar: ${error.message || error}`));
      })
    );
  }
  

  deleteAvatar(): Observable<{ success: boolean; message: string; user: UserProfile }> {
    const headers = this.getAuthHeaders();
    if (!headers) {
      return throwError(() => new Error('Not authorized for deleteAvatar'));
    }
    return this.http.delete<{ success: boolean; message: string; user: UserProfile }>(`${this.apiUrl}/avatar`, { headers })
      .pipe(
        tap(response => console.log('Avatar deletion response:', response)),
        catchError(this.handleError)
      );
  }

  private getAuthHeaders(): HttpHeaders | null {
    const token = localStorage.getItem('token'); 
    if (!token) {
      console.error('No token found for auth headers');
      return null;
    }
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }
  private handleError(error: any) {
    console.error('API Error:', error);
    return throwError(() => new Error(error.error?.message || error.message || 'Something went wrong'));
  }

  private getUploadEventData(event: HttpEvent<any>): { avatar: string; user: UserProfile } | null {
    switch (event.type) {
      case HttpEventType.UploadProgress:
        const progress = Math.round((100 * event.loaded) / (event.total || 1));
        this.avatarUploadProgress.next(progress);
        return null;
        
      case HttpEventType.Response:
        if (event.body && event.body.user) {
          this.currentProfileSubject.next(event.body.user);
        }
        return event.body;
        
      default:
        return null;
    }
  }
}