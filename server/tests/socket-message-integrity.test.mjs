import test, { before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = process.env.SECRET_KEY ?? 'test-secret-that-is-long-enough-to-pass-validation';

const { registerSocketHandlers } = await import('../dist/socket/socketHandlers.js');
const { default: User } = await import('../dist/models/User.js');
const { default: Chat } = await import('../dist/models/Chat.js');
const { default: Message } = await import('../dist/models/Message.js');

let mongo;
let sender;
let victim;
let chat;
let quoted;

// Minimal stand-ins for the socket.io server and socket, capturing the
// handlers registered on connection so they can be invoked directly.
function buildSocket(userId) {
  const handlers = new Map();
  const socket = {
    user: { id: userId },
    on(event, handler) { handlers.set(event, handler); },
    emit() { return true; },
    to() { return { emit() { return true; } }; },
    join() { return true; },
    handlers,
  };
  return socket;
}

const ioStub = {
  to() { return this; },
  in() { return this; },
  emit() { return true; },
  socketsLeave() { return true; },
};

const send = (socket, data) => new Promise((resolve) => {
  socket.handlers.get('send_message')(data, resolve);
});

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  sender = await User.create({
    username: 'smi-sender', email: 'smi-sender@example.com', password: 'password-one',
  });
  victim = await User.create({
    username: 'smi-victim', email: 'smi-victim@example.com', password: 'password-two',
  });

  chat = await Chat.create({ participants: [sender._id, victim._id] });
  quoted = await Message.create({
    chatId: chat._id, senderId: victim._id, senderName: 'smi-victim', content: 'what I really said',
  });
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

let socket;
beforeEach(() => {
  socket = buildSocket(sender._id.toString());
  registerSocketHandlers(ioStub, socket);
});

describe('send_message does not accept client-supplied file metadata', () => {
  test('a filePath in the payload is not persisted', async () => {
    const ack = await send(socket, {
      chatId: chat._id.toString(),
      content: 'attachment',
      fileInfo: { filePath: '/media/../../../../etc/passwd' },
      messageType: 'file',
    });

    assert.equal(ack.success, true);

    const stored = await Message.findById(ack.message._id).lean();
    assert.equal(
      stored.filePath, null,
      'a client-supplied filePath must never reach the database, it steers the unlink sinks'
    );
  });

  test('a client-supplied messageType cannot forge a system event', async () => {
    const ack = await send(socket, {
      chatId: chat._id.toString(),
      content: 'smi-victim was removed from the group.',
      messageType: 'event',
    });

    assert.equal(ack.success, true);

    const stored = await Message.findById(ack.message._id).lean();
    assert.equal(stored.messageType, 'text', 'only the server may author system events');
    assert.equal(stored.category, 'user_content');
  });
});

describe('send_message does not accept a forged quote', () => {
  test('the quoted text is read back from the original message', async () => {
    const ack = await send(socket, {
      chatId: chat._id.toString(),
      content: 'see above',
      replyTo: {
        _id: quoted._id.toString(),
        senderName: 'smi-victim',
        content: 'something I never wrote',
        senderId: victim._id.toString(),
      },
    });

    assert.equal(ack.success, true);

    const stored = await Message.findById(ack.message._id).lean();
    assert.equal(
      stored.replyTo.content, 'what I really said',
      'the quote must come from the stored message, not the payload'
    );
    assert.equal(stored.replyTo.senderName, 'smi-victim');
  });

  test('a quote cannot lift content out of another chat', async () => {
    const otherChat = await Chat.create({ participants: [victim._id] });
    const secret = await Message.create({
      chatId: otherChat._id, senderId: victim._id, senderName: 'smi-victim', content: 'private',
    });

    const ack = await send(socket, {
      chatId: chat._id.toString(),
      content: 'see above',
      replyTo: { _id: secret._id.toString() },
    });

    assert.equal(ack.success, true);

    const stored = await Message.findById(ack.message._id).lean();
    assert.ok(
      !stored.replyTo || stored.replyTo.content === undefined,
      'a message from a chat the sender cannot read must not be quotable'
    );
  });

  test('a message with no content is still rejected', async () => {
    const ack = await send(socket, { chatId: chat._id.toString(), content: '   ' });

    assert.equal(ack.success, false);
  });
});
