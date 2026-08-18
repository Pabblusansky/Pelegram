import { Injectable, inject } from '@angular/core';
import { ChatApiService } from '../../services/chat-api.service';

export const DEFAULT_AVATAR = 'assets/images/default-avatar.png';
export const DEFAULT_GROUP_AVATAR = 'assets/images/default-group-avatar.png';
export const SAVED_MESSAGES_ICON = 'assets/images/saved-messages-icon.png';

@Injectable({ providedIn: 'root' })
export class MediaUrlService {
  private chatApiService = inject(ChatApiService);

  resolve(filePath: string | null | undefined): string {
    if (!filePath) {
      return '';
    }

    if (this.isAbsolute(filePath) || this.isClientAsset(filePath)) {
      return filePath;
    }

    const base = this.chatApiService.getApiUrl();
    return filePath.startsWith('/') ? `${base}${filePath}` : `${base}/${filePath}`;
  }

  thumbnail(filePath: string | null | undefined): string {
    if (!filePath || !this.isCloudinaryUpload(filePath)) {
      return '';
    }
    return filePath.replace('/upload/', '/upload/w_40,q_10,e_blur:1000/');
  }

  videoPoster(filePath: string | null | undefined): string {
    if (!filePath || !this.isCloudinaryUpload(filePath)) {
      return '';
    }
    return filePath
      .replace('/video/upload/', '/video/upload/w_400,q_auto,so_0/')
      .replace(/\.[^.]+$/, '.jpg');
  }

  avatar(avatarPath: string | null | undefined): string {
    if (!avatarPath) {
      return DEFAULT_AVATAR;
    }
    return this.resolve(avatarPath);
  }

  private isClientAsset(filePath: string): boolean {
    return filePath.startsWith('assets/') || filePath.startsWith('/assets/');
  }

  private isAbsolute(filePath: string): boolean {
    return filePath.startsWith('http://') || filePath.startsWith('https://');
  }

  private isCloudinaryUpload(filePath: string): boolean {
    return filePath.includes('cloudinary.com') && filePath.includes('/upload/');
  }
}
