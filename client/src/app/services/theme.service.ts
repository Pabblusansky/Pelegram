// src/app/services/theme.service.ts
import { Injectable, OnDestroy, Renderer2, RendererFactory2 } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type ThemeType = 'light' | 'dark' | 'system';

@Injectable({
  providedIn: 'root'
})
export class ThemeService implements OnDestroy{
  private renderer: Renderer2;
  private themeSubject = new BehaviorSubject<ThemeType>(this.getStoredTheme());
  
  public currentTheme$: Observable<ThemeType> = this.themeSubject.asObservable();
  
  private prefersDarkMediaQuery: MediaQueryList;
  
  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
    
    this.prefersDarkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    this.prefersDarkMediaQuery.addEventListener('change', this.handleSystemThemeChange);
    
    this.applyTheme(this.themeSubject.value);
  }

  private getStoredTheme(): ThemeType {
    const storedTheme = localStorage.getItem('theme');
    return (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') 
      ? storedTheme 
      : 'system';
  }
  

  private handleSystemThemeChange = (e: MediaQueryListEvent): void => {
    if (this.themeSubject.value === 'system') {
      this.applyTheme('system');
    }
  }

  setTheme(theme: ThemeType): void {
    localStorage.setItem('theme', theme);
    
    this.themeSubject.next(theme);
    
    this.applyTheme(theme);
    
    console.log(`Theme set to: ${theme}`);
  }

  private applyTheme(themeType: ThemeType): void {
    let actualTheme: 'light' | 'dark';
    
    if (themeType === 'system') {
      actualTheme = this.prefersDarkMediaQuery.matches ? 'dark' : 'light';
    } else {
      actualTheme = themeType;
    }
    
    this.renderer.setAttribute(document.documentElement, 'data-theme', actualTheme);
    
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      const color = actualTheme === 'dark' ? '#1a1a1a' : '#ffffff';
      this.renderer.setAttribute(metaThemeColor, 'content', color);
    }
    
    console.log(`Applied theme: ${actualTheme} (from ${themeType})`);
  }
  
  getAppliedTheme(): 'light' | 'dark' {
    const currentTheme = this.themeSubject.value;
    if (currentTheme === 'system') {
      return this.prefersDarkMediaQuery.matches ? 'dark' : 'light';
    }
    return currentTheme;
  }

  toggleTheme(): void {
    const current = this.themeSubject.value;
    if (current === 'light') {
      this.setTheme('dark');
    } else {
      this.setTheme('light');
    }
  }
  
  ngOnDestroy(): void {
    this.prefersDarkMediaQuery.removeEventListener('change', this.handleSystemThemeChange);
  }
}