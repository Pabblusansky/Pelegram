export function getFullAvatarUrl(avatarPath: string | null | undefined): string {
    if (!avatarPath) {
      return 'assets/images/default-avatar.png';
    }
    
    if (avatarPath.startsWith('data:')) {
      return avatarPath;
    }
    
   if (avatarPath.startsWith('/uploads')) {
      return `http://localhost:3000${avatarPath}`;
    }
    
    if (avatarPath.startsWith('http')) {
      return avatarPath;
    }
    
    return avatarPath;
  }