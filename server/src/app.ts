import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';

import { env } from './config/env.js';
import {
  generalLimiter,
  authLimiter,
  uploadLimiter,
  messageLimiter,
} from './middleware/limiter.js';
import { authRoutes } from './routes/auth.js';
import chatRoutes from './routes/chatRoutes.js';
import User from './models/User.js';
import messageRoutes from './routes/messages.js';
import authenticateToken from './middleware/authenticateToken.js';
import { profileRoutes } from './routes/profileRoutes.js';
import fileRoutes from './routes/files.js';
import logger from './config/logger.js';
import { globalErrorHandler } from './middleware/errorHandler.js';
import { getStatusSnapshot } from './socket/userStatus.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { CORS_ORIGIN } = env;

export function createApp(io: Server): express.Express {
  const app = express();

  app.set('trust proxy', 1);

  app.use(generalLimiter);

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(cors({
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/auth', authLimiter, authRoutes);

  app.use('/uploads', (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  }, express.static(path.join(__dirname, '../uploads')));

  app.use('/uploads/avatars', (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    next();
  }, express.static(path.join(__dirname, '../uploads/avatars')));

  app.use('/media', (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    next();
  }, express.static(path.join(__dirname, '../uploads/media')));

  // Everything registered below this line requires a valid access token.
  app.use(authenticateToken);

  app.get('/users', async (_req: Request, res: Response) => {
    try {
      const users = await User.find({}, '_id username displayName avatar');
      res.json(users);
    } catch (err) {
      logger.error('Error fetching users:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.use('/chats', chatRoutes(io));
  app.use('/messages', messageLimiter, messageRoutes(io));
  app.use('/api/files', uploadLimiter, fileRoutes(io));
  app.use('/api/profile', profileRoutes);

  app.get('/api/users/status', authenticateToken, async (_req: Request, res: Response) => {
    try {
      const users = await User.find(
        { lastActive: { $ne: null } },
        '_id lastActive'
      );

      const statusesObject: Record<string, { lastActive: string; online: boolean }> = {};
      const { onlineUsers, userLastActive } = getStatusSnapshot();

      users.forEach(user => {
        const userId = user._id.toString();

        let lastActiveStr: string;
        try {
          if (user.lastActive instanceof Date && !isNaN(user.lastActive.getTime())) {
            lastActiveStr = user.lastActive.toISOString();
          } else {
            lastActiveStr = new Date().toISOString();
            logger.warn(`Replaced invalid lastActive for user ${userId}`);
          }
        } catch (e) {
          lastActiveStr = new Date().toISOString();
          logger.error(`Error with lastActive for user ${userId}:`, e);
        }

        statusesObject[userId] = {
          lastActive: lastActiveStr,
          online: onlineUsers.has(userId),
        };
      });

      for (const userId of onlineUsers) {
        const lastActive = userLastActive.get(userId);
        if (lastActive) {
          try {
            const testDate = new Date(lastActive);
            if (!isNaN(testDate.getTime())) {
              statusesObject[userId] = {
                lastActive,
                online: true,
              };
            } else {
              statusesObject[userId] = {
                lastActive: new Date().toISOString(),
                online: true,
              };
            }
          } catch {
            statusesObject[userId] = {
              lastActive: new Date().toISOString(),
              online: true,
            };
          }
        }
      }

      res.json(statusesObject);
    } catch (err) {
      logger.error('Error getting user statuses:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.use(globalErrorHandler);

  return app;
}

export default createApp;
