import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class RegisterComponent {
  formData = { username: '', email: '', password: '' };
  passwordFieldType: string = 'password';

  constructor(private authService: AuthService) {}

  onSubmit() {
    this.authService.register(this.formData).subscribe({
      next: (response) => console.log('User registered:', response),
      error: (err) => console.error('Error:', err),
    });
  }

  togglePasswordVisibility() {
    this.passwordFieldType = this.passwordFieldType === 'password' ? 'text' : 'password';
  }
}