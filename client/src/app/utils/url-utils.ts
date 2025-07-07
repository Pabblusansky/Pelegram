import { environment } from '../../environments/environment';

export function getFullAvatarUrl(avatarPath: string | null | undefined): string {
    if (!avatarPath) {
      return 'assets/images/default-avatar.png';
    }
    
    if (avatarPath.startsWith('data:')) {
      return avatarPath;
    }
    
   if (avatarPath.startsWith('/uploads')) {
      return `${environment.apiUrl}${avatarPath}`;
    }
    
    if (avatarPath.startsWith('http')) {
      return avatarPath;
    }
    
    return avatarPath;
  }