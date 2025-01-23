export interface User {
  _id: string;
  username: string;
}

export interface Chat {
  _id: string;
  participants: User[];
  lastMessage?: string;
}

export interface Message {
  _id: string;
  chatId: string;
  senderId: string;
  content: string;
  createdAt: Date;
}