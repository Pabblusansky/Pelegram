import express from 'express';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import authenticateToken from '../middleware/authenticateToken.js';
import User from '../models/User.js';
import mongoose from 'mongoose'; 
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
      
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ensureGroupAvatarDirExists = () => {
  const groupAvatarDir = path.resolve(__dirname, '../uploads/group-avatars');
  console.log(`GROUP_AVATAR_ENSURE_DIR: Checking/Creating directory at: ${groupAvatarDir}`);
  if (!fs.existsSync(groupAvatarDir)) {
    try {
      fs.mkdirSync(groupAvatarDir, { recursive: true });
      console.log(`GROUP_AVATAR_ENSURE_DIR: Successfully created group avatar directory: ${groupAvatarDir}`);
    } catch (err) {
      console.error(`GROUP_AVATAR_ENSURE_DIR: FAILED to create group avatar directory: ${groupAvatarDir}`, err);
    }
  } else {
    console.log(`GROUP_AVATAR_ENSURE_DIR: Group avatar directory already exists: ${groupAvatarDir}`);
  }
};
ensureGroupAvatarDirExists();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.resolve(__dirname, '../uploads/group-avatars');
    console.log(`MULTER DESTINATION: Attempting to use directory: ${dir}`);
    
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`MULTER DESTINATION: Created directory: ${dir}`);
      } catch (err) {
        console.error(`MULTER DESTINATION: Failed to create directory: ${dir}`, err);
        return cb(err, null);
      }
    }
    
    console.log(`MULTER DESTINATION: Using directory: ${dir}`);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const generatedFilename = 'group-' + uniqueSuffix + ext;
    console.log('MULTER FILENAME: Generated filename:', generatedFilename);
    cb(null, generatedFilename);
  }
});

const uploadGroupAvatar = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image! Please upload only images.'), false);
    }
  }
});

