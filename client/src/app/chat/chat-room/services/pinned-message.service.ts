import { Injectable } from '@angular/core';
import { Message } from '../../chat.model';

@Injectable({ providedIn: 'root' })
export class PinnedMessageService {
  resolve(
    pinned: unknown,
    messages: Message[],
    findElsewhere: (id: string) => Message | null = () => null
  ): Message | null {
    if (!pinned) {
      return null;
    }

    if (typeof pinned === 'object' && (pinned as { _id?: string })._id) {
      return pinned as Message;
    }

    if (typeof pinned === 'string') {
      return messages.find(m => m._id === pinned) ?? findElsewhere(pinned);
    }

    return null;
  }

  canUnpin(isGroupChat: boolean, admin: unknown, userId: string | null): boolean {
    if (!isGroupChat) {
      return true;
    }
    if (!userId) {
      return false;
    }
    return this.adminIds(admin).includes(userId);
  }

  private adminIds(admin: unknown): string[] {
    if (!admin) {
      return [];
    }

    const entries = Array.isArray(admin) ? admin : [admin];

    return entries
      .map(entry => {
        if (typeof entry === 'string') return entry;
        return (entry as { _id?: string })?._id;
      })
      .filter((id): id is string => !!id);
  }
}
