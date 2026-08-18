import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Chat, { IChat } from '../models/Chat.js';
import logger from '../config/logger.js';

declare global {
  namespace Express {
    interface Request {
      chat?: IChat;
    }
  }
}

export function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);
}

export async function findMemberChat(
  chatId: unknown,
  userId: unknown
): Promise<IChat | null> {
  if (!isValidObjectId(chatId) || !isValidObjectId(userId)) {
    return null;
  }
  try {
    return await Chat.findOne({ _id: chatId, participants: userId });
  } catch (err) {
    logger.error('findMemberChat error:', err);
    return null;
  }
}

export function requireChatMembership(param: string = 'chatId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const chat = await findMemberChat(req.params[param], req.user?.id);
    if (!chat) {
      res.status(403).json({ message: 'Access denied or chat not found' });
      return;
    }
    req.chat = chat;
    next();
  };
}
