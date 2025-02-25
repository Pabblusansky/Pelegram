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

const SECRET_KEY = process.env.SECRET_KEY || 'default_secret';

dotenv.config();

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
  } catch (err) {
    console.error('Error verifying token:', err.message);
    return socket.disconnect(true);
  }

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

  socket.on('join_chat', (chatId) => {
      socket.join(chatId);
      console.log(`User ${socket.id} joined chat: ${chatId}`);
  });

  socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
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
app.use('/api/auth', authRoutes);
app.use(authenticateToken);
app.use('/chats', chatRoutes);
app.use('/messages', messageRoutes(io));

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));