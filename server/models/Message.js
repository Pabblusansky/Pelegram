import mongoose from "mongoose";

const reactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reaction: { type: String, required: true },
}, { _id: false });

const messageSchema = new mongoose.Schema({
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', },
    senderName: { type: String, required: true },
    content: { type: String, required: true },
    messageType: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'file', 'event'],
      default: 'text'
    },
    category: {
      type: String,
      enum: ['user_content', 'system_event'],
      default: 'user_content'
    },
    filePath: { type: String, default: null },        
    originalFileName: { type: String, default: null },
    fileMimeType: { type: String, default: null },
    fileSize: { type: Number, default: null },
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
    reactions: [reactionSchema],
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