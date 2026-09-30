import { findMemberChat, isValidObjectId } from './chatAccess.js';
import type { IChat } from '../models/Chat.js';

export { isValidObjectId };

export async function validateChatMembership(chatId: string, userId: string): Promise<IChat | null> {
  return findMemberChat(chatId, userId);
}

export function sanitizeText(text: unknown, maxLength: number = 10000): string {
  if (typeof text !== 'string') return '';
  return text.replace(/\0/g, '').trim().slice(0, maxLength);
}
