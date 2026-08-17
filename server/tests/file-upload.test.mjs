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

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

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
    username: 'up-insider', email: 'up-insider@example.com', password: 'password-one',
  });
  const partner = await User.create({
    username: 'up-partner', email: 'up-partner@example.com', password: 'password-two',
  });
  outsider = await User.create({
    username: 'up-outsider', email: 'up-outsider@example.com', password: 'password-three',
  });

  privateChat = await Chat.create({ participants: [insider._id, partner._id] });
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('POST /api/files/upload/chat/:chatId authorization', () => {
  test('a non-participant cannot upload into the chat', async () => {
    const res = await request(app)
      .post(`/api/files/upload/chat/${privateChat._id}`)
      .set('Authorization', `Bearer ${generateAccessToken(outsider._id.toString())}`)
      .attach('mediaFile', onePixelPng, 'pixel.png');

    assert.ok(
      res.status === 403 || res.status === 404,
      `expected upload to be denied, got ${res.status}`
    );
  });

  test('a denied upload does not inject a message into the chat', async () => {
    const count = await Message.countDocuments({ chatId: privateChat._id });
    assert.equal(count, 0, 'no message should have been created by the denied upload');
  });

  test('an unauthenticated caller cannot upload', async () => {
    const res = await request(app)
      .post(`/api/files/upload/chat/${privateChat._id}`)
      .attach('mediaFile', onePixelPng, 'pixel.png');

    assert.equal(res.status, 401);
  });

  test('a participant can upload', async () => {
    const res = await request(app)
      .post(`/api/files/upload/chat/${privateChat._id}`)
      .set('Authorization', `Bearer ${generateAccessToken(insider._id.toString())}`)
      .attach('mediaFile', onePixelPng, 'pixel.png');

    assert.equal(res.status, 201, `expected the participant upload to succeed, got ${res.status}`);
  });
});
