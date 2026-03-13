/**
 * Centralized Mongoose populate configurations.
 * Eliminates duplicated populate chains across route files.
 */

// Common field selections
const USER_FIELDS = '_id username avatar name';
const USER_FIELDS_BASIC = '_id username avatar';
const SENDER_FIELDS = '_id username avatar name';

// --- Message populate patterns ---

/** Populate senderId on a Message */
export const populateMessageSender = { path: 'senderId', select: SENDER_FIELDS };

/** Populate replyTo with nested senderId on a Message */
export const populateMessageReply = {
  path: 'replyTo',
  select: 'content senderName senderId _id messageType filePath',
  populate: { path: 'senderId', select: 'username _id' },
};

/** Standard message population: sender + reply */
export const MESSAGE_POPULATE = [populateMessageSender, populateMessageReply];

// --- Chat populate patterns ---

/** Populate participants on a Chat */
export const populateChatParticipants = { path: 'participants', select: USER_FIELDS };

/** Populate admin on a Chat */
export const populateChatAdmin = { path: 'admin', select: USER_FIELDS };

/** Populate lastMessage with nested senderId on a Chat */
export const populateChatLastMessage = {
  path: 'lastMessage',
  populate: { path: 'senderId', select: SENDER_FIELDS },
};

/** Populate pinnedMessage with nested senderId on a Chat */
export const populateChatPinnedMessage = {
  path: 'pinnedMessage',
  populate: { path: 'senderId', select: SENDER_FIELDS },
};

/** Standard chat population: participants + lastMessage (with sender) */
export const CHAT_POPULATE = [populateChatParticipants, populateChatLastMessage];

/** Group chat population: participants + admin + lastMessage (with sender) */
export const GROUP_CHAT_POPULATE = [populateChatParticipants, populateChatAdmin, populateChatLastMessage];

/** Full chat population: participants + admin + lastMessage + pinnedMessage */
export const FULL_CHAT_POPULATE = [populateChatParticipants, populateChatAdmin, populateChatLastMessage, populateChatPinnedMessage];

// --- Helper functions ---

/**
 * Apply a populate array to a Mongoose query.
 * @param {import('mongoose').Query} query
 * @param {Array} populates - Array of populate configs
 * @returns {import('mongoose').Query}
 */
export function applyPopulate(query, populates) {
  for (const p of populates) {
    query = query.populate(p);
  }
  return query;
}

/**
 * Populate a saved document (post-save).
 * @param {import('mongoose').Document} doc
 * @param {Array} populates - Array of populate configs
 * @returns {Promise<import('mongoose').Document>}
 */
export async function populateDoc(doc, populates) {
  for (const p of populates) {
    await doc.populate(p);
  }
  return doc;
}
