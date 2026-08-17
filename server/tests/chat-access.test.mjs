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
  emit() { return true; },
};

let mongo;
let app;
let insider;
let outsider;
let privateChat;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp(ioStub);

  insider = await User.create({
    username: 'insider', email: 'insider@example.com', password: 'password-one',
  });
  const partner = await User.create({
    username: 'partner', email: 'partner@example.com', password: 'password-two',
  });
  outsider = await User.create({
    username: 'outsider', email: 'outsider@example.com', password: 'password-three',
  });

  privateChat = await Chat.create({
    participants: [insider._id, partner._id],
  });

  await Message.create({
    chatId: privateChat._id,
    senderId: insider._id,
    senderName: 'insider',
    content: 'meet me at the usual place',
    status: 'sent',
  });
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('GET /messages/:chatId authorization', () => {
  test('a participant can read the chat', async () => {
    const res = await request(app)
      .get(`/messages/${privateChat._id}`)
      .set('Authorization', `Bearer ${generateAccessToken(insider._id.toString())}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
  });

  test('a non-participant cannot read the chat', async () => {
    const res = await request(app)
      .get(`/messages/${privateChat._id}`)
      .set('Authorization', `Bearer ${generateAccessToken(outsider._id.toString())}`);

    assert.ok(
      res.status === 403 || res.status === 404,
      `expected access to be denied, got ${res.status} with ${JSON.stringify(res.body).slice(0, 200)}`
    );
  });

  test('an unauthenticated caller cannot read the chat', async () => {
    const res = await request(app).get(`/messages/${privateChat._id}`);
    assert.equal(res.status, 401);
  });
});

describe('GET /chats/:id authorization', () => {
  test('a participant can read the chat details', async () => {
    const res = await request(app)
      .get(`/chats/${privateChat._id}`)
      .set('Authorization', `Bearer ${generateAccessToken(insider._id.toString())}`);

    assert.equal(res.status, 200);
    assert.equal(res.body._id, privateChat._id.toString());
  });

  test('a non-participant cannot read the chat details', async () => {
    const res = await request(app)
      .get(`/chats/${privateChat._id}`)
      .set('Authorization', `Bearer ${generateAccessToken(outsider._id.toString())}`);

    assert.ok(
      res.status === 403 || res.status === 404,
      `expected access to be denied, got ${res.status} with ${JSON.stringify(res.body).slice(0, 200)}`
    );
  });

  test('an unauthenticated caller cannot read the chat details', async () => {
    const res = await request(app).get(`/chats/${privateChat._id}`);
    assert.equal(res.status, 401);
  });
});
