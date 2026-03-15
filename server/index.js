import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { fileURLToPath } from 'url';

import {
  generalLimiter,
  authLimiter,
  uploadLimiter,
  messageLimiter
} from './middleware/limiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const SECRET_KEY = process.env.SECRET_KEY || 'default_secret';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/Pelegram';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:4200';

import { authRoutes } from './routes/auth.js';
import chatRoutes from './routes/chatRoutes.js';
import User from './models/User.js';
import messageRoutes from './routes/messages.js';
import authenticateToken from './middleware/authenticateToken.js';
import { profileRoutes } from './routes/profileRoutes.js';
import fileRoutes from './routes/files.js';
import logger from './config/logger.js';
import { globalErrorHandler } from './middleware/errorHandler.js';
import { initUserStatus, getStatusSnapshot, updateUserStatus } from './socket/userStatus.js';
import { registerSocketHandlers } from './socket/socketHandlers.js';

const app = express();

app.set('trust proxy', 1);

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
});

app.use(generalLimiter);

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(cors({
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

mongoose.connection.on('error', err => {
  logger.error('MongoDB connection error:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Initialize user status tracking and connect to MongoDB
initUserStatus(io);

mongoose.connect(MONGO_URI, {
}).then(() => logger.info('MongoDB connected successfully.'))
  .catch(err => logger.error('FATAL: MongoDB connection error:', err));

// --- Socket.IO ---
io.on('connection', (socket) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return socket.disconnect(true);
  }
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    socket.user = decoded;
    if (socket.user && socket.user.id) {
      socket.join(socket.user.id.toString());
      updateUserStatus(socket.user.id, true);
    }
  } catch (err) {
    logger.error('Error verifying token:', err.message);
    return socket.disconnect(true);
  }

  registerSocketHandlers(io, socket);
});

// --- REST Routes ---
app.get('/users', async (_req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err });
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/auth', authLimiter, authRoutes);

app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
}, express.static(path.join(__dirname, 'uploads')));

app.use('/uploads/avatars', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  next();
}, express.static(path.join(__dirname, 'uploads/avatars')));

app.use('/media', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  next();
}, express.static(path.join(__dirname, 'uploads/media')));

app.use(authenticateToken);

app.use('/chats', chatRoutes(io));
app.use('/messages', messageLimiter, messageRoutes(io));
app.use('/api/files', uploadLimiter, fileRoutes(io));
app.use('/api/profile', profileRoutes);

app.get('/api/users/status', authenticateToken, async (req, res) => {
  try {
    const users = await User.find(
      { lastActive: { $ne: null } },
      '_id lastActive'
    );

    const statusesObject = {};
    const { onlineUsers, userLastActive } = getStatusSnapshot();

    users.forEach(user => {
      const userId = user._id.toString();

      let lastActiveStr;
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
        online: onlineUsers.has(userId)
      };
    });

    for (const userId of onlineUsers) {
      const lastActive = userLastActive.get(userId);
      if (lastActive) {
        try {
          const testDate = new Date(lastActive);
          if (!isNaN(testDate.getTime())) {
            statusesObject[userId] = {
              lastActive: lastActive,
              online: true
            };
          } else {
            statusesObject[userId] = {
              lastActive: new Date().toISOString(),
              online: true
            };
          }
        } catch (e) {
          statusesObject[userId] = {
            lastActive: new Date().toISOString(),
            online: true
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

// Catch-all error middleware (must be after all routes)
app.use(globalErrorHandler);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => logger.info(`Server running on http://localhost:${PORT}`));
