import { Injectable } from '@angular/core';
import { Message, Reaction } from '../../chat.model';

export interface GroupedReaction {
  type: string;
  count: number;
  reactedByMe: boolean;
  userIds: string[];
}

const STATUS_RANK: { [key: string]: number } = { sent: 1, delivered: 2, read: 3 };

/**
 * Pure helpers over the message list. These deliberately return values rather than
 * mutating component state, so ordering and change detection stay with the caller.
 */
@Injectable({ providedIn: 'root' })
export class MessageListService {
  /** Status only ever moves forward: sent -> delivered -> read. */
  newerStatus(oldStatus: string | undefined, newStatus: string | undefined): string | undefined {
    const oldRank = oldStatus ? STATUS_RANK[oldStatus] || 0 : 0;
    const newRank = newStatus ? STATUS_RANK[newStatus] || 0 : 0;
    return oldRank > newRank ? oldStatus : newStatus;
  }

  groupReactions(reactions: Reaction[] | undefined, userId: string | null): GroupedReaction[] {
    if (!reactions || reactions.length === 0) {
      return [];
    }

    const groups: { [key: string]: string[] } = {};
    reactions.forEach(r => {
      if (!groups[r.reaction]) {
        groups[r.reaction] = [];
      }
      groups[r.reaction].push(r.userId);
    });

    return Object.keys(groups).map(type => ({
      type,
      count: groups[type].length,
      reactedByMe: !!userId && groups[type].includes(userId),
      userIds: groups[type],
    }));
  }

  /** Incoming messages not already present, stamped with ownership. */
  selectNewMessages(existing: Message[], incoming: Message[], userId: string | null): Message[] {
    const existingIds = new Set(existing.map(m => m._id));

    return incoming
      .filter(nm => nm._id && !existingIds.has(nm._id))
      .map(nm => ({
        ...nm,
        ismyMessage: this.resolveSenderId(nm) === userId,
      }));
  }

  private resolveSenderId(message: Message): string | undefined {
    const sender = message.senderId as unknown;
    if (sender && typeof sender === 'object' && (sender as { _id?: string })._id) {
      return (sender as { _id: string })._id;
    }
    return typeof sender === 'string' ? sender : undefined;
  }
}
