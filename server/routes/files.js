import express from 'express';
import Message from '../models/Message.js';
import Chat from '../models/Chat.js';
import User from '../models/User.js';
import authenticateToken from '../middleware/authenticateToken.js';
import { uploadMedia, getFileUrl } from '../config/multer-config.js';

export default (io) => {
  const router = express.Router();

  router.post('/upload/chat/:chatId', authenticateToken, uploadMedia.single('mediaFile'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded, or file was rejected by filter/size limit.' });
    }

    try {
      const { chatId } = req.params;
      const { messageType = 'file', caption = '' } = req.body;
      const duration = req.body.duration ? parseFloat(req.body.duration) : 0;
      const userId = req.user.id;
      let replyToInput = req.body.replyTo;

      let replyToData = null;

      if (replyToInput) {
        try {
          const parsedReplyTo = JSON.parse(replyToInput);

          if (parsedReplyTo && parsedReplyTo._id) {
            const originalRepliedMessage = await Message.findById(parsedReplyTo._id)
            .select('_id content senderId senderName messageType filePatch')
            .populate('senderId', 'username')
            .lean();
            if (originalRepliedMessage) {
              replyToData = {
                _id: originalRepliedMessage._id,
                content: originalRepliedMessage.content,
                senderId: originalRepliedMessage.senderId ? originalRepliedMessage.senderId._id : null,
                senderName: originalRepliedMessage.senderId ? 
                  originalRepliedMessage.senderId.username : 
                  originalRepliedMessage.senderName || 'Unknown User',
                messageType: originalRepliedMessage.messageType
              };
            }
          }
        } catch (parseError) {
          console.error('Error parsing replyTo data:', parseError);
        }
      }

      const user = await User.findById(userId);
      const senderName = user ? (user.name || user.username) : 'Unknown User';

      let determinedMessageType = messageType;
      if (!messageType || messageType === 'file') {
        if (req.file.mimetype.startsWith('image/')) {
          determinedMessageType = 'image';
        } else if (req.file.mimetype.startsWith('video/')) {
          determinedMessageType = 'video';
        } else if (req.file.mimetype.startsWith('audio/')) {
          determinedMessageType = 'audio';
        } else {
          determinedMessageType = 'file';
        }
      }

      let messageContent = '';
      if (caption && caption.trim()) {
        messageContent = caption.trim();
      } else {
        switch (determinedMessageType) {
          case 'image':
            messageContent = '';
            break;
          case 'video':
            messageContent = '';
            break;
          case 'audio':
            messageContent = '';
            break;
          case 'file':
            messageContent = req.file.originalname;
            break;
          default:
            messageContent = req.file.originalname;
        }
      }

      const fileUrl = getFileUrl(req.file);

      const newMessage = new Message({
        chatId: chatId,
        senderId: userId,
        senderName: senderName,
        messageType: determinedMessageType,
        content: messageContent,
        filePath: fileUrl,
        originalFileName: req.file.originalname,
        fileMimeType: req.file.mimetype,
        fileSize: req.file.size,
        status: 'sent',
        replyTo: replyToData,
        duration: duration
      });

      const savedMessage = await newMessage.save();

      const updatedChat = await Chat.findByIdAndUpdate(
        chatId,
        { lastMessage: savedMessage._id, updatedAt: new Date() },
        { new: true }
      )
      .populate('participants', '_id username avatar')
      .populate({
        path: 'lastMessage',
        populate: [
            { path: 'senderId', select: '_id username avatar name' },
            { path: 'replyTo', select: 'content senderName senderId _id', populate: { path: 'senderId', select: 'username _id'} }
        ]
      });

      const populatedMessageForSocket = await Message.findById(savedMessage._id)
        .populate('senderId', '_id username avatar name')
        .populate({
            path: 'replyTo',
            select: 'content senderName senderId _id messageType filePath',
            populate: { path: 'senderId', select: 'username _id'}
        })
        .lean();

      io.to(chatId.toString()).emit('receive_message', populatedMessageForSocket);
      if (updatedChat) {
        io.to(chatId.toString()).emit('chat_updated', updatedChat);
      }

      (async () => {
        try {
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const chat = await Chat.findById(chatId).lean();
          if (!chat) return;

          const recipients = chat.participants.filter(p_id => p_id.toString() !== userId.toString());

          if (recipients.length > 0) {
            const updated = await Message.findOneAndUpdate(
              { _id: savedMessage._id, status: 'sent' },
              { $set: { status: 'delivered' } },
              { new: true }
            );

            if (updated) {
              io.to(chatId.toString()).emit('messageStatusUpdated', {
                messageId: savedMessage._id,
                status: 'delivered'
              });
              console.log(`✅ File message ${savedMessage._id} status updated to 'delivered'`);
            } else {
              console.log(`ℹ️ File message ${savedMessage._id} status was NOT 'sent', skipping 'delivered' update.`);
            }
          }
        } catch (err) {
          console.error(`❌ Error updating file message status for ${savedMessage._id}:`, err);
        }
      })();
      
      res.status(201).json({ message: 'File uploaded successfully', savedMessage: populatedMessageForSocket });

    } catch (error) {
      console.error('Error processing uploaded file in chat', req.params.chatId, 'by user', req.user.id, ':', error);
      
      if (process.env.NODE_ENV !== 'production' && req.file && req.file.path) {
        try {
          const fs = await import('fs');
          fs.default.unlinkSync(req.file.path);
          console.log(`Deleted file ${req.file.path} due to processing error.`);
        } catch (e) {
          console.error("Error deleting file after DB error:", e);
        }
      }
      
      if (error.message && error.message.includes('Unsupported file type')) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: 'Server error while processing file.' });
    }
  });

  return router;
};