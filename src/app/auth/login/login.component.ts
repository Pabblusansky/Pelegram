import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'], // Link the SCSS file  
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class LoginComponent {
  credentials = { usernameOrEmail: '', password: '' };
  passwordFieldType: string = 'password';

  constructor(private authService: AuthService, private router: Router) {}

  onSubmit() {
    console.log('Submitting login with data:', this.credentials); // Логируем данные перед отправкой
    this.authService.login(this.credentials).subscribe({
      next: () => {
        console.log('User logged in');
        this.router.navigate(['/']);
      },
      error: (err) => console.error('Error:', err),
    });
  }

  togglePasswordVisibility() {
    this.passwordFieldType = this.passwordFieldType === 'password' ? 'text' : 'password';
  }
}