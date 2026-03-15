import mongoose, { Document, Model, Types } from 'mongoose';

export interface IUnreadCount {
  userId: Types.ObjectId;
  count: number;
}

export interface IChat extends Document {
  name?: string | null;
  isGroupChat: boolean;
  participants: Types.ObjectId[];
  admin: Types.ObjectId[];
  groupAvatar?: string | null;
  messages: Types.ObjectId[];
  lastMessage?: Types.ObjectId;
  unreadCounts: IUnreadCount[];
  pinnedMessage?: Types.ObjectId | null;
  updatedAt: Date;
  createdAt: Date;
}

const chatSchema = new mongoose.Schema<IChat>(
  {
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
    unreadCounts: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        count: { type: Number, default: 0 },
      },
    ],
    pinnedMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

const Chat: Model<IChat> = mongoose.model<IChat>('Chat', chatSchema);
export default Chat;
