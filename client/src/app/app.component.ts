// src/app/app.component.ts

import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-root', 
  standalone: true,
  imports: [
    RouterModule,
    CommonModule
  ],
  template: `
    <router-outlet></router-outlet>
  `,
  // styleUrls: ['./app.component.scss'] // No styles yet(05.2025)
})
export class AppComponent {
  title = 'Pelegram'; // App name
}