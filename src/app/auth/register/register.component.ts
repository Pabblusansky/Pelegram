import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule],
})
export class RegisterComponent {
  formData: { username: string; email: string; password: string } = {
    username: '',
    email: '',
    password: '',
  };
  passwordFieldType: string = 'password';
  errors: Record<string, string> = {};

  constructor(private authService: AuthService) {}

  hasErrors(): boolean {
    return Object.values(this.errors).some((error) => !!error);
  }

  validateField(fieldName: string) {
    if (fieldName === 'email') {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      this.errors[fieldName] = emailRegex.test(this.formData[fieldName])
        ? ''
        : 'Invalid email format.';
    } else if (fieldName === 'username' || fieldName === 'password') {
      this.errors[fieldName] = this.formData[fieldName].trim()
        ? ''
        : `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} is required.`;
    }
  }

  validateForm() {
    Object.keys(this.formData).forEach((field) => this.validateField(field));
  }

  onSubmit() {
    this.validateForm();
    if (this.hasErrors()) {
      return; // Если есть ошибки, не отправляем запрос
    }

    this.authService.register(this.formData).subscribe({
      next: (response) => console.log('User registered:', response),
      error: (err) => console.error('Error:', err),
    });
  }

  togglePasswordVisibility() {
    this.passwordFieldType =
      this.passwordFieldType === 'password' ? 'text' : 'password';
  }
}
