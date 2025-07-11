import { Component, ViewChild } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import { Router } from '@angular/router';
import { ChatService } from '../../chat/chat.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'], // Link the SCSS file  
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class LoginComponent {
  @ViewChild('loginForm') loginForm!: NgForm;
  credentials = { usernameOrEmail: '', password: '' };
  passwordFieldType: string = 'password';
  isLoading: boolean = false;
  errorMessage: string = '';

  constructor(private authService: AuthService, private router: Router, private chatService: ChatService) {}
  ngOnViewInit() {
    setTimeout(() => {
      this.loginForm.form.updateValueAndValidity();
    }, 100);
  }
  
  onSubmit() {
    if (!this.credentials.usernameOrEmail || !this.credentials.password) return;

    this.isLoading = true;
    this.errorMessage = '';

    this.authService.login(this.credentials).subscribe({
      next: () => {
        this.isLoading = false;
        console.log('User logged in');
        this.router.navigate(['/']);
        this.chatService.logoutAndReconnectSocket();
      },
      error: (err) => {
        this.isLoading = false;
        if(err.status === 0) {
          this.errorMessage = "Server is not reachable. Please try again later.";
          this.triggerErrorAnimation();
        } else if(err.status === 400) {
          this.errorMessage = "Invalid username or password.";
          this.triggerErrorAnimation();
        } else if(err.status === 429) {
            const retryAfter = err.headers?.get('Retry-After');
            let waitTime = '15 minutes';
            if (retryAfter) {
              const seconds = parseInt(retryAfter);
              waitTime = seconds > 60 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`;
            }
            
            this.errorMessage = `Too many login attempts. Please wait ${waitTime} before trying again.`;
            this.triggerErrorAnimation();
        } else {
          this.errorMessage = "An unexpected error occurred. Please try again.";
          this.triggerErrorAnimation();
        }
      },
    });
  }

  togglePasswordVisibility() {
    this.passwordFieldType = this.passwordFieldType === 'password' ? 'text' : 'password';
  }
  triggerErrorAnimation() {
    const card = document.querySelector('.auth-card');
    if (card) {
      card.classList.add('error-shake');
      setTimeout(() => card.classList.remove('error-shake'), 300);
    }
  }
  
}