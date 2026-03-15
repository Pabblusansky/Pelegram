import { Server } from 'socket.io';
import { differenceInMinutes } from 'date-fns';
import User from '../models/User.js';
import logger from '../config/logger.js';

const onlineUsers = new Set<string>();
const userLastActive = new Map<string, string>();

let ioInstance: Server | null = null;

export function initUserStatus(io: Server): void {
  ioInstance = io;
  loadInitialUserStatuses();
  setInterval(cleanupInactiveUsers, 60 * 1000);
}

export function broadcastUserStatuses(): void {
  if (!ioInstance) return;

  const statusesObject: Record<string, { lastActive: string; online: boolean }> = {};

  for (const [userId, lastActive] of userLastActive.entries()) {
    let validLastActive = lastActive;
    try {
      const testDate = new Date(lastActive);
      if (isNaN(testDate.getTime())) {
        validLastActive = new Date().toISOString();
        logger.warn(`Fixed invalid date for user ${userId}: ${lastActive} -> ${validLastActive}`);
      }
    } catch (e) {
      validLastActive = new Date().toISOString();
      logger.error(`Error with date for user ${userId}:`, e);
    }

    statusesObject[userId] = {
      lastActive: validLastActive,
      online: onlineUsers.has(userId),
    };
  }

  ioInstance.emit('user_status_update', statusesObject);
}

export function updateUserStatus(userId: string, isOnline: boolean = true): void {
  const now = new Date();
  const isoString = now.toISOString();

  userLastActive.set(userId, isoString);

  if (isOnline) {
    onlineUsers.add(userId);
  } else {
    onlineUsers.delete(userId);
  }

  broadcastUserStatuses();
}

export function getStatusSnapshot(): { onlineUsers: Set<string>; userLastActive: Map<string, string> } {
  return { onlineUsers, userLastActive };
}

function cleanupInactiveUsers(): void {
  const now = new Date();
  const inactiveThreshold = 5;

  let hasChanges = false;

  for (const userId of onlineUsers) {
    const lastActive = userLastActive.get(userId);
    if (lastActive) {
      const lastActiveDate = new Date(lastActive);
      if (differenceInMinutes(now, lastActiveDate) >= inactiveThreshold) {
        onlineUsers.delete(userId);
        hasChanges = true;
      }
    }
  }

  if (hasChanges) {
    broadcastUserStatuses();
  }
}

async function loadInitialUserStatuses(): Promise<void> {
  try {
    const users = await User.find(
      { lastActive: { $ne: null } },
      '_id lastActive'
    );

    users.forEach(user => {
      userLastActive.set(user._id.toString(), user.lastActive.toISOString());
    });

    logger.info(`Loaded initial statuses for ${users.length} users`);
  } catch (err) {
    logger.error('Error loading initial user statuses:', err);
  }
}
