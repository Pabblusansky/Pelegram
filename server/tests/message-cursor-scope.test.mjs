import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = process.env.SECRET_KEY ?? 'test-secret-that-is-long-enough-to-pass-validation';

const { createApp } = await import('../dist/app.js');
const { default: User } = await import('../dist/models/User.js');
const { default: Chat } = await import('../dist/models/Chat.js');
const { default: Message } = await import('../dist/models/Message.js');
const { generateAccessToken } = await import('../dist/utils/tokenUtils.js');

const ioStub = {
  to() { return this; },
  in() { return this; },
  emit() { return true; },
  socketsLeave() { return true; },
};

let mongo;
let app;
let ownChat;
let ownMessages;
let foreignMessage;
let token;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp(ioStub);

  const reader = await User.create({
    username: 'mcs-reader', email: 'mcs-reader@example.com', password: 'password-one',
  });
  const other = await User.create({
    username: 'mcs-other', email: 'mcs-other@example.com', password: 'password-two',
  });

  ownChat = await Chat.create({ participants: [reader._id] });
  const foreignChat = await Chat.create({ participants: [other._id] });

  ownMessages = [];
  for (let i = 0; i < 5; i++) {
    ownMessages.push(await Message.create({
      chatId: ownChat._id, senderId: reader._id, senderName: 'mcs-reader',
      content: `own-${i}`, timestamp: new Date(2026, 0, 1, 0, i),
    }));
  }

  // Timestamped in the middle of the window above, so a cursor honouring it
  // would visibly truncate the result set.
  foreignMessage = await Message.create({
    chatId: foreignChat._id, senderId: other._id, senderName: 'mcs-other',
    content: 'foreign', timestamp: new Date(2026, 0, 1, 0, 2),
  });

  token = generateAccessToken(reader._id.toString());
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const list = (before) => request(app)
  .get(`/messages/${ownChat._id}`)
  .query(before ? { before: before.toString() } : {})
  .set('Authorization', `Bearer ${token}`);

describe('message list cursor is scoped to the chat', () => {
  test('a cursor from another chat is ignored, not honoured', async () => {
    const res = await list(foreignMessage._id);

    assert.equal(res.status, 200);
    assert.equal(
      res.body.length, ownMessages.length,
      'a foreign message id must not shift the window, that reveals it exists and when it was sent'
    );
  });

  test('a cursor for a message that does not exist is ignored too', async () => {
    const res = await list(new mongoose.Types.ObjectId());

    assert.equal(res.status, 200);
    assert.equal(res.body.length, ownMessages.length);
  });

  test('the two are indistinguishable to the caller', async () => {
    const foreign = await list(foreignMessage._id);
    const absent = await list(new mongoose.Types.ObjectId());

    assert.deepEqual(
      foreign.body.map(m => m.content),
      absent.body.map(m => m.content),
      'an existing foreign id and a nonexistent id must produce identical results'
    );
  });

  test('a cursor from the caller\'s own chat still pages correctly', async () => {
    const res = await list(ownMessages[2]._id);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.map(m => m.content), ['own-0', 'own-1']);
  });
});
