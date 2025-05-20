export interface User {
  _id: string;
  username: string;
}

export interface Chat {
  _id: string;
  participants: User[];
  messages: string[];
  lastMessage?: string;
}

export interface Message {
  _id?: string;
  chatId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
  createdAt?: Date;
  status?: string;

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

  replyTo?: {
    _id: string;
    senderName: string;
    content: string;
    senderId?: string;
  }
}