import mongoose, { Document, Model, Types } from 'mongoose';

export interface IReaction {
  userId: Types.ObjectId;
  reaction: string;
}

export interface IReadReceipt {
  userId: Types.ObjectId;
  readAt: Date;
}

export interface IReplyTo {
  _id?: Types.ObjectId;
  senderName?: string;
  content?: string;
  senderId?: Types.ObjectId;
}

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'event';
export type MessageCategory = 'user_content' | 'system_event';
export type MessageStatus = 'sent' | 'delivered' | 'read';

export interface IMessage extends Document {
  chatId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderName: string;
  content?: string;
  messageType: MessageType;
  category: MessageCategory;
  filePath?: string | null;
  duration: number;
  originalFileName?: string | null;
  fileMimeType?: string | null;
  fileSize?: number | null;
  timestamp: Date;
  status: MessageStatus;
  edited: boolean;
  editedAt?: Date | null;
  forwarded: boolean;
  originalMessageId?: Types.ObjectId | null;
  originalSenderId?: Types.ObjectId | null;
  originalSenderName?: string | null;
  reactions: IReaction[];
  readBy: IReadReceipt[];
  replyTo?: IReplyTo;
  createdAt: Date;
  updatedAt: Date;
}

const reactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reaction: { type: String, required: true },
  },
  { _id: false }
);

const readReceiptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    readAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema<IMessage>(
  {
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    senderName: { type: String, required: true },
    content: { type: String },
    messageType: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'file', 'event'],
      default: 'text',
    },
    category: {
      type: String,
      enum: ['user_content', 'system_event'],
      default: 'user_content',
    },
    filePath: { type: String, default: null },
    duration: { type: Number, default: 0 },
    originalFileName: { type: String, default: null },
    fileMimeType: { type: String, default: null },
    fileSize: { type: Number, default: null },
    timestamp: { type: Date, default: Date.now },
    status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
    edited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    forwarded: { type: Boolean, default: false },
    originalMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    originalSenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    originalSenderName: { type: String, default: null },
    reactions: [reactionSchema],
    readBy: { type: [readReceiptSchema], default: [] },
    replyTo: {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
      senderName: { type: String },
      content: { type: String },
      senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

messageSchema.index({ chatId: 1, timestamp: -1 });

const Message: Model<IMessage> = mongoose.model<IMessage>('Message', messageSchema);
export default Message;
