import { Routes } from '@angular/router';
import { RegisterComponent } from './auth/register/register.component';
import { LoginComponent } from './auth/login/login.component';
import { HomeComponent } from './home/home.component';
import { AuthGuard } from './auth/auth.guard'; // Import AuthGuard
import { RegisterSuccessComponent } from './auth/register/register-success/register-success.component';
import { ChatListComponent } from './chat/chat-list/chat-list.component';

export const routes: Routes = [
  { path: '', component: HomeComponent, canActivate: [AuthGuard] }, // Protect HomeComponent
  { path:'chats', component: ChatListComponent, canActivate: [AuthGuard] }, // Protect ChatComponent
  { path: 'register', component: RegisterComponent }, // Allow access to RegisterComponent
  { path: 'login', component: LoginComponent }, // Allow access to LoginComponent
  { path: 'registration-success', loadComponent: () => import('./auth/register/register-success/register-success.component').then(m => m.RegisterSuccessComponent) },
  { path: '**', redirectTo: '/register' }, // Редирект на главную для неизвестных маршрутов

];