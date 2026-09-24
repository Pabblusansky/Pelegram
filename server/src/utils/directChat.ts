import Chat, { IChat } from '../models/Chat.js';

export function directChatKey(userA: string, userB: string): string {
  return [userA.toString(), userB.toString()].sort().join(':');
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

/**
 * Looks up the one-to-one chat between two users without creating one.
 * Falls back to chats created before directKey existed.
 */
export async function findDirectChat(userA: string, userB: string): Promise<IChat | null> {
  const directKey = directChatKey(userA, userB);
  const keyed = await Chat.findOne({ directKey });
  if (keyed) return keyed;
  return Chat.findOne({
    isGroupChat: false,
    participants: { $all: [userA, userB], $size: 2 },
    directKey: { $exists: false },
  }).sort({ updatedAt: -1 });
}

/**
 * Returns the one-to-one chat between two users, creating it if needed.
 *
 * The unique index on directKey is what makes this safe under concurrency:
 * when two requests race, one insert wins and the other lands on the
 * duplicate key error and re-reads the winner. Chats created before
 * directKey existed are adopted by stamping the key onto them.
 */
export async function findOrCreateDirectChat(
  initiatorId: string,
  recipientId: string
): Promise<{ chat: IChat; created: boolean }> {
  const directKey = directChatKey(initiatorId, recipientId);
  const participants = [initiatorId, recipientId].sort();

  const existing = await Chat.findOne({ directKey });
  if (existing) return { chat: existing, created: false };

  try {
    const legacy = await Chat.findOneAndUpdate(
      {
        isGroupChat: false,
        participants: { $all: participants, $size: 2 },
        directKey: { $exists: false },
      },
      { $set: { directKey } },
      { returnDocument: 'after', sort: { updatedAt: -1 } }
    );
    if (legacy) return { chat: legacy, created: false };

    const chat = await Chat.create({
      isGroupChat: false,
      participants: [initiatorId, recipientId],
      directKey,
      unreadCounts: participants.map(userId => ({ userId, count: 0 })),
    });
    return { chat, created: true };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const winner = await Chat.findOne({ directKey });
    if (!winner) throw error;
    return { chat: winner, created: false };
  }
}
