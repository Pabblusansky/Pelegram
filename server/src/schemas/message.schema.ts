import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdRegex, 'Invalid ID format');

export const sendMessageSchema = z.object({
  chatId: objectId,
  content: z.string().min(1, 'Content is required'),
});

export const forwardMessageSchema = z.object({
  targetChatId: objectId,
});

export const forwardMultipleSchema = z.object({
  messageIds: z.array(objectId).min(1, 'At least one message ID is required'),
  targetChatId: objectId,
});

export const deleteMultipleSchema = z.object({
  messageIds: z.array(objectId).min(1, 'Message IDs are required'),
});

export const editMessageSchema = z.object({
  content: z.string().min(1, 'Content is required'),
});

export const chatIdParam = z.object({
  chatId: objectId,
});

export const messageIdParam = z.object({
  id: objectId,
});

export const messageForwardParam = z.object({
  messageId: objectId,
});

export const contextParam = z.object({
  chatId: objectId,
  messageId: objectId,
});

export const searchQuerySchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  page: z.coerce.number().int().min(1).optional().default(1),
});

export const messagesQuerySchema = z.object({
  before: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});
