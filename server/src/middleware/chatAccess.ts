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

export function isChatAdmin(chat: IChat, userId: string): boolean {
  const admin = chat.admin as unknown;
  if (Array.isArray(admin)) {
    return admin.some((adminId) => adminId.toString() === userId);
  }
  return !!admin && (admin as { toString(): string }).toString() === userId;
}

export function requireGroupAdmin(action: string, param: string = 'chatId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const chatId = req.params[param];
    if (!isValidObjectId(chatId)) {
      res.status(404).json({ message: 'Group chat not found.' });
      return;
    }

    let chat: IChat | null;
    try {
      chat = await Chat.findById(chatId);
    } catch (err) {
      logger.error('requireGroupAdmin error:', err);
      res.status(500).json({ message: 'Server error' });
      return;
    }

    if (!chat) {
      res.status(404).json({ message: 'Group chat not found.' });
      return;
    }

    if (!chat.isGroupChat) {
      res.status(400).json({ message: 'This is not a group chat.' });
      return;
    }

    if (!isChatAdmin(chat, req.user!.id)) {
      res.status(403).json({ message: `Only the group admin can ${action}.` });
      return;
    }

    req.chat = chat;
    next();
  };
}
