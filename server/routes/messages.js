import express from 'express';
import Message from '../models/Message.js';
import authenticateToken from '../middleware/authenticateToken.js';
import Chat from '../models/Chat.js';
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

export default router;