export interface UserSettings {
  notifications: boolean;
  soundEnabled: boolean;
  theme: 'light' | 'dark' | 'system';
}

export interface UserProfile {
  _id: string;
  username: string;
  email: string;
  displayName: string;
  bio: string;
  avatar: string | null;
  phoneNumber: string;
  settings: UserSettings;
  lastActive: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ProfileUpdateDto = Partial<{
  displayName: string;
  bio: string;
  phoneNumber: string;
  settings: Partial<UserSettings>;
}>;