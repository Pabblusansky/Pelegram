import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const updateProfileSchema = z.object({
  displayName: z.string().max(50, 'Display name cannot exceed 50 characters').trim().optional(),
  bio: z.string().max(250, 'Bio cannot exceed 250 characters').optional(),
  phoneNumber: z.union([
    z.string().regex(/^\+?[0-9]{7,14}$/, 'Invalid phone number format'),
    z.literal(''),
  ]).optional(),
  settings: z.object({
    notifications: z.boolean().optional(),
    soundEnabled: z.boolean().optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
  }).optional(),
}).strict();

export const userIdParam = z.object({
  userId: z.string().regex(objectIdRegex, 'Invalid user ID format'),
});
