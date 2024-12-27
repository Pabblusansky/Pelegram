import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common'; // Import CommonModule
import { AuthService } from './auth/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  imports: [RouterModule, CommonModule], // Include CommonModule in imports
  standalone: true,
})
export class AppComponent implements OnInit {
  title = 'Pelegram';

  constructor(public authService: AuthService) {}

  ngOnInit(): void {
    // Remove this check to prevent automatic logout
    // if (!this.authService.isAuthenticated()) {
    //   this.authService.logout();
    // }
  }

  logout(): void {
    this.authService.logout();
  }
}