export default (io) => {
  const router = express.Router();

  // Create a new group chat
  router.post('/group', authenticateToken, async (req, res) => {
    try {
      const { name, participants: participantIds } = req.body;
      const adminId = req.user.id;

      if (!name || name.trim() === '') {
        return res.status(400).json({ message: 'Group name is required.' });
      }

      if (!participantIds || !Array.isArray(participantIds) || participantIds.length < 1) {
        return res.status(400).json({ message: 'At least one other participant is required to create a group.' });
      }

      const allParticipantIds = new Set([adminId.toString(), ...participantIds.map(id => id.toString())]);
      const finalParticipantIds = Array.from(allParticipantIds);

      if (finalParticipantIds.length < 2) {
        return res.status(400).json({ message: 'A group chat must have at least two unique participants (including the creator).' });
      }

      const usersExist = await User.find({ '_id': { $in: finalParticipantIds } }).countDocuments();
      if (usersExist !== finalParticipantIds.length) {
        return res.status(400).json({ message: 'One or more participant IDs are invalid.' });
      }

      const newGroupChat = new Chat({
        name: name.trim(),
        isGroupChat: true,
        participants: finalParticipantIds,
        admin: adminId,
        groupAvatar: 'assets/images/default-group-avatar.png',
        unreadCounts: finalParticipantIds.map(pId => ({ userId: pId, count: 0 })),
      });

      let savedChat = await newGroupChat.save();

      savedChat = await Chat.findById(savedChat._id)
        .populate('participants', '_id username avatar name')
        .populate('admin', '_id username avatar name');

      if (!savedChat) {
        return res.status(500).json({ message: 'Failed to save and populate the group chat.' });
      }
      
      const chatObjectForEmit = savedChat.toObject();
      
      // Emit for each participant
      finalParticipantIds.forEach(participantId => {
        io.to(participantId.toString()).emit('new_chat_created', chatObjectForEmit);
        console.log(`Emitted 'new_chat_created' (group) to user ${participantId} for chat ${savedChat._id}`);
      });
      
      res.status(201).json(savedChat);
    } catch (error) {
      console.error('Error creating group chat:', error);
      return res.status(500).json({ message: 'Server error' });
    }
  }),

  router.patch('/:chatId/group/avatar', authenticateToken, uploadGroupAvatar.single('avatar'), async (req, res) => {
    const { chatId } = req.params;
    const userId = req.user.id;

    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      console.log('PATCH /group/avatar - File processed:', req.file.filename);

      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(404).json({ message: 'Group chat not found.' });
      }
      
      if (!chat.isGroupChat) {
        return res.status(400).json({ message: 'This is not a group chat.' });
      }

      // Check if user is admin
      const isAdmin = Array.isArray(chat.admin) 
        ? chat.admin.some(adminId => adminId.toString() === userId) 
        : chat.admin && chat.admin.toString() === userId;
        
      if (!isAdmin) {
        return res.status(403).json({ message: 'Only the group admin can change the group avatar.' });
      }

      if (chat.groupAvatar && !chat.groupAvatar.includes('default-group-avatar')) {
        const oldAvatarPath = path.join(__dirname, '..', chat.groupAvatar.replace('/uploads/', 'uploads/'));
        if (fs.existsSync(oldAvatarPath)) {
          fs.unlinkSync(oldAvatarPath);
        }
      }

      // Set new avatar path
      const avatarPath = '/uploads/group-avatars/' + req.file.filename;
      chat.groupAvatar = avatarPath;
      await chat.save();

      const updatedChat = await Chat.findById(chatId)
        .populate('participants', '_id username avatar name')
        .populate('admin', '_id username avatar name')
        .populate({
          path: 'lastMessage',
          populate: { path: 'senderId', select: '_id username avatar name' }
        });

      updatedChat.participants.forEach(participant => {
        io.to(participant._id.toString()).emit('chat_updated', updatedChat);
      });

      res.json(updatedChat);

    } catch (error) {
      console.error('Error updating group avatar:', error);
      res.status(500).json({ message: 'Server error while updating group avatar' });
    }
  });

  // Add participants to group
  router.post('/:chatId/group/participants', authenticateToken, async (req, res) => {
    const { chatId } = req.params;
    const { participantIds } = req.body;
    const userId = req.user.id;

    try {
      if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
        return res.status(400).json({ message: 'No participants provided to add' });
      }

      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(404).json({ message: 'Group chat not found.' });
      }
      
      if (!chat.isGroupChat) {
        return res.status(400).json({ message: 'This is not a group chat.' });
      }

      // Check if user is admin
      const isAdmin = Array.isArray(chat.admin) 
        ? chat.admin.some(adminId => adminId.toString() === userId) 
        : chat.admin && chat.admin.toString() === userId;
        
      if (!isAdmin) {
        return res.status(403).json({ message: 'Only the group admin can add participants.' });
      }

      // Verify all user IDs exist
      const usersToAdd = await User.find({ '_id': { $in: participantIds } });
      if (usersToAdd.length !== participantIds.length) {
        return res.status(400).json({ message: 'One or more user IDs are invalid.' });
      }

      // Add new participants (avoiding duplicates)
      const currentParticipantIds = chat.participants.map(p => p.toString());
      const newParticipantIds = participantIds.filter(id => !currentParticipantIds.includes(id));

      if (newParticipantIds.length === 0) {
        return res.status(400).json({ message: 'All users are already participants.' });
      }

      chat.participants.push(...newParticipantIds);
      
      // Initialize unreadCount for new participants
      newParticipantIds.forEach(newId => {
        if (chat.unreadCounts) {
          chat.unreadCounts.push({ userId: newId, count: 0 });
        }
      });
      
      await chat.save();

      // Add system message about added users
      const addedUsers = usersToAdd.filter(u => newParticipantIds.includes(u._id.toString()));
      const usernames = addedUsers.map(u => u.username).join(', ');
      
      const systemMessageContent = `${addedUsers.length > 1 ? `${usernames} were` : `${usernames} was`} added to the group.`;
      
      const systemMessage = new Message({
        chatId,
        senderId: null,
        senderName: 'System',
        content: systemMessageContent,
        messageType: 'event',
        category: 'system_event',
        timestamp: new Date()
      });
      
      const savedSystemMessage = await systemMessage.save();
      
      // Update lastMessage in chat
      chat.lastMessage = savedSystemMessage._id;
      chat.updatedAt = new Date();
      await chat.save();
      
      const updatedChat = await Chat.findById(chatId)
        .populate('participants', '_id username avatar name')
        .populate('admin', '_id username avatar name')
        .populate({
          path: 'lastMessage',
          populate: { path: 'senderId', select: '_id username avatar name' }
        });
      
      if (updatedChat) {
        updatedChat.participants.forEach(participant => {
          io.to(participant._id.toString()).emit('chat_updated', updatedChat);
          io.to(participant._id.toString()).emit('receive_message', savedSystemMessage.toObject());
        });
      }

      newParticipantIds.forEach(newParticipantId => {
        io.to(newParticipantId.toString()).emit('new_chat_created', updatedChat);
      });
      
      res.json(updatedChat);

    } catch (error) {
      console.error('Error adding participants:', error);
      res.status(500).json({ message: 'Server error while adding participants' });
    }
  });

  // Remove participant
  router.delete('/:chatId/group/participants/:participantId', authenticateToken, async (req, res) => {
    const { chatId, participantId } = req.params;
    const userId = req.user.id;
    const adminUserId = req.user.id;

    try {
      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(404).json({ message: 'Group chat not found.' });
      }
      
      if (!chat.isGroupChat) {
        return res.status(400).json({ message: 'This is not a group chat.' });
      }

      const isAdmin = Array.isArray(chat.admin) 
        ? chat.admin.some(adminId => adminId.toString() === userId) 
        : chat.admin && chat.admin.toString() === userId;
        
      if (!isAdmin) {
        return res.status(403).json({ message: 'Only the group admin can remove participants.' });
      }

      const participantIndex = chat.participants.findIndex(p => p.toString() === participantId);
      if (participantIndex === -1) {
        return res.status(400).json({ message: 'User is not a participant in this group.' });
      }

      // Can't remove the admin
      if (participantId === userId) {
        return res.status(400).json({ message: 'Admin cannot remove themselves. Use the Leave Group function instead.' });
      }

      const removedUser = await User.findById(participantId);
      if (!removedUser) {
        return res.status(404).json({ message: 'User not found.' });
      }
      
      // Remove participant
      chat.participants.splice(participantIndex, 1);
      
      // Remove from unreadCounts if exists
      if (chat.unreadCounts) {
        chat.unreadCounts = chat.unreadCounts.filter(uc => uc.userId.toString() !== participantId);
      }
      
      await chat.save();

      // Create system message
      const systemMessageContent = `${removedUser.username} was removed from the group.`;
      const systemMessage = new Message({
        chatId,
        senderId: null,
        senderName: 'System',
        content: systemMessageContent,
        messageType: 'event',
        category: 'system_event',
        timestamp: new Date()
      });
      
      const savedSystemMessage = await systemMessage.save();
      chat.lastMessage = savedSystemMessage._id;
      chat.updatedAt = new Date();
      await chat.save();
      
      const updatedChat = await Chat.findById(chatId)
        .populate('participants', '_id username avatar name')
        .populate('admin', '_id username avatar name')
        .populate({
          path: 'lastMessage',
          populate: { path: 'senderId', select: '_id username avatar name' }
        });
      
      if (updatedChat) {
        updatedChat.participants.forEach(participant => {
          io.to(participant._id.toString()).emit('chat_updated', updatedChat);
          io.to(participant._id.toString()).emit('receive_message', savedSystemMessage.toObject());
        });
      }
      
      // Notify the removed user that they've been removed
      io.to(participantId).emit('user_removed_from_chat', { 
        chatId: chatId, 
        reason: 'removed_from_group' 
      });
      
      res.json(updatedChat);

    } catch (error) {
      console.error('Error removing participant:', error);
      res.status(500).json({ message: 'Server error while removing participant' });
    }
  });

  router.post('/:chatId/leave', authenticateToken, async (req, res) => {
    const { chatId } = req.params;
    const userId = req.user.id;

    try {
      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(404).json({ message: 'Group chat not found.' });
      }
      if (!chat.isGroupChat) {
        return res.status(400).json({ message: 'This is not a group chat.' });
      }

      const participantIndex = chat.participants.findIndex(pId => pId.toString() === userId);
      if (participantIndex === -1) {
        return res.status(403).json({ message: 'You are not a member of this group.' });
      }

      
      const leavingUser = await User.findById(userId);
      const leavingUserUsername = leavingUser ? leavingUser.username : 'A user';
      chat.participants.splice(participantIndex, 1);
      
      if (chat.unreadCounts) {
          chat.unreadCounts = chat.unreadCounts.filter(uc => uc.userId.toString() !== userId);
      }
      let isAdmin = false;
      if (Array.isArray(chat.admin)) {
        isAdmin = chat.admin.some(adminId => adminId.toString() === userId);
        if (isAdmin) {
          if (chat.participants.length === 0) {
            const messagesWithFiles = await Message.find({ 
              chatId: chat._id, 
              filePath: { $exists: true, $ne: null, $ne: '' } 
            }).select('filePath').lean();

            const UPLOAD_BASE_DIR = path.resolve(__dirname, '../uploads');
            for (const message of messagesWithFiles) {
              if (message.filePath) {
                let diskPath = '';
                if (message.filePath.startsWith('/media/')) {
                  diskPath = path.join(UPLOAD_BASE_DIR, message.filePath.substring(1));
                } else if (message.filePath.startsWith('/uploads/')) {
                  diskPath = path.join(__dirname, '..', message.filePath.replace('/uploads/', 'uploads/'));
                }

                try {
                  if (fs.existsSync(diskPath)) {
                    fs.unlinkSync(diskPath);
                    console.log(`Deleted file on group dissolution: ${diskPath}`);
                  }
                } catch (err) {
                  console.error(`Failed to delete file on group dissolution ${diskPath}:`, err);
                }
              }
            }

            await Message.deleteMany({ chatId: chat._id });
            await Chat.findByIdAndDelete(chatId);
            console.log(`Last participant (admin ${userId}) left group ${chatId}. Group and messages deleted.`);
            io.to(userId.toString()).emit('chat_deleted_globally', { 
              chatId: chatId, 
              deletedBy: userId 
            });
            return res.json({ message: 'You have left the group, and the group has been deleted as you were the last participant.' });
          } else {
            const newAdminId = chat.participants[0];
            chat.admin = [newAdminId]; 
            console.log(`Admin ${userId} left group ${chatId}. New admin is ${newAdminId}.`);
          }
        }
      } else if (chat.admin && chat.admin.toString() === userId) {
        if (chat.participants.length === 0) {
          const messagesWithFiles = await Message.find({ 
            chatId: chat._id, 
            filePath: { $exists: true, $ne: null, $ne: '' } 
          }).select('filePath').lean();

          const UPLOAD_BASE_DIR = path.resolve(__dirname, '../uploads');
          for (const message of messagesWithFiles) {
            if (message.filePath) {
              let diskPath = '';
              if (message.filePath.startsWith('/media/')) {
                diskPath = path.join(UPLOAD_BASE_DIR, message.filePath.substring(1));
              } else if (message.filePath.startsWith('/uploads/')) {
                diskPath = path.join(__dirname, '..', message.filePath.replace('/uploads/', 'uploads/'));
              }

              try {
                if (fs.existsSync(diskPath)) {
                  fs.unlinkSync(diskPath);
                  console.log(`Deleted file on group dissolution: ${diskPath}`);
                }
              } catch (err) {
                console.error(`Failed to delete file on group dissolution ${diskPath}:`, err);
              }
            }
          }

          await Message.deleteMany({ chatId: chat._id });
          await Chat.findByIdAndDelete(chatId);
          console.log(`Last participant (admin ${userId}) left group ${chatId}. Group and messages deleted.`);
          io.to(userId.toString()).emit('chat_deleted_globally', { 
            chatId: chatId, 
            deletedBy: userId 
          });
          return res.json({ message: 'You have left the group, and the group has been deleted as you were the last participant.' });
        } else {
          const newAdminId = chat.participants[0];
          chat.admin = [newAdminId];
          console.log(`Admin ${userId} left group ${chatId}. New admin is ${newAdminId}.`);
        }
      }

      await chat.save();

      const systemMessageContent = `${leavingUserUsername} has left the group.`;
      const systemMessage = new Message({
        chatId: chatId,
        senderId: null,
        senderName: 'System',
        content: systemMessageContent,
        messageType: 'event',
        category: 'system_event',
        timestamp: new Date()
      });
    
      const savedSystemMessage = await systemMessage.save();
        const updatedChat = await Chat.findByIdAndUpdate(
        chatId,
        { 
          lastMessage: savedSystemMessage._id,
          updatedAt: new Date()
        },
        { new: true }
      )
      .populate('participants', '_id username avatar name')
      .populate('admin', '_id username avatar name')
      .populate({
        path: 'lastMessage',
        populate: { path: 'senderId', select: '_id username avatar name' }
      });

      if (updatedChat) {
        updatedChat.participants.forEach(participant => {
          io.to(participant._id.toString()).emit('chat_updated', updatedChat);
          io.to(participant._id.toString()).emit('receive_message', savedSystemMessage.toObject());
        });
      }
      
      io.to(userId.toString()).emit('user_removed_from_chat', { 
        chatId: chatId, 
        reason: 'left_group'
      });

      // res.json({ message: 'You have successfully left the group.' });

    } catch (error) {
      console.error('Error leaving group:', error);
      res.status(500).json({ message: 'Server error while leaving group.' });
    }
  });

  router.patch('/:chatId/group/name', authenticateToken, async (req, res) => {
    const { chatId } = req.params;
    const { name } = req.body;
    const userId = req.user.id;

    try {
      if (!name || name.trim().length < 1) {
        return res.status(400).json({ message: 'Group name cannot be empty.' });
      }

      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(404).json({ message: 'Group chat not found.' });
      }
      
      if (!chat.isGroupChat) {
        return res.status(400).json({ message: 'This is not a group chat.' });
      }

      const adminId = Array.isArray(chat.admin) 
        ? (chat.admin[0]?.toString() || '') 
        : (chat.admin?.toString() || '');
        
      if (adminId !== userId) {
        return res.status(403).json({ message: 'Only the group admin can change the group name.' });
      }

      chat.name = name.trim();
      chat.updatedAt = new Date();
      await chat.save();

      const updatedChat = await Chat.findById(chatId)
        .populate('participants', '_id username avatar name')
        .populate('admin', '_id username avatar name')
        .populate({
          path: 'lastMessage',
          populate: { path: 'senderId', select: '_id username avatar name' }
        });

      if (!updatedChat) {
        return res.status(500).json({ message: 'Failed to retrieve updated chat details.' });
      }

      updatedChat.participants.forEach(participant => {
        io.to(participant._id.toString()).emit('chat_updated', updatedChat);
      });

      res.json(updatedChat);
    } catch (error) {
      console.error('Error updating group name:', error);
      res.status(500).json({ message: 'Server error while updating group name.' });
    }
  });

  router.get('/:chatId/media', authenticateToken, async (req, res) => {
    const { chatId } = req.params;
    const userId = req.user.id;

    const typeFilter = req.query.type || 'images';
    const limit = parseInt(req.query.limit) || 30;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    try {
      const chat = await Chat.findOne({ _id: chatId, participants: userId });
      if (!chat) {
        return res.status(403).json({ message: 'Access denied or chat not found.' });
      }

      const queryConditions = {
        chatId: chatId,
        filePath: { $exists: true, $ne: null, $ne: '' }
      };

      if (typeFilter === 'images') {
        queryConditions.messageType = 'image';
      } else if (typeFilter === 'videos') {
        queryConditions.messageType = 'video';
      } else if (typeFilter === 'documents') {
        queryConditions.messageType = { $in: ['file', 'audio'] };
      } else {
        queryConditions.messageType = { $in: ['image', 'video', 'audio', 'file'] };
      }

      const mediaMessages = await Message.find(queryConditions)
        .sort({ createdAt: -1 }) 
        .skip(skip)
        .limit(limit)
        .populate('senderId', 'username') 
        .select('filePath originalFileName fileMimeType fileSize messageType senderId createdAt')
        .lean();

      const totalMediaCount = await Message.countDocuments(queryConditions);

      res.json({
        media: mediaMessages,
        currentPage: page,
        totalPages: Math.ceil(totalMediaCount / limit),
        totalCount: totalMediaCount,
      });

    } catch (error) {
      console.error(`Error fetching media for chat ${chatId}:`, error);
      res.status(500).json({ message: 'Server error while fetching media.' });
    }
  });
  
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
    try {
      const { recipientId } = req.body;
      const initiatorId = req.user.id;

      if (!recipientId) {
        return res.status(400).json({ message: 'Recipient ID is required.' });
      }
      if (recipientId === initiatorId) {
        return res.status(400).json({ message: 'Cannot create a chat with yourself using this endpoint. Use "Saved Messages".' });
      }
      
      const participantsArray = [initiatorId, recipientId].sort();

      let chat = await Chat.findOne({
        isGroupChat: false,
        participants: { $all: participantsArray, $size: 2 }, 
        type: { $ne: 'self' }
      })
      .populate('participants', '_id username avatar name')
      .populate({
          path: 'lastMessage',
          populate: { path: 'senderId', select: '_id username avatar name' }
      });
      
      let isNewChat = false;
      if (!chat) {
        isNewChat = true;
        const newChatDoc = new Chat({
          isGroupChat: false,
          participants: [initiatorId, recipientId],
          // messages: [],
          unreadCounts: participantsArray.map(pId => ({ userId: pId, count: 0 })),
        });
        
        chat = await newChatDoc.save();
        chat = await Chat.findById(chat._id)
          .populate('participants', '_id username avatar')
          .populate({
              path: 'lastMessage',
              populate: { path: 'senderId', select: '_id username avatar' }
          });
      }

      if (isNewChat && chat) {
        const chatObjectForEmit = chat.toObject();
        io.to(initiatorId.toString()).emit('new_chat_created', chatObjectForEmit);
        console.log(`Emitted 'new_chat_created' TO INITIATOR ${initiatorId} for chat ${chat._id}`);
      }

      res.status(isNewChat ? 201 : 200).json(chat);

    } catch (error) {
      console.error('CRITICAL ERROR creating or getting direct chat:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.get('/', authenticateToken, async (req, res) => {
      try {
          const userId = req.user.id;
          const chats = await Chat.find({ participants: userId })
          .populate('participants', '_id username avatar name')
          .populate('admin', '_id username avatar name')
          .populate({
            path: 'lastMessage',
            populate: { path: 'senderId', select: '_id username avatar name' }
          })
          .sort({ updatedAt: -1 });

          res.json(chats);
      } catch (error) {
          console.error(error);
          res.status(500).json({ error: 'Error getting chats' });
      }
  });

  router.get('/:id', authenticateToken, async (req, res) => {
    try {
      const chatId = req.params.id;
      const chat = await Chat.findById(chatId)
        .populate('participants', '_id username avatar name')
        .populate('admin', '_id username avatar name')
        .populate({
            path: 'lastMessage',
            populate: { path: 'senderId', select: '_id username avatar name' }
        })
        .populate({
            path: 'pinnedMessage',
            populate: { path: 'senderId', select: '_id username avatar name' }
        });
        
      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }
      
      res.json(chat);
    } catch (err) {
      console.error('Error getting chat details:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  router.delete('/:chatId', authenticateToken, async (req, res) => {
    try {
      const { chatId } = req.params;
      const userId = req.user.id;

      if (!mongoose.Types.ObjectId.isValid(chatId)) {
        return res.status(400).json({ message: 'Invalid Chat ID format.' });
      }

      const chat = await Chat.findById(chatId);

      if (!chat) {
        return res.status(404).json({ message: 'Chat not found.' });
      }

      if (chat.isGroupChat) {
        const isAdmin = Array.isArray(chat.admin) 
          ? chat.admin.some(adminId => adminId.toString() === userId) 
          : chat.admin && chat.admin.toString() === userId;
        if (!isAdmin) {
          return res.status(403).json({ message: 'Only the group admin can delete this group.' });
        }

        if (chat.groupAvatar && !chat.groupAvatar.includes('default-group-avatar')) {
          const avatarPath = path.join(__dirname, '..', chat.groupAvatar.replace('/uploads/', 'uploads/'));
          if (fs.existsSync(avatarPath)) {
            try {
              fs.unlinkSync(avatarPath);
              console.log(`Deleted group avatar: ${avatarPath}`);
            } catch (err) {
              console.error(`Failed to delete group avatar: ${avatarPath}`, err);
            }
          }
        }
      } else {
        const isParticipant = chat.participants.some(participantId => participantId.toString() === userId);
        if (!isParticipant) {
          return res.status(403).json({ message: 'Forbidden: You are not a participant of this chat.' });
        }
      }
      
      const participantIds = chat.participants.map(p => p.toString());

      const messagesWithFiles = await Message.find({ 
        chatId: chat._id, 
        filePath: { $exists: true, $ne: null, $ne: '' } 
      }).select('filePath').lean();

      console.log(`Found ${messagesWithFiles.length} messages with files to delete for chat ${chatId}`);

      const UPLOAD_BASE_DIR = path.resolve(__dirname, '../uploads');
      for (const message of messagesWithFiles) {
        if (message.filePath) {
          let diskPath = '';
          if (message.filePath.startsWith('/media/')) {
            diskPath = path.join(UPLOAD_BASE_DIR, message.filePath.substring(1));
          } else if (message.filePath.startsWith('/uploads/')) {
            diskPath = path.join(__dirname, '..', message.filePath.replace('/uploads/', 'uploads/'));
          } else {
            console.warn(`Unexpected filePath format: ${message.filePath}`);
            continue;
          }

          try {
            if (fs.existsSync(diskPath)) {
              fs.unlinkSync(diskPath);
              console.log(`Deleted file: ${diskPath}`);
            } else {
              console.warn(`File not found on disk: ${diskPath}`);
            }
          } catch (err) {
            console.error(`Failed to delete file ${diskPath}:`, err);
          }
        }
      }

      const deleteMessagesResult = await Message.deleteMany({ chatId: chat._id });
      console.log(`Deleted ${deleteMessagesResult.deletedCount} messages for chat ${chatId}`);

      await Chat.findByIdAndDelete(chatId);
      console.log(`Deleted chat ${chatId}`);

      participantIds.forEach(participantId => {
        io.to(participantId).emit('chat_deleted_globally', {
          chatId: chatId,
          deletedBy: userId
        });
        console.log(`Emitted 'chat_deleted_globally' to user room ${participantId} for chat ${chatId}`);
      });

      res.status(200).json({ message: 'Chat and all associated messages have been deleted successfully.' });

    } catch (error) {
      console.error('Error deleting chat:', error);
      res.status(500).json({ message: 'Server error while deleting chat.' });
    }
  });


  router.get('/me/saved-messages', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;

      let savedMessagesChat = await Chat.findOne({
        participants: { $eq: [userId], $size: 1 }
      })
      .populate('participants', '_id username avatar')
      .populate({
          path: 'lastMessage',
          populate: { path: 'senderId', select: '_id username avatar name' }
      });

      let isNewChat = false;
      if (!savedMessagesChat) {
        isNewChat = true;
        const newChatDoc = new Chat({
          participants: [userId],
          messages: [],
          type: 'self',
          unreadCounts: [{ userId: userId, count: 0 }],
        });
        savedMessagesChat = await newChatDoc.save();
        savedMessagesChat = await Chat.findById(savedMessagesChat._id)
          .populate('participants', '_id username avatar')
          .populate({
              path: 'lastMessage',
              populate: { path: 'senderId', select: '_id username avatar name' }
          });
      }

      if (isNewChat && savedMessagesChat) {
        io.to(userId.toString()).emit('new_chat_created', savedMessagesChat.toObject());
      }

      res.status(isNewChat ? 201 : 200).json(savedMessagesChat);

    } catch (error) {
      console.error('Error getting/creating saved messages chat:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.patch('/:chatId/pin/:messageId', authenticateToken, async (req, res) => {
    const { chatId, messageId } = req.params;
    const userId = req.user.id;

    try {
        const chat = await Chat.findOne({ _id: chatId, participants: userId });
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found or you are not a participant.' });
        }

        const messageExists = await Message.findOne({ _id: messageId, chatId: chatId });
        if (!messageExists) {
            return res.status(404).json({ message: 'Message not found in this chat.' });
        }

        chat.pinnedMessage = messageId;
        await chat.save();

        const updatedChat = await Chat.findById(chatId)
            .populate('participants', 'username avatar _id')
            .populate('lastMessage')
            .populate({
                path: 'pinnedMessage',
                populate: { path: 'senderId', select: 'username avatar _id' }
            });
        
        if (updatedChat) {
            io.to(chatId.toString()).emit('chat_updated', updatedChat);
        }
        
        res.json(updatedChat);

    } catch (error) {
        console.error('Error pinning message:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
  });

  router.patch('/:chatId/unpin', authenticateToken, async (req, res) => {
      const { chatId } = req.params;
      const userId = req.user.id;

      try {
          const chat = await Chat.findOne({ _id: chatId, participants: userId });
          if (!chat) {
              return res.status(404).json({ message: 'Chat not found or you are not a participant.' });
          }

          if (!chat.pinnedMessage) {
              return res.status(400).json({ message: 'No message is currently pinned in this chat.' });
          }

          chat.pinnedMessage = null;
          await chat.save();

          const updatedChat = await Chat.findById(chatId)
              .populate('participants', 'username avatar _id')
              .populate('lastMessage');

          if (updatedChat) {
              io.to(chatId.toString()).emit('chat_updated', updatedChat);
          }

          res.json(updatedChat);

      } catch (error) {
          console.error('Error unpinning message:', error);
          res.status(500).json({ message: 'Internal server error' });
    }
  });

  router.delete('/:chatId/group/avatar', authenticateToken, async (req, res) => {
    const { chatId } = req.params;
    const userId = req.user.id;

    try {
      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(404).json({ message: 'Group chat not found.' });
      }
      
      if (!chat.isGroupChat) {
        return res.status(400).json({ message: 'This is not a group chat.' });
      }

      // Check if user is admin
      const isAdmin = Array.isArray(chat.admin) 
        ? chat.admin.some(adminId => adminId.toString() === userId) 
        : chat.admin && chat.admin.toString() === userId;
        
      if (!isAdmin) {
        return res.status(403).json({ message: 'Only the group admin can delete the group avatar.' });
      }

      if (!chat.groupAvatar || chat.groupAvatar.includes('default-group-avatar')) {
        return res.status(400).json({ message: 'No custom avatar to delete.' });
      }

      const avatarPath = path.join(__dirname, '..', chat.groupAvatar.replace('/uploads/', 'uploads/'));
      if (fs.existsSync(avatarPath)) {
        try {
          fs.unlinkSync(avatarPath);
          console.log(`Deleted group avatar: ${avatarPath}`);
        } catch (err) {
          console.error(`Failed to delete group avatar: ${avatarPath}`, err);
          return res.status(500).json({ message: 'Failed to delete avatar file.' });
        }
      }

      // Reset to default avatar
      chat.groupAvatar = 'assets/images/default-group-avatar.png';
      await chat.save();

      const updatedChat = await Chat.findById(chatId)
        .populate('participants', '_id username avatar name')
        .populate('admin', '_id username avatar name')
        .populate({
          path: 'lastMessage',
          populate: { path: 'senderId', select: '_id username avatar name' }
        });

      updatedChat.participants.forEach(participant => {
        io.to(participant._id.toString()).emit('chat_updated', updatedChat);
      });

      res.json(updatedChat);

    } catch (error) {
      console.error('Error deleting group avatar:', error);
      res.status(500).json({ message: 'Server error while deleting group avatar' });
    }
  });
  return router;
};