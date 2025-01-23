import express from 'express';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import { authenticateToken } from '../middleware/authenticateToken.js';
const router = express.Router();

router.get('/search', authenticateToken, async (req, res) => {
    try {
        const searchQuery = req.query.query || '';
        const users = await User.find({
            username: { $regex: searchQuery, $options: 'i' },
            _id: { $ne: req.user.id },
        }).limit(10);
        res.json(users);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Error searching users' });
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
