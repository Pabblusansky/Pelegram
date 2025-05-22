export interface User {
  _id: string;
  username: string;
}

export interface Reaction {
  userId: string;
  username?: string;
  reaction: string;
  createdAt?: string | Date;
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


  reactions?: Reaction[];
  
  replyTo?: {
    _id: string;
    senderName: string;
    content: string;
    senderId?: string;
  }
}