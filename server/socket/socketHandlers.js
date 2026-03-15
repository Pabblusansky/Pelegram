import User from '../models/User.js';
import Message from '../models/Message.js';
import Chat from '../models/Chat.js';
import logger from '../config/logger.js';
import { CHAT_POPULATE, applyPopulate } from '../config/populate.js';
import { validateChatMembership, isValidObjectId, sanitizeText } from '../middleware/socketAuth.js';
import { updateUserStatus, getStatusSnapshot } from './userStatus.js';

export function registerSocketHandlers(io, socket) {
  sendInitialStatus(socket);

  socket.on('user_activity', () => handleUserActivity(socket));
  socket.on('user_logout_attempt', () => handleLogoutAttempt(socket));
  socket.on('send_message', (data, callback) => handleSendMessage(io, socket, data, callback));
  socket.on('typing', (data) => handleTyping(socket, data));
  socket.on('edit_message', (data) => handleEditMessage(io, socket, data));
  socket.on('toggle_reaction', (data) => handleToggleReaction(io, socket, data));
  socket.on('logout', () => handleLogout(socket));
  socket.on('join_chat', (chatId) => handleJoinChat(socket, chatId));
  socket.on('disconnect', () => handleDisconnect(socket));
}

function sendInitialStatus(socket) {
  const { userLastActive, onlineUsers } = getStatusSnapshot();
  socket.emit('user_status_update', Object.fromEntries(
    Array.from(userLastActive.entries()).map(([userId, lastActive]) => [
      userId,
      { lastActive, online: onlineUsers.has(userId) },
    ])
  ));
}

function handleUserActivity(socket) {
  if (socket.user && socket.user.id) {
    updateUserStatus(socket.user.id, true);
  }
}

async function handleLogoutAttempt(socket) {
  const userId = socket.user ? socket.user.id : null;
  if (!userId) return;

  updateUserStatus(userId, false);
  try {
    await User.findByIdAndUpdate(userId, { online: false, lastActive: new Date() });
  } catch (error) {
    logger.error(`Error updating user status on logout for ${userId}:`, error);
  }
}

async function handleSendMessage(io, socket, data, callback) {
  const { chatId, replyTo, fileInfo, messageType = 'text' } = data;
  const content = sanitizeText(data.content);
  const senderId = socket.user.id;

  if (!isValidObjectId(chatId)) {
    if (typeof callback === 'function') callback({ success: false, error: 'Invalid chat ID' });
    return;
  }
  if (!content && !fileInfo) {
    if (typeof callback === 'function') callback({ success: false, error: 'Message content is required' });
    return;
  }

  try {
    const sender = await User.findById(senderId).select('username avatar').lean();
    if (!sender) {
      if (typeof callback === 'function') callback({ success: false, error: 'Sender not found' });
      return;
    }

    const chatBeforeMessage = await Chat.findById(chatId);
    if (!chatBeforeMessage) {
      logger.error(`Error sending message: Chat with ID ${chatId} not found.`);
      if (typeof callback === 'function') callback({ success: false, error: 'Chat not found' });
      return;
    }

    if (!chatBeforeMessage.participants.some(p => p.toString() === senderId.toString())) {
      if (typeof callback === 'function') callback({ success: false, error: 'Not a participant of this chat' });
      return;
    }
    const isFirstMessageInChat = chatBeforeMessage.messages.length === 0;

    const message = new Message({
      chatId,
      senderId,
      senderName: sender.username,
      content,
      status: 'sent',
      messageType: messageType,
      filePath: fileInfo ? fileInfo.filePath : null,
      fileName: fileInfo ? fileInfo.fileName : null,
      fileSize: fileInfo ? fileInfo.fileSize : null,
      fileMimeType: fileInfo ? fileInfo.fileMimeType : null,
      fileOriginalName: fileInfo ? fileInfo.fileOriginalName : null,
      fileThumbnailPath: fileInfo ? fileInfo.thumbnailPath : null,
    });

    if (replyTo && replyTo._id) {
      message.replyTo = {
        _id: replyTo._id,
        senderName: replyTo.senderName,
        content: replyTo.content,
        senderId: replyTo.senderId,
      };
    }

    await message.save();

    chatBeforeMessage.lastMessage = message._id;
    chatBeforeMessage.updatedAt = new Date();

    if (chatBeforeMessage.participants && Array.isArray(chatBeforeMessage.unreadCounts)) {
      chatBeforeMessage.participants.forEach(participantObjectId => {
        const participantIdString = participantObjectId.toString();
        if (participantIdString !== senderId.toString()) {
          let unreadEntry = chatBeforeMessage.unreadCounts.find(uc =>
            uc.userId.toString() === participantIdString
          );

          if (unreadEntry) {
            unreadEntry.count = (unreadEntry.count || 0) + 1;
          } else {
            chatBeforeMessage.unreadCounts.push({
              userId: participantObjectId,
              count: 1,
            });
          }
        }
      });
    }

    await chatBeforeMessage.save();

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const messageForClient = {
      ...message.toObject(),
      senderAvatar: sender.avatar ? `${baseUrl}${sender.avatar}` : null,
    };
    if (messageForClient.replyTo && messageForClient.replyTo.senderId) {
      const originalSenderForReply = await User.findById(messageForClient.replyTo.senderId).select('avatar').lean();
      messageForClient.replyTo.senderAvatar = originalSenderForReply?.avatar
        ? `${baseUrl}${originalSenderForReply.avatar}`
        : null;
    }

    io.to(chatId).emit('receive_message', messageForClient);

    const updatedChat = await applyPopulate(
      Chat.findById(chatId),
      CHAT_POPULATE
    ).lean();
    if (updatedChat) {
      if (updatedChat.lastMessage && updatedChat.lastMessage.senderId && typeof updatedChat.lastMessage.senderId === 'object') {
        const lmSender = updatedChat.lastMessage.senderId;
        updatedChat.lastMessage.senderAvatar = lmSender.avatar
          ? `${baseUrl}${lmSender.avatar}`
          : null;
      }
      io.to(chatId).emit('chat_updated', updatedChat);
    }

    if (isFirstMessageInChat && updatedChat) {
      updatedChat.participants.forEach(participant => {
        if (participant && participant._id) {
          io.to(participant._id.toString()).emit('new_chat_created', updatedChat);
        }
      });
    }
    if (typeof callback === 'function') {
      callback({ success: true, message: messageForClient });
    }

    scheduleDeliveryStatus(io, chatId, message._id, senderId);
  } catch (err) {
    logger.error('Error sending message:', err);
    if (typeof callback === 'function') {
      callback({ success: false, error: err.message || 'Server error while sending message' });
    }
  }
}

