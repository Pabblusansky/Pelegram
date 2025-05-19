import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';

import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { authRoutes } from './routes/auth.js';
import chatRoutes from './routes/chatRoutes.js';
import Message from './models/Message.js';
import Chat from './models/Chat.js';
import User from './models/User.js';
import messageRoutes from './routes/messages.js';
import authenticateToken from './middleware/authenticateToken.js';
import jwt from 'jsonwebtoken';
import { differenceInMinutes } from 'date-fns';
import { profileRoutes } from './routes/profileRoutes.js';
const SECRET_KEY = process.env.SECRET_KEY || 'default_secret';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:4200',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders:['Content-Type', 'Authorization'],
  },
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:4200');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware
app.use(cors({
  origin: 'http://localhost:4200',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

mongoose.connection.on('error', err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

//  Online users implementation
const onlineUserStatuses = new Map();
const onlineUsers = new Set();
const userLastActive = new Map();

function broadcastUserStatuses() {
  const statusesObject = {};
  
  for (const [userId, lastActive] of userLastActive.entries()) {
    let validLastActive = lastActive;
    try {
      const testDate = new Date(lastActive);
      if (isNaN(testDate.getTime())) {
        validLastActive = new Date().toISOString();
        console.warn(`Fixed invalid date for user ${userId}: ${lastActive} -> ${validLastActive}`);
      }
    } catch (e) {
      validLastActive = new Date().toISOString();
      console.error(`Error with date for user ${userId}:`, e);
    }
    
    statusesObject[userId] = {
      lastActive: validLastActive,
      online: onlineUsers.has(userId)
    };
  }
  
  io.emit('user_status_update', statusesObject);
}

function updateUserStatus(userId, isOnline = true) {
  const now = new Date();
  const isoString = now.toISOString();
  
  userLastActive.set(userId, isoString);
  
  if (isOnline === true) {
    onlineUsers.add(userId);
  } else {
    onlineUsers.delete(userId);
  }
  
  console.log(`User ${userId} status updated: online=${isOnline}, lastActive=${isoString}`);
  
  broadcastUserStatuses();
}

function cleanupInactiveUsers() {
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

async function loadInitialUserStatuses() {
  try {
    const users = await User.find(
      { lastActive: { $ne: null } },
      '_id lastActive'
    );
    
    users.forEach(user => {
      userLastActive.set(user._id.toString(), user.lastActive.toISOString());
    });
    
    console.log(`Loaded initial statuses for ${users.length} users`);
  } catch (err) {
    console.error('Error loading initial user statuses:', err);
  }
}

setInterval(cleanupInactiveUsers, 60 * 1000);
loadInitialUserStatuses();

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/Pelegram', {

}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Websocket events
io.on('connection', (socket) => {
  console.log('Connection attempt registered');
  const token = socket.handshake.auth.token;
  if (!token) {
    console.log('No token provided during socket connection');
    return socket.disconnect(true);
  }
  try {
    const decoded = jwt.verify(token, SECRET_KEY); // Decode token
    socket.user = decoded; // Save user data to socket
    console.log(`User connected: ${socket.id}`);
    if (socket.user && socket.user.id) {
      updateUserStatus(socket.user.id, true);
      
      socket.emit('user_status_update', Object.fromEntries(
        Array.from(userLastActive.entries()).map(([userId, lastActive]) => [
          userId, 
          { lastActive, online: onlineUsers.has(userId) }
        ])
      ));
    }
    
  } catch (err) {
    console.error('Error verifying token:', err.message);
    return socket.disconnect(true);
  }

  socket.on('user_activity', () => {
    if (socket.user && socket.user.id) {
      updateUserStatus(socket.user.id, true);
    }
  });

  socket.on('user_logout_attempt', async (data) => { 
    const userId = data && data.userId ? data.userId : (socket.user ? socket.user.id : null);
    if (userId) {
      console.log(`User ${userId} (socket ${socket.id}) is attempting to logout.`);
      updateUserStatus(userId, false); 
      try {
        await User.findByIdAndUpdate(userId, { online: false, lastActive: new Date() });
        const now = new Date().toISOString();
        userLastActive.set(userId.toString(), now);
        onlineUsers.delete(userId.toString());
        broadcastUserStatuses();
        console.log(`User ${userId} status updated to offline due to logout.`);
      } catch (error) {
        console.error(`Error updating user status on logout for ${userId}:`, error);
      }
    }
  });
  socket.on('send_message', async (data) => {
    const { chatId, content } = data;
    const senderId = socket.user.id;
      // Save message to database
      try {
        const sender = await User.findById(senderId);
        if (!sender) {
          console.log('Sender not found');
          return;
        }
        const senderName = sender.username;

        const message = new Message({
            chatId,
            senderId,
            senderName,
            content,
            status: 'sent',
        });
        await message.save();

        // Update chat with last message

        await Chat.findByIdAndUpdate(chatId, {
            $push: { messages: message._id },
            lastMessage: message._id,
            updatedAt: Date.now(),
        });

        // Sending message to all users in chat
        io.to(chatId).emit('receive_message', {
          ...message.toObject(),
          isEditing: false, 
          editedContent: ''
        });
        
        setTimeout(async () => {
          message.status = 'delivered';
          await message.save();
          console.log(`Message ${message._id} status updated to delivered`); 
          io.to(chatId).emit('messageStatusUpdated', { messageId: message._id, status: 'delivered' });
        }, 1000); 
    } catch (err) {
        console.error('Error sending message:', err);
    }
  });
  socket.on('typing', (data) => {
    const { chatId, isTyping } = data;
    const senderId = socket.user.id;
    socket.to(chatId).emit('typing', { 
      chatId, 
      senderId,
      isTyping });
  })

  socket.on('edit_message', async (data) => {
    try {
      const { messageId, content } = data;
      const userId = socket.user.id;
      
      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('edit_error', { error: 'Message not found' });
        return;
      }
      
      if (message.senderId.toString() !== userId) {
        socket.emit('edit_error', { error: 'Not authorized to edit this message' });
        return;
      }
      
      message.content = content;
      message.edited = true;
      message.editedAt = new Date();
      await message.save();
      
      io.to(message.chatId.toString()).emit('message_edited', message);
      
      socket.emit('edit_success', message);
    } catch (err) {
      console.error('Edit message error:', err);
      socket.emit('edit_error', { error: err.message });
    }
  });

  socket.on('logout', () => {
    if (socket.user && socket.user.id) {
      updateUserStatus(socket.user.id, false);
    }
  });

  socket.on('join_chat', (chatId) => {
      socket.join(chatId);
      // console.log(`User ${socket.id} joined chat: ${chatId}`); // This is too noisy because it logs every join(auto-join in chat list is triggering this multiple times)
  });

  socket.on('disconnect', () => {
    if (socket.user && socket.user.id) {
      updateUserStatus(socket.user.id, false);
    }
    // console.log(`User disconnected: ${socket.id}`);
  });
});


// user routes
app.get('/users', async (_req, res) => {
  try {
    const users = await User.find(); // Getting all users
    res.json(users); // Returning all users as JSON
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err });
  }
});

// Mount routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads/avatars', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'uploads/avatars')));

app.use('/api/auth', authRoutes);
app.use(authenticateToken);
app.use('/chats', chatRoutes);
app.use('/messages', messageRoutes(io));
app.use('/api/profile', profileRoutes);

app.get('/api/users/status', authenticateToken, async (req, res) => {
  try {
    const users = await User.find(
      { lastActive: { $ne: null } },
      '_id lastActive'
    );
    
    const statusesObject = {};
    
    users.forEach(user => {
      const userId = user._id.toString();
      
      let lastActiveStr;
      try {
        if (user.lastActive instanceof Date && !isNaN(user.lastActive.getTime())) {
          lastActiveStr = user.lastActive.toISOString();
        } else {
          lastActiveStr = new Date().toISOString();
          console.warn(`Replaced invalid lastActive for user ${userId}`);
        }
      } catch (e) {
        lastActiveStr = new Date().toISOString();
        console.error(`Error with lastActive for user ${userId}:`, e);
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
    console.error('Error getting user statuses:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));