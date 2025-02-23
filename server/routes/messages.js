import express from 'express';
import Message from '../models/Message.js';
import authenticateToken from '../middleware/authenticateToken.js';
import Chat from '../models/Chat.js';

export default (io) => {
const router = express.Router();

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
  console.log('Received chatId:', chatId);
  try {
      const messages = await Message.find({ chatId });
      res.status(200).json(messages);
  } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Internal server error' });
  }
});

router.route('/:id')
  .patch(authenticateToken, async (req, res) => {
    try {
      const message = await Message.findByIdAndUpdate(
        req.params.id,
        { content: req.body.content, edited: true },
        { new: true }
      );
      
      if (!message) return res.status(404).json({ error: 'Message not found' });
      
      io.to(message.chatId).emit('message_edited', message);
      res.json(message);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  })
  .delete(authenticateToken, async (req, res) => {
    try {
      const message = await Message.findByIdAndDelete(req.params.id);
      if (!message) return res.status(404).json({ error: 'Message not found' });

      await Chat.findByIdAndUpdate(message.chatId, {
        $pull: { messages: message._id }
      });

      io.to(message.chatId).emit('message_deleted', message._id);
      res.sendStatus(204);
    } catch (err) {
      res.status(500).json({ error: err.message });
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