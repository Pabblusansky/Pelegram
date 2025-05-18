import express from 'express';
import Message from '../models/Message.js';
import authenticateToken from '../middleware/authenticateToken.js';
import Chat from '../models/Chat.js';
import User from '../models/User.js';
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
    
    const sourceChat = await Chat.findById(originalMessage.chatId);
    if (!sourceChat.participants.includes(userId)) {
      return res.status(403).json({ message: 'Access denied to source chat' });
    }
    
    const targetChat = await Chat.findById(targetChatId);
    if (!targetChat || !targetChat.participants.includes(userId)) {
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
      originalMessageId: messageId,
      originalSenderId: originalMessage.senderId,
      originalSenderName: originalMessage.senderName
    });
    
    const savedMessage = await forwardedMessage.save();
    console.log('[FORWARD_MESSAGE] Saved forwarded message (to be emitted):', JSON.stringify(savedMessage, null, 2));
    targetChat.lastMessage = savedMessage._id;
    targetChat.updatedAt = new Date();
    await targetChat.save();
    
    io.to(targetChatId).emit('message', savedMessage);
    
    targetChat.participants.forEach(participantId => {
      if (participantId !== userId) {
        io.to(participantId.toString()).emit('message:status', {
          messageId: savedMessage._id,
          status: 'delivered'
        });
      }
    });
    
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
      
      const existingMessage = await Message.findById(req.params.id);
      
      if (!existingMessage) {
        return res.status(404).json({ error: 'Message not found' });
      }
      
      if (existingMessage.senderId.toString() !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to edit this message' });
      }
      
      const message = await Message.findByIdAndUpdate(
        req.params.id,
        { 
          content: req.body.content, 
          edited: true,
          editedAt: now
        },
        { new: true }
      );
      
      io.to(message.chatId.toString()).emit('message_edited', message);
      console.log(`Emitted message_edited event to chat ${message.chatId}:`, message);
      
      res.json(message);
    } catch (err) {
      console.error('Error editing message:', err);
      res.status(500).json({ error: err.message });
    }
  })


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


router.post('/markAsRead', authenticateToken, async (req, res) => {
  const { chatId } = req.body;
  console.log('Received request to mark messages as read for chat:', chatId);

  try {
    // Finding messages to update
    const messagesToUpdate = await Message.find({
      chatId,
      status: 'delivered',
      senderId: { $ne: req.user.id }
    });

    if (messagesToUpdate.length === 0) {
      return res.status(200).json({ message: 'No messages for update' });
    }

    // Update messages
    await Message.updateMany(
      { _id: { $in: messagesToUpdate.map(msg => msg._id) } },
      { $set: { status: 'read' } }
    );

    console.log(`Updated  ${messagesToUpdate.length} messages in chat: ${chatId}`);

    // Sending updated messages to all clients in the chat
    messagesToUpdate.forEach(msg => {
      io.to(chatId).emit('messageStatusUpdated', { messageId: msg._id, status: 'read' });
    });

    res.status(200).json({ message: 'All messages are marked as read' });
  } catch (error) {
    console.error('Error when marking the messages:', error);
    res.status(500).json({ error: 'Error when marking the messages!!!' });
  }
});
  return router
};