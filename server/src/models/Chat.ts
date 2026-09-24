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
  lastMessage?: Types.ObjectId;
  unreadCounts: IUnreadCount[];
  pinnedMessage?: Types.ObjectId | null;
  directKey?: string;
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
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    unreadCounts: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        count: { type: Number, default: 0 },
      },
    ],
    pinnedMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    // Set only on one-to-one chats: the two participant ids, sorted and
    // joined. The unique index below makes a second chat for the same pair
    // impossible, even when both users start one at the same moment.
    directKey: { type: String, default: undefined },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

chatSchema.index({ participants: 1, updatedAt: -1 });
chatSchema.index({ 'unreadCounts.userId': 1 });
chatSchema.index(
  { directKey: 1 },
  { unique: true, partialFilterExpression: { directKey: { $type: 'string' } } }
);

const Chat: Model<IChat> = mongoose.model<IChat>('Chat', chatSchema);
export default Chat;
