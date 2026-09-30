import { Query, Document, PopulateOptions, Types } from 'mongoose';
import type { IChat } from '../models/Chat.js';

const USER_FIELDS = '_id username avatar name';
const SENDER_FIELDS = '_id username avatar name';

export const populateMessageSender: PopulateOptions = { path: 'senderId', select: SENDER_FIELDS };

export const populateMessageReply: PopulateOptions = {
  path: 'replyTo',
  select: 'content senderName senderId _id messageType filePath',
  populate: { path: 'senderId', select: 'username _id' },
};

export const MESSAGE_POPULATE: PopulateOptions[] = [populateMessageSender, populateMessageReply];

export const populateChatParticipants: PopulateOptions = { path: 'participants', select: USER_FIELDS };

export const populateChatAdmin: PopulateOptions = { path: 'admin', select: USER_FIELDS };

export const populateChatLastMessage: PopulateOptions = {
  path: 'lastMessage',
  populate: { path: 'senderId', select: SENDER_FIELDS },
};

export const populateChatPinnedMessage: PopulateOptions = {
  path: 'pinnedMessage',
  populate: { path: 'senderId', select: SENDER_FIELDS },
};

export const CHAT_POPULATE: PopulateOptions[] = [populateChatParticipants, populateChatLastMessage];

export const GROUP_CHAT_POPULATE: PopulateOptions[] = [populateChatParticipants, populateChatAdmin, populateChatLastMessage];

export const FULL_CHAT_POPULATE: PopulateOptions[] = [populateChatParticipants, populateChatAdmin, populateChatLastMessage, populateChatPinnedMessage];

// Returns the same query type it was given, so callers keep the model's
// result type (a Message query stays a Message query).
export function applyPopulate<Q extends Query<unknown, unknown>>(query: Q, populates: PopulateOptions[]): Q {
  for (const p of populates) {
    query = query.populate(p) as Q;
  }
  return query;
}

export async function populateDoc<T extends Document>(doc: T, populates: PopulateOptions[]): Promise<T> {
  for (const p of populates) {
    await doc.populate(p);
  }
  return doc;
}

/** A participant or admin as selected by USER_FIELDS. */
export interface PopulatedUser {
  _id: Types.ObjectId;
  username: string;
  avatar?: string | null;
  name?: string;
}

/** A chat whose participants have been populated with USER_FIELDS. */
export type PopulatedChat = Omit<IChat, 'participants'> & { participants: PopulatedUser[] };

/**
 * Runs a chat query with the given populates and types the result.
 * Mongoose cannot infer the shape a runtime populate list produces, so the
 * cast lives here, next to the populate definitions it depends on, instead
 * of as an `any` at every call site.
 */
export async function findPopulatedChat(
  query: Query<unknown, unknown>,
  populates: PopulateOptions[]
): Promise<PopulatedChat | null> {
  return (await applyPopulate(query, populates)) as unknown as PopulatedChat | null;
}
