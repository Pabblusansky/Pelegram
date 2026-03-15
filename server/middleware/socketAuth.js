import Chat from '../models/Chat.js';
import mongoose from 'mongoose';
import logger from '../config/logger.js';


export function isValidObjectId(id) {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);
}

export async function validateChatMembership(chatId, userId) {
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


export function sanitizeText(text, maxLength = 10000) {
  if (typeof text !== 'string') return '';
  return text.replace(/\0/g, '').trim().slice(0, maxLength);
}
