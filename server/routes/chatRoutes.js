import express from 'express';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import { authenticateToken } from '../middleware/authenticateToken.js';
const router = express.Router();
import User from '../models/User.js';

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
    const { recipientId } = req.body;
    console.log('User ID from token:', req.user.id);
    const existingChat = await Chat.findOne({
        participants: { $all: [req.user.id, recipientId] },
    });

    if (existingChat) {
        return res.status(200).json(existingChat);
    }

    const newChat = new Chat({
        participants: [req.user.id, recipientId],
    });

    await newChat.save();
    res.status(201).json(newChat);
});


router.get('/', authenticateToken, async (req, res) => {
    try {
        const chats = await Chat.find({ participants: req.user.id })
        .populate('participants', 'username')
        .populate('lastMessage')
        .sort({ updatedAt: -1 });

        res.json(chats);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error getting chats' });
    }
});
export default router;
