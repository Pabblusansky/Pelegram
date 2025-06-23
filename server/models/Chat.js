import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    default: null,
  },
  isGroupChat: {
    type: Boolean,
    default: false,
  },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  admin: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }],
  groupAvatar: {
    type: String,
    default: null,
  },
  messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  unreadCounts: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    count: { type: Number, default: 0 }
  }],
  pinnedMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  updatedAt: { type: Date, default: Date.now },
}, {
  timestamps: true
});

const Chat = mongoose.model('Chat', chatSchema);

export default Chat;
