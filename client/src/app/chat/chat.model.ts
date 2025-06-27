export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'link';
export type MessageContentCategory = 'user_content' | 'system_event'

export interface User {
  _id: string;
  username: string;
  avatar?: string;
  name?: string;
}

export interface Reaction {
  userId: string;
  username?: string;
  reaction: string;
  createdAt?: string | Date;
}

export interface UnreadCount {
  userId: string;
  count: number;
}

export interface Chat {
  _id: string;
  name?: string;
  isGroupChat?: boolean;
  participants: User[];
  admin?: User | string;
  groupAvatar?: string | null;
  messages: string[];
  unreadCounts: UnreadCount[];
  lastMessage?: Message | string;
  pinnedMessage?: Message | string | null;
  displayAvatarUrl?: string;
  participantsString?: string;
  isSelfChat?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;

  participantIds?: string[];
}

export interface Message {
  mediaLoaded: boolean;
  _id?: string;
  chatId: string;
  senderId: string | User;
  senderName: string;
  content: string;
  timestamp: string;
  createdAt?: Date;
  status?: string;
  senderAvatar?: string | null;
  category?: MessageContentCategory;

  edited?: boolean;
  editedAt?: Date;

  isEditing?: boolean;
  editedContent?: string;

  ismyMessage?: boolean;
  editedRecently?: boolean;

  forwarded?: boolean;
  originalMessageId?: string;
  originalSenderId?: string;
  originalSenderName?: string;

  mediaLoadError?: boolean;

  reactions?: Reaction[];
  
  // File-related properties
  messageType?: MessageType;
  filePath?: string;
  originalFileName?: string;
  fileMimeType?: string;
  fileSize?: number;

  // Search-related properties
  isSearchResult?: boolean;
  isCurrentSearchResult?: boolean;
  
  replyTo?: {
    _id: string;
    senderName: string;
    content: string;
    senderId?: string;
  }
  isSelected?: boolean;
}