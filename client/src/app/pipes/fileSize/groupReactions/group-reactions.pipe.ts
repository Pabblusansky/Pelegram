import { Pipe, PipeTransform } from '@angular/core';
import { Reaction } from '../../../chat/chat.model';

export interface GroupedReaction {
  type: string;
  count: number;
  reactedByMe: boolean;
  userIds: string[];
}

@Pipe({
  name: 'groupReactions',
  standalone: true,
  pure: true
})
export class GroupReactionsPipe implements PipeTransform {
  transform(reactions: Reaction[] | undefined, currentUserId: string | null): GroupedReaction[] {
    if (!reactions || reactions.length === 0 || !currentUserId) {
      return [];
    }

    const groups: { [key: string]: { count: number; userIds: string[] } } = {};
    reactions.forEach(r => {
      if (!r.reaction || !r.userId) {
        console.warn('GroupReactionsPipe: Skipping reaction with missing type or userId:', r);
        return;
      }
      if (!groups[r.reaction]) {
        groups[r.reaction] = { count: 0, userIds: [] };
      }
      groups[r.reaction].count++;
      groups[r.reaction].userIds.push(r.userId);
    });

    return Object.keys(groups).map(reactionType => ({
      type: reactionType,
      count: groups[reactionType].count,
      reactedByMe: groups[reactionType].userIds.includes(currentUserId),
      userIds: groups[reactionType].userIds
    }));
  }
}