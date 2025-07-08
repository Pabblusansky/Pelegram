import express from 'express';
import Message from '../models/Message.js';
import authenticateToken from '../middleware/authenticateToken.js';
import Chat from '../models/Chat.js';
import User from '../models/User.js';

import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
const __filename_messages = fileURLToPath(import.meta.url);
const __dirname_messages = path.dirname(__filename_messages);
const UPLOAD_BASE_DIR = path.resolve(__dirname_messages, '../uploads'); 
export default (io) => {
  const router = express.Router();

    // Endpoint to get available chats for the user
  router.get('/available-for-forward', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      
      const chats = await Chat.find({ participants: userId })
        .populate('participants', '_id username avatar')
        .populate('lastMessage')
        .sort({ updatedAt: -1 });
      
      res.json(chats);
    } catch (error) {
      console.error('Error fetching available chats:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  router.get('/search/:chatId', authenticateToken, async (req, res) => {
    const { chatId } = req.params;
    const { query, limit = 50, page = 1 } = req.query;
    const userId = req.user.id;

    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    try {
      const chat = await Chat.findOne({ _id: chatId, participants: userId });
      if (!chat) {
        return res.status(403).json({ message: 'Access denied to this chat or chat not found' });
      }

      const searchRegex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); // 'i' for case-insensitive

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const messages = await Message.find({
        chatId: chatId,
        content: searchRegex,
      })
      .sort({ timestamp: -1 }) 
      .skip(skip) 
      .limit(parseInt(limit))
      .populate('senderId', 'username avatar')
      .populate({ 
          path: 'replyTo',
          select: 'content senderName senderId _id', 
          populate: { path: 'senderId', select: 'username _id'}
      })
      .lean();

      res.json(messages);

    } catch (error) {
      console.error('Error searching messages:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  router.get('/:chatId/context/:messageId', authenticateToken, async (req, res) => {
    const { chatId, messageId: targetMessageId } = req.params;
    const userId = req.user.id;
    const contextLimit = parseInt(req.query.limit) || 15; 

    try {
      const chat = await Chat.findOne({ _id: chatId, participants: userId });
      if (!chat) {
        return res.status(403).json({ message: 'Access denied or chat not found' });
      }

      const targetMessage = await Message.findById(targetMessageId).lean();
      if (!targetMessage) {
        return res.status(404).json({ message: 'Target message not found' });
      }

      const targetTimestamp = targetMessage.createdAt || targetMessage.timestamp;

      const messagesBefore = await Message.find({
        chatId: chatId,
        createdAt: { $lt: targetTimestamp }
      })
      .sort({ createdAt: -1 }) 
      .limit(contextLimit)
      .populate('senderId', 'username avatar _id')
      .populate({ path: 'replyTo', select: 'content senderName senderId _id', populate: { path: 'senderId', select: 'username _id'}})
      .lean();

      const messagesAfterAndTarget = await Message.find({
        chatId: chatId,
        createdAt: { $gte: targetTimestamp }
      })
      .sort({ createdAt: 1 })
      .limit(contextLimit + 1)
      .populate('senderId', 'username avatar _id')
      .populate({ path: 'replyTo', select: 'content senderName senderId _id', populate: { path: 'senderId', select: 'username _id'}})
      .lean();

      // Combine messages before the target and the target message with messages after it
      let combinedMessages = [
        ...messagesBefore.reverse(),
        ...messagesAfterAndTarget
      ];
      
      const uniqueMessages = Array.from(new Map(combinedMessages.map(msg => [msg._id.toString(), msg])).values());
      
      // Sort by createdAt or timestamp to maintain chronological order
      uniqueMessages.sort((a, b) => new Date(a.createdAt || a.timestamp) - new Date(b.createdAt || b.timestamp));

      res.json(uniqueMessages);

    } catch (error) {
      console.error('Error fetching message context:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  router.post('/forward-multiple', authenticateToken, async (req, res) => {
    const { messageIds, targetChatId } = req.body;
    const userId = req.user.id;

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0 || !targetChatId) {
      return res.status(400).json({ message: 'Invalid request data' });
    }

    try {
      const user = await User.findById(userId);
      const senderName = user ? (user.name || user.username) : 'Unknown User';

      const targetChat = await Chat.findById(targetChatId);
      if (!targetChat || !targetChat.participants.includes(userId)) {
        return res.status(403).json({ message: 'Access denied to target chat' });
      }

      const originalMessages = await Message.find({ _id: { $in: messageIds } }).sort({ timestamp: 1 });

      if (originalMessages.length !== messageIds.length) {
        console.warn('Not all messages for multiple forward were found or accessible.');
      }
      
      const forwardedMessagesData = [];
      for (const originalMessage of originalMessages) {

        forwardedMessagesData.push({
          chatId: targetChatId,
          content: originalMessage.content,
          senderId: userId,
          senderName: senderName,
          timestamp: new Date(),
          status: 'sent',
          forwarded: true,
          originalMessageId: originalMessage._id,
          originalSenderId: originalMessage.senderId,
          originalSenderName: originalMessage.senderName,
          replyTo: originalMessage.replyTo || null
        });
      }

      if (forwardedMessagesData.length === 0) {
        return res.status(404).json({ message: 'No messages were forwarded.' });
      }

      const savedNewMessages = await Message.insertMany(forwardedMessagesData);

      if (savedNewMessages.length > 0) {
        targetChat.lastMessage = savedNewMessages[savedNewMessages.length - 1]._id;
        targetChat.updatedAt = new Date();
        await targetChat.save();

        const updatedTargetChatForEmit = await Chat.findById(targetChatId)
          .populate('participants', '_id username avatar')
          .populate({
            path: 'lastMessage',
            populate: { path: 'senderId', select: '_id username avatar name' }
          });
        
        if (updatedTargetChatForEmit) {
            io.to(targetChatId).emit('chat_updated', updatedTargetChatForEmit);
        }

        for (const newMessage of savedNewMessages) {
          const populatedMsg = await Message.findById(newMessage._id)
                                      .populate('senderId', '_id username avatar name')
                                      .populate({ path: 'replyTo', populate: {path: 'senderId', select: '_id username'}}) // Популейт ответа
                                      .lean();
          io.to(targetChatId).emit('receive_message', populatedMsg);
        }
      }
      res.status(201).json({ message: `${savedNewMessages.length} messages forwarded.` });

    } catch (error) {
      console.error('Error forwarding multiple messages:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
  
  router.delete('/delete-multiple', authenticateToken, async (req, res) => {
    try {
      console.log('DELETE MULTIPLE request received:', req.body);
      const { messageIds } = req.body; 
      const userId = req.user.id;

      if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({ message: 'Message IDs are required as an array' });
      }

      // Debug logging
      console.log(`Attempting to delete ${messageIds.length} messages for user ${userId}`);

      const messagesToDelete = await Message.find({
        _id: { $in: messageIds },
        senderId: userId
      }).select('_id chatId filePath').lean();

      const deletableMessageIds = messagesToDelete.map(m => m._id);
      const chatIdsAffected = [...new Set(messagesToDelete.map(m => m.chatId.toString()))];


      if (deletableMessageIds.length === 0) {
        return res.status(403).json({ message: 'No messages found that you can delete or messages do not exist.' });
      }

      for (const message of messagesToDelete) {
        if (message.filePath) {
          let diskPath = '';
          if (message.filePath.startsWith('/media/')) {
            diskPath = path.join(UPLOAD_BASE_DIR, message.filePath.substring(1));
          } else {
            console.warn(`Message ${message._id} had filePath, but it does not start with /media/: ${message.filePath}`);
          }

          if (diskPath) {
            try {
              if (fs.existsSync(diskPath)) {
                fs.unlinkSync(diskPath);
              } else {
                console.warn(`File not found on disk (already deleted or wrong path?): ${diskPath}`);
              }
            } catch (err) {
              console.error(`Failed to delete file ${diskPath} from disk for message ${message._id}:`, err);
            }
          }
        }
      }
      const result = await Message.deleteMany({ _id: { $in: deletableMessageIds } });
      console.log(`Deleted ${result.deletedCount} messages`);
      
      // Update affected chats
      for (const chatId of chatIdsAffected) {
        const lastMsg = await Message.findOne({ chatId }).sort({ timestamp: -1 });
        
        const updateData = {
          updatedAt: new Date()
        };
        
        if (lastMsg) {
          updateData.lastMessage = lastMsg._id;
        } else {
          updateData.lastMessage = null;
        }
        
        const updatedChat = await Chat.findByIdAndUpdate(
          chatId, 
          updateData,
          { new: true }
        )
        .populate('participants', '_id username avatar')
        .populate({
          path: 'lastMessage',
          populate: { path: 'senderId', select: '_id username avatar name' }
        });

        if (updatedChat) {
          io.to(chatId.toString()).emit('chat_updated', updatedChat);
        }
        
        deletableMessageIds.forEach(deletedId => {
          const originalMessage = messagesToDelete.find(m => m._id.toString() === deletedId.toString());
          if (originalMessage && originalMessage.chatId.toString() === chatId) {
            io.to(chatId.toString()).emit('message_deleted', { messageId: deletedId, chatId: chatId });
          }
        });
      }

      res.json({ message: `${result.deletedCount} messages deleted.`, deletedCount: result.deletedCount });
    } catch (error) {
      console.error('Error deleting multiple messages:', error);
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  });
  // Forward message
  router.post('/:messageId/forward', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { messageId } = req.params;
      const { targetChatId } = req.body;

      const user = await User.findById(userId);
      const senderName = user ? (user.name || user.username) : 'Unknown User';

      const originalMessage = await Message.findById(messageId);
      if (!originalMessage) {
        return res.status(404).json({ message: 'Message not found' });
      }

      const chatForValidation = await Chat.findOne({ _id: targetChatId, participants: userId });
      if (!chatForValidation) {
        return res.status(403).json({ message: 'Access denied to target chat' });
      }

      const forwardedMessage = new Message({
        chatId: targetChatId,
        content: originalMessage.content,
        senderId: userId,
        senderName: senderName,
        timestamp: new Date(),
        status: 'sent',
        forwarded: true,
        originalMessageId: originalMessage._id,
        originalSenderId: originalMessage.senderId,
        originalSenderName: originalMessage.senderName,
        messageType: originalMessage.messageType,
        filePath: originalMessage.filePath,
        originalFileName: originalMessage.originalFileName,
        fileMimeType: originalMessage.fileMimeType,
        fileSize: originalMessage.fileSize,
        duration: originalMessage.duration
      });

      const savedMessage = await forwardedMessage.save();

      await Chat.findByIdAndUpdate(targetChatId, {
        lastMessage: savedMessage._id,
        updatedAt: new Date(),
      });

      const updatedTargetChat = await Chat.findById(targetChatId)
        .populate('participants', '_id username avatar name')
        .populate({
          path: 'lastMessage',
          populate: { path: 'senderId', select: '_id username avatar name' }
        });
      
      if (updatedTargetChat) {
        io.to(targetChatId).emit('chat_updated', updatedTargetChat);
      }

      const populatedSavedMessage = await Message.findById(savedMessage._id)
        .populate('senderId', '_id username avatar name')
        .populate({ path: 'replyTo', populate: { path: 'senderId', select: '_id username' } })
        .lean();
      
      io.to(targetChatId).emit('receive_message', populatedSavedMessage);

      (async () => {
        try {
          const currentTargetChat = await Chat.findById(targetChatId).lean();
          if (!currentTargetChat) return;

          const recipients = currentTargetChat.participants.filter(p_id => p_id.toString() !== userId.toString());

          if (recipients.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));

            const updatedMsg = await Message.findByIdAndUpdate(savedMessage._id, { status: 'delivered' }, { new: true });
            
            if (updatedMsg) {
              io.to(targetChatId).emit('messageStatusUpdated', { 
                  messageId: savedMessage._id, 
                  status: 'delivered' 
              });
            }
          } else {
            console.log(`ℹ️ Forwarded message ${savedMessage._id} has no other recipients, status remains 'sent'.`);
          }
        } catch (err) {
          console.error(`❌ Error in background status update for forwarded message ${savedMessage._id}:`, err);
        }
      })();

      res.status(201).json(savedMessage);

    } catch (error) {
      console.error('Error forwarding message:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  router.post('/', authenticateToken, async (req, res) => {
      const { chatId, content } = req.body;

      if (!content) {
          return res.status(400).json({ error: 'Content is required' });
      }
      try {
          const newMessage = new Message({ 
              chatId,
              senderId: req.user.id,
              senderName: req.user.name,
              content,
              status: 'sent',
          });

          console.log('User from token:', req.user);

          await newMessage.save();

          await Chat.findByIdAndUpdate(chatId, {
              lastMessage: newMessage._id,
              updatedAt: Date.now(),
          });

          res.status(201).json(newMessage); } catch (error) {
              console.error(error);
              res.status(500).json({ error: 'Failed sending message' });
          }
  });

  router.get('/:chatId', authenticateToken, async (req, res) => {
    const { chatId } = req.params;
    const { before, limit = 30 } = req.query;

    console.log(`Fetching messages for chat ${chatId}, before: ${before}, limit: ${limit}`);

    try {
        let query = { chatId };

      if (before) {
        const beforeMessage = await Message.findById(before);
        if (beforeMessage) {
          query.createdAt = { $lt: new Date(beforeMessage.createdAt) };
          console.log(`Finding messages before ${new Date(beforeMessage.createdAt)}`);
        } else {
          console.log(`Message with ID ${before} not found`);
        }
      }
        const messages = await Message.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .exec();

        console.log(`Found ${messages.length} messages`);

        res.status(200).json(messages.reverse());
      } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
  });
  router.route('/:id')
    .patch(authenticateToken, async (req, res) => {
      try {
        const now = new Date();
        const messageId = req.params.id;
        
        const existingMessage = await Message.findById(req.params.id);
        
        if (!existingMessage) {
          return res.status(404).json({ error: 'Message not found' });
        }
        
        if (existingMessage.senderId.toString() !== req.user.id) {
          return res.status(403).json({ error: 'Not authorized to edit this message' });
        }
        
        const updatedMessage = await Message.findByIdAndUpdate(
          messageId,
          { 
            content: req.body.content, 
            edited: true,
            editedAt: now
          },
          { new: true }
        ).populate('senderId', '_id username avatar name');

        if (!updatedMessage) {
          return res.status(404).json({ error: 'Message not found' });
        }
        io.to(updatedMessage.chatId.toString()).emit('message_edited', updatedMessage.toObject());

        const chat = await Chat.findById(updatedMessage.chatId)
        
        if (chat && chat.lastMessage &&  chat.lastMessage.toString() === updatedMessage._id.toString()) {
          const updatedChatForEmit = await Chat.findById(chat._id)
            .populate('participants', '_id username avatar name')
            .populate({
              path: 'lastMessage',
              populate: { path: 'senderId', select: '_id username avatar name' }
            });
            if (updatedChatForEmit) {
              io.to(updatedMessage.chatId.toString()).emit('chat_updated', updatedChatForEmit.toObject());
            } else {
              console.error(`Chat with ID ${chat._id} not found after update for emitting chat_updated event.`);
            }
          }
        res.json(updatedMessage.toObject());
      } catch (err) {
        console.error('Error editing message:', err);
        res.status(500).json({ error: err.message });
      }
    });
  router.delete('/:id', authenticateToken, async (req, res) => {
    try {
      console.log('DELETE request received for message:', req.params.id);
      const messageId = req.params.id;
      
      const message = await Message.findById(messageId);
      
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }
      
      if (message.senderId.toString() !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to delete this message' });
      }

      const chatId = message.chatId;
      const filePathToDelete = message.filePath;

      if (filePathToDelete) {
                let diskPath = '';
        if (filePathToDelete.startsWith('/media/')) {
            diskPath = path.join(UPLOAD_BASE_DIR, filePathToDelete.substring(1));
        } else {
            console.warn(`Message ${messageId} had filePath, but it does not start with /media/: ${filePathToDelete}`);
        }

        if (diskPath) {
            fs.unlink(diskPath, (err) => {
              if (err) {
                console.error(`Failed to delete file ${diskPath} from disk:`, err);
              } else {
                console.log(`Successfully deleted file ${diskPath} from disk.`);
              }
            });
        }
      }
  
      await Message.findByIdAndDelete(messageId);
      
      const lastMessage = await Message.find({ chatId })
      .sort({ createdAt: -1 })
      .limit(1);
    
      let updatedChat;

      if (lastMessage.length > 0) {
        updatedChat = await Chat.findByIdAndUpdate(
          chatId,
          { lastMessage: lastMessage[0]._id },
          { new: true }
        ).populate('lastMessage').populate('participants', 'username');
      } else {
        updatedChat = await Chat.findByIdAndUpdate(
          chatId,
          { lastMessage: null },
          { new: true }
        ).populate('participants', 'username');
      }
  
      io.to(chatId.toString()).emit('message_deleted', { 
        messageId,
        chatId,
        updatedChat
      });
      
      res.status(200).json({ success: true, messageId });
    } catch (err) {
      console.error('Error deleting message:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router
};