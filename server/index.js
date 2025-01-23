import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { authRoutes } from './routes/auth.js';
import chatRoutes from './routes/chatRoutes.js';
import Message from './models/Message.js';
import Chat from './models/Chat.js';
import User from './models/User.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
app.options('*', cors()); // Enable pre-flight
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:4200',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders:['Content-Type', 'Authorization'],
  },
});
// Middleware
app.use(cors({
  origin: 'http://localhost:4200', // Allow requests from this origin
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allow these methods
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(bodyParser.json());

// Conectare MongoDB
mongoose.connect('mongodb://localhost:27017/Pelegram', {

}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Websocket events
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('send_message', async (data) => {
      const { chatId, senderId, content } = data;

      // Save message to database
      const message = new Message({
          chatId,
          senderId,
          content,
      });
      await message.save();

      // Update chat with last message
      await Chat.findByIdAndUpdate(chatId, {
          lastMessage: message._id,
          updatedAt: Date.now(),
      });

      // Sending message to all users in chat
      io.to(chatId).emit('receive_message', message);
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

// Mount auth routes
app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));