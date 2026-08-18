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

describe('POST /messages authorization', () => {
  test('a non-participant cannot post into the chat', async () => {
    const res = await request(app)
      .post('/messages')
      .set('Authorization', `Bearer ${generateAccessToken(outsider._id.toString())}`)
      .send({ chatId: privateChat._id.toString(), content: 'forged message' });

    assert.ok(
      res.status === 403 || res.status === 404,
      `expected posting to be denied, got ${res.status}`
    );

    const forged = await Message.findOne({ content: 'forged message' });
    assert.equal(forged, null, 'the forged message must not be stored');
  });

  test('a participant can post into the chat', async () => {
    const res = await request(app)
      .post('/messages')
      .set('Authorization', `Bearer ${generateAccessToken(insider._id.toString())}`)
      .send({ chatId: privateChat._id.toString(), content: 'legitimate message' });

    assert.equal(res.status, 201, `expected the participant post to succeed, got ${res.status}`);
  });

  test('an unauthenticated caller cannot post', async () => {
    const res = await request(app)
      .post('/messages')
      .send({ chatId: privateChat._id.toString(), content: 'anonymous message' });

    assert.equal(res.status, 401);
  });
});

describe('message forwarding authorization', () => {
  test('cannot forward a message out of a chat the caller is not in', async () => {
    const secret = await Message.findOne({ content: 'meet me at the usual place' });
    const outsiderChat = await Chat.create({ participants: [outsider._id] , type: 'self' });

    const res = await request(app)
      .post(`/messages/${secret._id}/forward`)
      .set('Authorization', `Bearer ${generateAccessToken(outsider._id.toString())}`)
      .send({ targetChatId: outsiderChat._id.toString() });

    assert.ok(
      res.status === 403 || res.status === 404,
      `expected forwarding to be denied, got ${res.status}`
    );

    const leaked = await Message.findOne({
      chatId: outsiderChat._id,
      content: 'meet me at the usual place',
    });
    assert.equal(leaked, null, 'private content must not be copied into the outsider chat');
  });
});

describe('forward-multiple happy path', () => {
  test('a participant can forward their own messages', async () => {
    const secret = await Message.findOne({ content: 'meet me at the usual place' });
    const ownChat = await Chat.create({ participants: [insider._id], type: 'self' });

    const res = await request(app)
      .post('/messages/forward-multiple')
      .set('Authorization', `Bearer ${generateAccessToken(insider._id.toString())}`)
      .send({ messageIds: [secret._id.toString()], targetChatId: ownChat._id.toString() });

    assert.ok(
      res.status === 200 || res.status === 201,
      `a participant should be able to forward, got ${res.status} ${JSON.stringify(res.body).slice(0, 120)}`
    );
  });
});

describe('malformed chat ids are denied, not crashed', () => {
  test('GET /messages/:chatId with a non-ObjectId is denied', async () => {
    const res = await request(app)
      .get('/messages/not-a-real-object-id')
      .set('Authorization', `Bearer ${generateAccessToken(insider._id.toString())}`);

    assert.ok(
      res.status === 403 || res.status === 404,
      `expected a denial, got ${res.status}`
    );
  });

  test('file upload with a non-ObjectId chat is denied', async () => {
    const res = await request(app)
      .post('/api/files/upload/chat/not-a-real-object-id')
      .set('Authorization', `Bearer ${generateAccessToken(insider._id.toString())}`)
      .send({});

    assert.ok(
      res.status === 403 || res.status === 404,
      `expected a denial, got ${res.status}`
    );
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
