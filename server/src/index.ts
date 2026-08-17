import express from 'express';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { createServer } from 'http';

import { env } from './config/env.js';
import { configureApp } from './app.js';
import logger from './config/logger.js';
import { initUserStatus, updateUserStatus } from './socket/userStatus.js';
import { registerSocketHandlers } from './socket/socketHandlers.js';
import type { AuthUser } from './middleware/authenticateToken.js';

const { SECRET_KEY, MONGO_URI, CORS_ORIGIN, PORT } = env;

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
});

configureApp(app, io);

mongoose.connection.on('error', (err: Error) => {
  logger.error('MongoDB connection error:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

initUserStatus(io);

mongoose.connect(MONGO_URI)
  .then(() => logger.info('MongoDB connected successfully.'))
  .catch((err: Error) => logger.error('FATAL: MongoDB connection error:', err));

io.on('connection', (socket) => {
  const token = socket.handshake.auth.token as string | undefined;
  if (!token) {
    socket.disconnect(true);
    return;
  }
  try {
    const decoded = jwt.verify(token, SECRET_KEY) as AuthUser;
    (socket as any).user = decoded;
    if (decoded.id) {
      socket.join(decoded.id.toString());
      updateUserStatus(decoded.id, true);
    }
  } catch (err) {
    logger.error('Error verifying token:', (err as Error).message);
    socket.disconnect(true);
    return;
  }

  registerSocketHandlers(io, socket as any);
});

httpServer.listen(PORT, () => logger.info(`Server running on http://localhost:${PORT}`));
