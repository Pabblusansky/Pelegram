import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });
const SECRET_KEY = process.env.SECRET_KEY || 'default_secret';
import { authRoutes } from './routes/auth.js';
import chatRoutes from './routes/chatRoutes.js';
import Message from './models/Message.js';
import Chat from './models/Chat.js';
import User from './models/User.js';
import messageRoutes from './routes/messages.js';
import authenticateToken from './middleware/authenticateToken.js';
import { differenceInMinutes } from 'date-fns';
import { profileRoutes } from './routes/profileRoutes.js';
import  fileRoutes from './routes/files.js';

const app = express();

const httpServer = createServer(app);

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
  
  // console.log(`User ${userId} status updated: online=${isOnline}, lastActive=${isoString}`);
  
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
      const userRoom = socket.user.id.toString();
      socket.join(userRoom);
      console.log(`Socket ${socket.id} for user ${socket.user.id} joined personal room: ${userRoom}`);
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
  socket.on('send_message', async (data, callback) => {
    const { chatId, content, replyTo, fileInfo, messageType= 'text' } = data;
    const senderId = socket.user.id;
      // Save message to database
    try {
      const sender = await User.findById(senderId).select('username avatar').lean(); 
      if (!sender) {
        console.log('Sender not found');
        if (typeof callback === 'function') callback({ success: false, error: 'Sender not found' });
        return;
      }

      const chatBeforeMessage = await Chat.findById(chatId);
      if (!chatBeforeMessage) {
        console.error(`Error sending message: Chat with ID ${chatId} not found.`);
        if (typeof callback === 'function') callback({ success: false, error: 'Chat not found' });
        return;
      }
      const isFirstMessageInChat = chatBeforeMessage.messages.length === 0;


      const message = new Message({
          chatId,
          senderId,
          senderName: sender.username,
          content,
          status: 'sent',
          messageType: messageType,
          filePath: fileInfo ? fileInfo.filePath : null,
          fileName: fileInfo ? fileInfo.fileName : null,
          fileSize: fileInfo ? fileInfo.fileSize : null,
          fileMimeType: fileInfo ? fileInfo.fileMimeType : null,
          fileOriginalName: fileInfo ? fileInfo.fileOriginalName : null,
          fileThumbnailPath: fileInfo ? fileInfo.thumbnailPath : null,
      });

      if (replyTo && replyTo._id) {
        message.replyTo = {
          _id: replyTo._id,
          senderName: replyTo.senderName,
          content: replyTo.content,
          senderId: replyTo.senderId
        };
      }
      
      await message.save();

      chatBeforeMessage.lastMessage = message._id;
      chatBeforeMessage.updatedAt = new Date();
      
      if (chatBeforeMessage.participants && Array.isArray(chatBeforeMessage.unreadCounts)) {
        chatBeforeMessage.participants.forEach(participantObjectId => {
          const participantIdString = participantObjectId.toString();
          if (participantIdString !== senderId.toString()) {
            let unreadEntry = chatBeforeMessage.unreadCounts.find(uc => 
              uc.userId.toString() === participantIdString
            );
            
            if (unreadEntry) {
              unreadEntry.count = (unreadEntry.count || 0) + 1;
            } else {
              chatBeforeMessage.unreadCounts.push({ 
                userId: participantObjectId, 
                count: 1 
              });
            }
          }
        });
      }

      await chatBeforeMessage.save();

      const messageForClient = {
        ...message.toObject(),
        senderAvatar: sender.avatar 
          ? `${process.env.BASE_URL || 'http://localhost:3000'}${sender.avatar}` 
          : null
      };
      if (messageForClient.replyTo && messageForClient.replyTo.senderId) {
        const originalSenderForReply = await User.findById(messageForClient.replyTo.senderId).select('avatar').lean();
        messageForClient.replyTo.senderAvatar = originalSenderForReply?.avatar
            ? `${process.env.BASE_URL || 'http://localhost:3000'}${originalSenderForReply.avatar}`
            : null;
      }

      io.to(chatId).emit('receive_message', messageForClient);
      console.log('Emitted receive_message with senderAvatar:', messageForClient.senderAvatar, 'and replyTo:', messageForClient.replyTo);

      const updatedChat = await Chat.findById(
        chatId, 
      )
        .populate('participants', '_id username avatar')
        .populate({
          path: 'lastMessage',
          populate: { path: 'senderId', select: '_id username avatar' }
        })
        .lean();
      if (updatedChat) {
        if (updatedChat.lastMessage && updatedChat.lastMessage.senderId && typeof updatedChat.lastMessage.senderId === 'object') {
          const lmSender = updatedChat.lastMessage.senderId;
          updatedChat.lastMessage.senderAvatar = lmSender.avatar
            ? `${process.env.BASE_URL || 'http://localhost:3000'}${lmSender.avatar}`
            : null;
        }
        io.to(chatId).emit('chat_updated', updatedChat);
      }

      if (isFirstMessageInChat && updatedChat) {
        console.log(`Chat ${chatId} is being "activated" for participants due to the first message.`);

        updatedChat.participants.forEach(participant => {
          if (participant && participant._id) {
            io.to(participant._id.toString()).emit('new_chat_created', updatedChat); 
            console.log(`Emitted 'new_chat_created' to participant ${participant._id.toString()} for chat ${chatId} after first message.`);
          }
        });
      }
      if (typeof callback === 'function') {
        callback({ success: true, message: messageForClient })
      };
      setTimeout(async () => {
        const msgToUpdate = await Message.findById(message._id);
        if (msgToUpdate) {
          msgToUpdate.status = 'delivered';
          await msgToUpdate.save();
          io.to(chatId).emit('messageStatusUpdated', { messageId: msgToUpdate._id, status: 'delivered' });
        }
      }, 1000);
    } catch (err) {
        console.error('Error sending message:', err);
        if (typeof callback === 'function') {
          callback({ success: false, error: err.message || 'Server error while sending message' });
        }
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

  socket.on('toggle_reaction', async ({ messageId, reactionType }) => {
    if (!socket.user || !socket.user.id) {
      socket.emit('reaction_error', { messageId, error: 'User not authenticated for reaction.' });
      return;
    }

    const userId = socket.user.id;

    try {
      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('reaction_error', { messageId, error: 'Message not found.' });
        return;
      }

      const existingReactionIndex = message.reactions.findIndex(
        (r) => r.userId.toString() === userId.toString()
      );

      let reactionChanged = false;

      if (existingReactionIndex !== -1) {
        if (message.reactions[existingReactionIndex].reaction === reactionType) {
          message.reactions.splice(existingReactionIndex, 1);
          reactionChanged = true;
        } else {
          message.reactions[existingReactionIndex].reaction = reactionType;
          reactionChanged = true;
        }
      } else {
        message.reactions.push({ userId, reaction: reactionType });
        reactionChanged = true;
      }

      if (reactionChanged) {
        await message.save();
        io.to(message.chatId.toString()).emit('message_reaction_updated', {
          messageId: message._id,
          reactions: message.reactions, 
        });
      }
    } catch (error) {
      console.error('Error toggling reaction:', error);
      socket.emit('reaction_error', { messageId, error: 'Server error processing reaction.' });
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
app.use('/api/auth', authRoutes);

app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:4200');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
}, express.static(path.join(__dirname, 'uploads')));


app.use('/media', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:4200');
  next();
}, express.static(path.join(__dirname, 'uploads/media')));
app.use(authenticateToken);
app.use('/chats', chatRoutes(io));
app.use('/messages', messageRoutes(io));
app.use('/api/files', fileRoutes(io));
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