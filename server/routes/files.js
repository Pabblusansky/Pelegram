import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Message from '../models/Message.js';
import Chat from '../models/Chat.js';
import User from '../models/User.js';
import authenticateToken from '../middleware/authenticateToken.js';
import { fileURLToPath } from 'url';

const __filename_files = fileURLToPath(import.meta.url); 
const __dirname_files = path.dirname(__filename_files);
const UPLOAD_DIR = path.resolve(__dirname_files, '../uploads/media'); 

const ensureUploadDirExists = () => {
  console.log(`MULTER_ENSURE_DIR: Checking/Creating directory at: ${UPLOAD_DIR}`);
  if (!fs.existsSync(UPLOAD_DIR)) {
    try {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      console.log(`MULTER_ENSURE_DIR: Successfully created upload directory: ${UPLOAD_DIR}`);
    } catch (err) {
      console.error(`MULTER_ENSURE_DIR: FAILED to create upload directory: ${UPLOAD_DIR}`, err);
    }
  } else {
    console.log(`MULTER_ENSURE_DIR: Upload directory already exists: ${UPLOAD_DIR}`);
  }
};
ensureUploadDirExists();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const userId = req.user ? req.user.id : 'anonymous'; 
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const generatedFilename = `user-${userId}-${uniqueSuffix}${path.extname(file.originalname)}`;
    cb(null, generatedFilename);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime',
    'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    console.warn(`File upload rejected: Unsupported mimetype ${file.mimetype} for file ${file.originalname}`);
    cb(new Error('Unsupported file type. Please upload images, videos, audio, or common document types.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 25 // 25 MB 
  },
  fileFilter: fileFilter
});


export default (io) => {
  const router = express.Router();

  router.post('/upload/chat/:chatId', authenticateToken, upload.single('mediaFile'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded, or file was rejected by filter/size limit.' });
    }

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
                (originalRepliedMessage.senderName || 'User'),
              messageType: originalRepliedMessage.messageType,
              filePath: originalRepliedMessage.filePath,
            };
          } else {
            console.warn(`ReplyTo message with ID ${parsedReplyTo._id} not found.`);
          }
      }
    } catch (error) {
        console.error('Error parsing replyTo input:', error);
        return res.status(400).json({ message: 'Invalid replyTo format.' });
      }
    }
    try {
      const user = await User.findById(userId);
      const senderName = user ? (user.name || user.username) : 'Unknown User';

      let determinedMessageType = messageType;
      if (req.file.mimetype.startsWith('image/')) {
        determinedMessageType = 'image';
      } else if (req.file.mimetype.startsWith('video/')) {
        determinedMessageType = 'video';
      } else if (req.file.mimetype.startsWith('audio/')) {
        determinedMessageType = 'audio';
      } else {
        determinedMessageType = 'file';
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

      const newMessage = new Message({
        chatId: chatId,
        senderId: userId,
        senderName: senderName,
        messageType: determinedMessageType,
        content: messageContent,
        filePath: `/media/${req.file.filename}`,
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
      console.error('Error processing uploaded file in chat', chatId, 'by user', userId, ':', error);
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
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

  router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      console.error("Multer error:", err);
      return res.status(400).json({ message: err.message });
    } else if (err) {
      console.error("File upload error:", err);
      return res.status(400).json({ message: err.message });
    }
    next();
  });

  return router;
};