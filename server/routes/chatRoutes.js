import express from 'express';
import Chat from '../models/Chat.js';
import { authenticateToken } from '../middleware/authenticateToken.js';
const router = express.Router();


router.post('/', authenticateToken, async (req, res) => {
    const { recipientId } = req.body;

    const existinghChat = await Chat.findOne({
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
