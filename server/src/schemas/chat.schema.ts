import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdRegex, 'Invalid ID format');

export const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required').trim(),
  participants: z.array(objectId).min(1, 'At least one other participant is required'),
});

export const addParticipantsSchema = z.object({
  participantIds: z.array(objectId).min(1, 'No participants provided to add'),
});

export const updateGroupNameSchema = z.object({
  name: z.string().min(1, 'Group name cannot be empty').trim(),
});

export const createDirectChatSchema = z.object({
  recipientId: objectId,
});

export const chatIdParam = z.object({
  chatId: objectId,
});

export const chatIdWithParticipantParam = z.object({
  chatId: objectId,
  participantId: objectId,
});

export const pinMessageParam = z.object({
  chatId: objectId,
  messageId: objectId,
});

export const mediaQuerySchema = z.object({
  type: z.enum(['images', 'videos', 'documents', 'all']).optional().default('images'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
  page: z.coerce.number().int().min(1).optional().default(1),
});

export const searchQuerySchema = z.object({
  query: z.string().min(1, 'Query parameter is required'),
});
