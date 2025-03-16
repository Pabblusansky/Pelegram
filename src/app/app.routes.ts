import { Routes } from '@angular/router';
import { RegisterComponent } from './auth/register/register.component';
import { LoginComponent } from './auth/login/login.component';
import { HomeComponent } from './home/home.component';
import { AuthGuard } from './auth/auth.guard'; // Import AuthGuard
import { RegisterSuccessComponent } from './auth/register/register-success/register-success.component';
import { ChatListComponent } from './chat/chat-list/chat-list.component';
import { ChatRoomComponent } from './chat/chat-room/chat-room.component';
export const routes: Routes = [
  {
    path: '',
    component: HomeComponent,
    canActivate: [AuthGuard],
    children: [
      {
        path: 'profile',
        loadComponent: () => import('./profile/profile.component').then(m => m.ProfileComponent)
      },
      {
        path: 'user/:userId',
        loadComponent: () => import('./profile/user-profile/user-profile.component').then(m => m.UserProfileComponent)
      }
    ]
  },
  {
    path: 'chats/:chatId',
    component: HomeComponent,
    canActivate: [AuthGuard]
  },
  { path: 'register', component: RegisterComponent },
  { path: 'login', component: LoginComponent },
  { path: 'registration-success', component: RegisterSuccessComponent },
  { path: '**', redirectTo: '' }
];
// { path: '**', redirectTo: '/register' }, // Редирект на главную для неизвестных маршрутов
