import mongoose from 'mongoose';
import Chat from '../models/Chat.js';
import logger from '../config/logger.js';
import type { IChat } from '../models/Chat.js';

export function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);
}

export async function validateChatMembership(chatId: string, userId: string): Promise<any> {
  if (!isValidObjectId(chatId) || !isValidObjectId(userId)) {
    return null;
  }
  try {
    return await Chat.findOne({ _id: chatId, participants: userId }).lean();
  } catch (err) {
    logger.error('validateChatMembership error:', err);
    return null;
  }
}

export function sanitizeText(text: unknown, maxLength: number = 10000): string {
  if (typeof text !== 'string') return '';
  return text.replace(/\0/g, '').trim().slice(0, maxLength);
}
