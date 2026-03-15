import express, { Request, Response } from 'express';
import { Server } from 'socket.io';
import Message from '../models/Message.js';
import Chat from '../models/Chat.js';
import User from '../models/User.js';
import authenticateToken from '../middleware/authenticateToken.js';
import { uploadMedia, getFileUrl, deleteFileFromCloudinary } from '../config/multer-config.js';
import logger from '../config/logger.js';
import { MESSAGE_POPULATE, CHAT_POPULATE, applyPopulate } from '../config/populate.js';

export default (io: Server) => {
  const router = express.Router();

  router.post('/upload/chat/:chatId', authenticateToken, uploadMedia.single('mediaFile'), async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ message: 'No file uploaded, or file was rejected by filter/size limit.' });
      return;
    }

    try {
      const { chatId } = req.params;
      const { messageType = 'file', caption = '' } = req.body;
      const duration = req.body.duration ? parseFloat(req.body.duration) : 0;
      const userId = req.user!.id;
      const replyToInput = req.body.replyTo;

      let replyToData: any = null;

      if (replyToInput) {
        try {
          const parsedReplyTo = JSON.parse(replyToInput);

          if (parsedReplyTo && parsedReplyTo._id) {
            const originalRepliedMessage: any = await Message.findById(parsedReplyTo._id)
              .select('_id content senderId senderName messageType filePatch')
              .populate('senderId', 'username')
              .lean();
            if (originalRepliedMessage) {
              replyToData = {
                _id: originalRepliedMessage._id,
                content: originalRepliedMessage.content,
                senderId: originalRepliedMessage.senderId ? originalRepliedMessage.senderId._id : null,
                senderName: originalRepliedMessage.senderId
                  ? originalRepliedMessage.senderId.username
                  : originalRepliedMessage.senderName || 'Unknown User',
                messageType: originalRepliedMessage.messageType,
              };
            }
          }
        } catch (parseError) {
          logger.error('Error parsing replyTo data:', parseError);
        }
      }

      const user = await User.findById(userId);
      const senderName = user ? (user.displayName || user.username) : 'Unknown User';

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
          case 'video':
          case 'audio':
            messageContent = '';
            break;
          case 'file':
          default:
            messageContent = req.file.originalname;
        }
      }

      const fileUrl = getFileUrl(req.file);

      const newMessage = new Message({
        chatId,
        senderId: userId,
        senderName,
        messageType: determinedMessageType,
        content: messageContent,
        filePath: fileUrl,
        originalFileName: req.file.originalname,
        fileMimeType: req.file.mimetype,
        fileSize: req.file.size,
        status: 'sent',
        replyTo: replyToData,
        duration,
      });

      const savedMessage = await newMessage.save();

      const updatedChat = await applyPopulate(
        Chat.findByIdAndUpdate(
          chatId,
          { lastMessage: savedMessage._id, updatedAt: new Date() },
          { new: true }
        ),
        CHAT_POPULATE
      );

      const populatedMessageForSocket = await applyPopulate(
        Message.findById(savedMessage._id),
        MESSAGE_POPULATE
      ).lean();

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
                status: 'delivered',
              });
            }
          }
        } catch (err) {
          logger.error(`Error updating file message status for ${savedMessage._id}:`, err);
        }
      })();

      res.status(201).json({ message: 'File uploaded successfully', savedMessage: populatedMessageForSocket });
    } catch (error: any) {
      logger.error('Error processing uploaded file in chat', req.params.chatId, 'by user', req.user!.id, ':', error);

      if (req.file) {
        if (process.env.NODE_ENV === 'production') {
          await deleteFileFromCloudinary(req.file.path);
        } else {
          try {
            const fs = await import('fs');
            if (req.file!.path && fs.default.existsSync(req.file!.path)) {
              fs.default.unlinkSync(req.file!.path);
            }
          } catch (e) {
            logger.error('Error deleting file after DB error:', e);
          }
        }
      }

      if (error.message && error.message.includes('Unsupported file type')) {
        res.status(400).json({ message: error.message });
        return;
      }
      res.status(500).json({ message: 'Server error while processing file.' });
    }
  });

  return router;
};
