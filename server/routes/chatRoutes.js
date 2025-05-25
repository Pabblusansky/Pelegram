import express from 'express';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import authenticateToken from '../middleware/authenticateToken.js';
import User from '../models/User.js';
import mongoose from 'mongoose'; 

export default (io) => {
  const router = express.Router();
  router.get('/search', authenticateToken, async (req, res) => {
      const { query } = req.query;
      
      if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
      }
    
      try {
        const users = await User.find({
          username: { $regex: query, $options: 'i' } 
        }).limit(10);
    
        res.json(users);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error searching for users' });
      }
    });
    
  router.post('/', authenticateToken, async (req, res) => {
    try {
      const { recipientId } = req.body;
      const initiatorId = req.user.id;

      if (!recipientId) {
        return res.status(400).json({ message: 'Recipient ID is required.' });
      }
      if (recipientId === initiatorId) {
        return res.status(400).json({ message: 'Cannot create a chat with yourself using this endpoint.' });
      }

      let chat = await Chat.findOne({
        participants: { $all: [initiatorId, recipientId], $size: 2 }
      })
      .populate('participants', '_id username avatar')
      .populate({
          path: 'lastMessage',
          populate: { path: 'senderId', select: '_id username avatar' }
      });

      let isNewChatForTheInitiator = false;
      if (!chat) {
        isNewChatForTheInitiator = true;
        const newChatDoc = new Chat({
          participants: [initiatorId, recipientId],
          messages: [],
        });
        chat = await newChatDoc.save();
        chat = await Chat.findById(chat._id)
          .populate('participants', '_id username avatar')
          .populate({
              path: 'lastMessage',
              populate: { path: 'senderId', select: '_id username avatar' }
          });
      }

      if (isNewChatForTheInitiator && chat) {
        const chatObjectForEmit = chat.toObject();
        io.to(initiatorId.toString()).emit('new_chat_created', chatObjectForEmit);
        console.log(`Emitted 'new_chat_created' TO INITIATOR ${initiatorId} for chat ${chat._id}`);
      }

      res.status(isNewChatForTheInitiator ? 201 : 200).json(chat);

    } catch (error) {
      console.error('Error creating or getting chat:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });


  router.get('/', authenticateToken, async (req, res) => {
      try {
          const userId = req.user.id;
          const chats = await Chat.find({ participants: userId })
          .populate('participants', '_id username avatar name')
          .populate({
            path: 'lastMessage',
            populate: { path: 'senderId', select: '_id username avatar name' }
          })
          .sort({ updatedAt: -1 });

          res.json(chats);
      } catch (error) {
          console.error(error);
          res.status(500).json({ error: 'Error getting chats' });
      }
  });

  router.get('/:id', authenticateToken, async (req, res) => {
    try {
      const chatId = req.params.id;
      const chat = await Chat.findById(chatId)
        .populate('participants', '_id username avatar')
        .populate('lastMessage');
        
      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }
      
      res.json(chat);
    } catch (err) {
      console.error('Error getting chat details:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  router.delete('/:chatId', authenticateToken, async (req, res) => {
    try {
      const { chatId } = req.params;
      const userId = req.user.id;

      if (!mongoose.Types.ObjectId.isValid(chatId)) {
        return res.status(400).json({ message: 'Invalid Chat ID format.' });
      }

      const chat = await Chat.findById(chatId);

      if (!chat) {
        return res.status(404).json({ message: 'Chat not found.' });
      }

      const isParticipant = chat.participants.some(participantId => participantId.toString() === userId);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Forbidden: You are not a participant of this chat.' });
      }

      const participantIds = chat.participants.map(p => p.toString());

      const deleteMessagesResult = await Message.deleteMany({ chatId: chat._id });
      console.log(`Deleted ${deleteMessagesResult.deletedCount} messages for chat ${chatId}`);

      await Chat.findByIdAndDelete(chatId);
      console.log(`Deleted chat ${chatId}`);

      participantIds.forEach(participantId => {
        io.to(participantId).emit('chat_deleted_globally', {
          chatId: chatId,
          deletedBy: userId
        });
        console.log(`Emitted 'chat_deleted_globally' to user room ${participantId} for chat ${chatId}`);
      });

      res.status(200).json({ message: 'Chat and all associated messages have been deleted successfully.' });

    } catch (error) {
      console.error('Error deleting chat:', error);
      res.status(500).json({ message: 'Server error while deleting chat.' });
    }
  });


    router.get('/me/saved-messages', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;

      let savedMessagesChat = await Chat.findOne({
        participants: { $eq: [userId], $size: 1 }
      })
      .populate('participants', '_id username avatar')
      .populate({
          path: 'lastMessage',
          populate: { path: 'senderId', select: '_id username avatar name' }
      });

      let isNewChat = false;
      if (!savedMessagesChat) {
        isNewChat = true;
        const newChatDoc = new Chat({
          participants: [userId],
          messages: [],
          type: 'self'
        });
        savedMessagesChat = await newChatDoc.save();
        savedMessagesChat = await Chat.findById(savedMessagesChat._id)
          .populate('participants', '_id username avatar')
          .populate({
              path: 'lastMessage',
              populate: { path: 'senderId', select: '_id username avatar name' }
          });
      }

      if (isNewChat && savedMessagesChat) {
        io.to(userId.toString()).emit('new_chat_created', savedMessagesChat.toObject());
      }

      res.status(isNewChat ? 201 : 200).json(savedMessagesChat);

    } catch (error) {
      console.error('Error getting/creating saved messages chat:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });
  return router;
};