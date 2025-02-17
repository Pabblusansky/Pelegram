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
}