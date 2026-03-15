import { Query, Document, PopulateOptions } from 'mongoose';

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

export function applyPopulate<T>(query: Query<T, Document>, populates: PopulateOptions[]): Query<T, Document> {
  for (const p of populates) {
    query = query.populate(p);
  }
  return query;
}

export async function populateDoc<T extends Document>(doc: T, populates: PopulateOptions[]): Promise<T> {
  for (const p of populates) {
    await doc.populate(p);
  }
  return doc;
}
