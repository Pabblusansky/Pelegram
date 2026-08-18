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

const { CORS_ORIGIN, TRUST_PROXY } = env;

/**
 * Registers middleware and routes on an existing app.
 *
 * index.ts must hand the app to createServer() before Socket.IO attaches to
 * that server, because attach() captures the request listeners already present
 * and delegates non-socket traffic to them. An app added afterwards runs in
 * addition to Socket.IO rather than behind it, and both write to the same
 * response.
 */
export function configureApp(app: express.Express, io: Server): express.Express {
  app.set('trust proxy', TRUST_PROXY);

  app.use(generalLimiter);

  // A single source of truth for CORS. A hand-rolled header block used to run
  // ahead of cors() and answered every preflight with 200 regardless of the
  // request Origin; cors() already handles preflight and only emits the
  // allow-origin header for the configured origin.
  app.use(cors({
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/auth', authLimiter, authRoutes);

  /**
   * User-supplied bytes are served from the API origin, so every upload mount
   * gets the same treatment: no MIME sniffing, and a CSP that neutralises any
   * active content that still manages to be served as a document.
   */
  const uploadHeaders = (req: express.Request, res: Response, next: express.NextFunction): void => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  };

  const staticOptions = { dotfiles: 'deny', index: false } as const;

  app.use('/uploads', uploadHeaders, express.static(path.join(__dirname, '../uploads'), staticOptions));

  app.use('/uploads/avatars', uploadHeaders, express.static(path.join(__dirname, '../uploads/avatars'), staticOptions));

  app.use('/media', uploadHeaders, express.static(path.join(__dirname, '../uploads/media'), staticOptions));

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

export function createApp(io: Server): express.Express {
  return configureApp(express(), io);
}

export default createApp;
