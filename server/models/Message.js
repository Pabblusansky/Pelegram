import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
    edited: {
      type: Boolean,
      default: false
    },
    editedAt: {
      type: Date,
      default: null
    },
    forwarded: {
      type: Boolean,
      default: false
    },
    originalMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null
    },
    originalSenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    originalSenderName: {
      type: String,
      default: null
    },
    reactions: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reaction: { type: String }
    }],
    replyTo: {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
      senderName: { type: String },
      content: { type: String },
      senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }
  }, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

messageSchema.index({ chatId: 1, timestamp: -1 }); 
export default mongoose.model('Message', messageSchema);