async function scheduleDeliveryStatus(io, chatId, messageId, senderId) {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    const chat = await Chat.findById(chatId).lean();
    if (!chat) return;

    const recipients = chat.participants.filter(p_id => p_id.toString() !== senderId.toString());

    if (recipients.length > 0) {
      const updated = await Message.findOneAndUpdate(
        { _id: messageId, status: 'sent' },
        { $set: { status: 'delivered' } },
        { new: true }
      );

      if (updated) {
        io.to(chatId).emit('messageStatusUpdated', {
          messageId: messageId,
          status: 'delivered',
        });
      }
    }
  } catch (err) {
    logger.error(`Error in background status update for message ${messageId}:`, err);
  }
}

async function handleTyping(socket, data) {
  const { chatId, isTyping } = data;
  if (!isValidObjectId(chatId)) return;
  const senderId = socket.user.id;
  const chat = await validateChatMembership(chatId, senderId);
  if (!chat) return;
  socket.to(chatId).emit('typing', { chatId, senderId, isTyping: !!isTyping });
}

async function handleEditMessage(io, socket, data) {
  try {
    const { messageId } = data;
    const content = sanitizeText(data.content);
    const userId = socket.user.id;

    if (!isValidObjectId(messageId) || !content) {
      socket.emit('edit_error', { error: 'Invalid message ID or empty content' });
      return;
    }

    const message = await Message.findById(messageId);
    if (!message) {
      socket.emit('edit_error', { error: 'Message not found' });
      return;
    }

    if (message.senderId.toString() !== userId) {
      socket.emit('edit_error', { error: 'Not authorized to edit this message' });
      return;
    }

    message.content = content;
    message.edited = true;
    message.editedAt = new Date();
    await message.save();

    io.to(message.chatId.toString()).emit('message_edited', message);

    socket.emit('edit_success', message);
  } catch (err) {
    logger.error('Edit message error:', err);
    socket.emit('edit_error', { error: err.message });
  }
}

async function handleToggleReaction(io, socket, data) {
  const { messageId, reactionType } = data;

  if (!socket.user || !socket.user.id) {
    socket.emit('reaction_error', { messageId, error: 'User not authenticated for reaction.' });
    return;
  }
  if (!isValidObjectId(messageId) || typeof reactionType !== 'string' || !reactionType.trim()) {
    socket.emit('reaction_error', { messageId, error: 'Invalid reaction data.' });
    return;
  }

  const userId = socket.user.id;

  try {
    const message = await Message.findById(messageId);
    if (!message) {
      socket.emit('reaction_error', { messageId, error: 'Message not found.' });
      return;
    }

    const chat = await validateChatMembership(message.chatId, userId);
    if (!chat) {
      socket.emit('reaction_error', { messageId, error: 'Not a participant of this chat.' });
      return;
    }

    const existingReactionIndex = message.reactions.findIndex(
      (r) => r.userId.toString() === userId.toString()
    );

    let reactionChanged = false;

    if (existingReactionIndex !== -1) {
      if (message.reactions[existingReactionIndex].reaction === reactionType) {
        message.reactions.splice(existingReactionIndex, 1);
        reactionChanged = true;
      } else {
        message.reactions[existingReactionIndex].reaction = reactionType;
        reactionChanged = true;
      }
    } else {
      message.reactions.push({ userId, reaction: reactionType });
      reactionChanged = true;
    }

    if (reactionChanged) {
      await message.save();
      io.to(message.chatId.toString()).emit('message_reaction_updated', {
        messageId: message._id,
        reactions: message.reactions,
      });
    }
  } catch (error) {
    logger.error('Error toggling reaction:', error);
    socket.emit('reaction_error', { messageId, error: 'Server error processing reaction.' });
  }
}

function handleLogout(socket) {
  if (socket.user && socket.user.id) {
    updateUserStatus(socket.user.id, false);
  }
}

async function handleJoinChat(socket, chatId) {
  if (!isValidObjectId(chatId)) return;
  const chat = await validateChatMembership(chatId, socket.user.id);
  if (!chat) {
    socket.emit('error', { message: 'Not a participant of this chat' });
    return;
  }
  socket.join(chatId);
}

function handleDisconnect(socket) {
  if (socket.user && socket.user.id) {
    updateUserStatus(socket.user.id, false);
  }
}
