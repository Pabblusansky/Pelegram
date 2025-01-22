import express from 'express';
import Message from '../models/Message.js';
import { authenticateToken } from '../middleware/authenticateToken.js';
const router = express.Router();

router.post('/api/messages', authenticateToken, async (req, res) => {
    const { chatId, content } = req.body;

    if (!content) {
        return res.status(400).json({ error: 'Content is required' });
    }
    try {
        const newMessages = new Message({ 
            chatId,
            senderId: req.user.id,
            content,
        });

        await newMessages.save();
        await Chat.findByIdAndUpdate(chatId, {
            lastMesage: newMessages._id,
            updatedAt: Date.now(),
        });

        res.status(201).json(newMessages); } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed sending message' });
        }
});

router.get('/api/messages/:chatId', authenticateToken, async (req, res) => { 
    const { chatId } = req.params;

    try {
        // Получаем сообщения из чата
        const messages = await Message.find({ chatId })
            .populate('senderId', 'username') 
            .sort({ createdAt: 1 });

        res.json(messages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch messages.' });
    }
});

export default router;