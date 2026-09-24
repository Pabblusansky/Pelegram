import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { AuthGuard } from './auth/auth.guard';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth.routes').then(m => m.AUTH_ROUTES)
  },
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
    // A conversation that has no chat yet; it is created by the first message.
    path: 'chats/new/:recipientId',
    component: HomeComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'chats/:chatId',
    component: HomeComponent,
    canActivate: [AuthGuard]
  },
  { path: '**', redirectTo: '' }
];
