import { findMemberChat, isValidObjectId } from './chatAccess.js';

export { isValidObjectId };

export async function validateChatMembership(chatId: string, userId: string): Promise<any> {
  return findMemberChat(chatId, userId);
}

export function sanitizeText(text: unknown, maxLength: number = 10000): string {
  if (typeof text !== 'string') return '';
  return text.replace(/\0/g, '').trim().slice(0, maxLength);
}
