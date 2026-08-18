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
const { MAX_MESSAGE_LENGTH } = await import('../dist/schemas/message.schema.js');
const { generateAccessToken } = await import('../dist/utils/tokenUtils.js');

const ioStub = {
  to() { return this; },
  emit() { return true; },
};

let mongo;
let app;
let insider;
let outsider;
let ownChat;
let foreignChat;
let foreignMessage;
let ownMessage;
let token;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp(ioStub);

  insider = await User.create({
    username: 'mv-insider', email: 'mv-insider@example.com', password: 'password-one',
  });
  outsider = await User.create({
    username: 'mv-outsider', email: 'mv-outsider@example.com', password: 'password-two',
  });

  ownChat = await Chat.create({ participants: [insider._id] });
  foreignChat = await Chat.create({ participants: [outsider._id] });

  ownMessage = await Message.create({
    chatId: ownChat._id, senderId: insider._id, senderName: 'mv-insider', content: 'mine',
  });
  foreignMessage = await Message.create({
    chatId: foreignChat._id, senderId: outsider._id, senderName: 'mv-outsider', content: 'private',
  });

  token = generateAccessToken(insider._id.toString());
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('GET /messages/:chatId/context/:messageId', () => {
  test('a message from another chat is not accepted as the anchor', async () => {
    const res = await request(app)
      .get(`/messages/${ownChat._id}/context/${foreignMessage._id}`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(
      res.status, 404,
      'pairing a readable chat with a foreign message id must not confirm that message exists'
    );
  });

  test('a message from the caller\'s own chat still works', async () => {
    const res = await request(app)
      .get(`/messages/${ownChat._id}/context/${ownMessage._id}`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
  });

  test('a non-participant cannot reach the endpoint at all', async () => {
    const res = await request(app)
      .get(`/messages/${foreignChat._id}/context/${foreignMessage._id}`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 403);
  });
});

describe('PATCH /messages/:id validation', () => {
  test('rejects content beyond the message length cap', async () => {
    const res = await request(app)
      .patch(`/messages/${ownMessage._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'A'.repeat(MAX_MESSAGE_LENGTH + 1) });

    assert.equal(res.status, 400, 'the REST edit path must apply the same cap as the socket path');

    const stored = await Message.findById(ownMessage._id).lean();
    assert.ok(
      stored.content.length <= MAX_MESSAGE_LENGTH,
      'an oversized edit must not reach the database'
    );
  });

  test('rejects a missing content field instead of blanking the message', async () => {
    const res = await request(app)
      .patch(`/messages/${ownMessage._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    assert.equal(res.status, 400);

    const stored = await Message.findById(ownMessage._id).lean();
    assert.equal(stored.content, 'mine', 'the stored content must be untouched');
  });

  test('rejects a non-string content field', async () => {
    const res = await request(app)
      .patch(`/messages/${ownMessage._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: { $ne: null } });

    assert.equal(res.status, 400, 'an operator object must never reach the update');
  });

  test('accepts a normal edit', async () => {
    const res = await request(app)
      .patch(`/messages/${ownMessage._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'edited' });

    assert.equal(res.status, 200);
    assert.equal(res.body.content, 'edited');
    assert.equal(res.body.edited, true);
  });

  test('a non-sender still cannot edit', async () => {
    const res = await request(app)
      .patch(`/messages/${ownMessage._id}`)
      .set('Authorization', `Bearer ${generateAccessToken(outsider._id.toString())}`)
      .send({ content: 'hijacked' });

    assert.equal(res.status, 403);
  });
});

describe('GET /messages/:chatId query validation', () => {
  test('caps the page size instead of returning the whole history', async () => {
    const res = await request(app)
      .get(`/messages/${ownChat._id}`)
      .query({ limit: '100000' })
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 400, 'an uncapped limit lets one request pull an entire chat');
  });

  test('rejects a non-numeric limit rather than ignoring it', async () => {
    const res = await request(app)
      .get(`/messages/${ownChat._id}`)
      .query({ limit: 'abc' })
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 400);
  });

  test('rejects a malformed cursor instead of raising a server error', async () => {
    const res = await request(app)
      .get(`/messages/${ownChat._id}`)
      .query({ before: 'not-an-object-id' })
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 400, 'a bad cursor is a client error, not a 500');
  });

  test('a valid request is unaffected', async () => {
    const res = await request(app)
      .get(`/messages/${ownChat._id}`)
      .query({ limit: '10' })
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});
