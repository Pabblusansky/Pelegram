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

const ioStub = { to() { return this; }, emit() { return true; } };

const TOTAL = 75;

let mongo;
let app;
let owner;
let chat;
let auth;

const numbersOf = (body) =>
  body.map(m => Number((m.content || '').match(/msg-(\d+)/)?.[1]));

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp(ioStub);

  owner = await User.create({ username: 'order-owner', email: 'order-owner@example.com', password: 'password-one' });
  const peer = await User.create({ username: 'order-peer', email: 'order-peer@example.com', password: 'password-two' });
  chat = await Chat.create({ participants: [owner._id, peer._id] });
  auth = `Bearer ${generateAccessToken(owner._id.toString())}`;

  // createdAt is deliberately inserted in the REVERSE order of timestamp. Any query that
  // orders or paginates by createdAt will disagree with the displayed timestamp order.
  const base = Date.now() - TOTAL * 60_000;
  const docs = [];
  for (let i = 1; i <= TOTAL; i++) {
    docs.push({
      chatId: chat._id,
      senderId: owner._id,
      senderName: 'order-owner',
      content: `msg-${i}`,
      status: 'sent',
      timestamp: new Date(base + i * 60_000),
      createdAt: new Date(base + (TOTAL - i) * 60_000),
      updatedAt: new Date(base + (TOTAL - i) * 60_000),
    });
  }
  await Message.insertMany(docs, { timestamps: false });
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('message list ordering', () => {
  test('returns the newest messages in ascending timestamp order', async () => {
    const res = await request(app)
      .get(`/messages/${chat._id}?limit=30`)
      .set('Authorization', auth);

    assert.equal(res.status, 200);
    const nums = numbersOf(res.body);

    assert.equal(nums.length, 30);
    assert.deepEqual(nums, [...nums].sort((a, b) => a - b), 'messages must be ascending by timestamp');
    assert.equal(nums[nums.length - 1], TOTAL, 'the newest message must be last');
    assert.equal(nums[0], TOTAL - 29, 'the page must be the newest 30 messages');
  });
});

describe('message list pagination', () => {
  test('paging back with "before" never skips or repeats a message', async () => {
    const pageSize = 20;
    const seen = [];

    let res = await request(app)
      .get(`/messages/${chat._id}?limit=${pageSize}`)
      .set('Authorization', auth);
    assert.equal(res.status, 200);
    seen.unshift(...numbersOf(res.body));

    for (let page = 0; page < 3; page++) {
      const oldestId = res.body[0]?._id;
      if (!oldestId) break;

      res = await request(app)
        .get(`/messages/${chat._id}?limit=${pageSize}&before=${oldestId}`)
        .set('Authorization', auth);
      assert.equal(res.status, 200);

      const nums = numbersOf(res.body);
      assert.deepEqual(nums, [...nums].sort((a, b) => a - b), 'each page must be ascending');
      seen.unshift(...nums);
    }

    const unique = new Set(seen);
    assert.equal(unique.size, seen.length, `pagination repeated messages: ${seen.length - unique.size} duplicates`);
    assert.deepEqual(seen, [...seen].sort((a, b) => a - b), 'combined pages must be in order');

    const expected = Array.from({ length: seen.length }, (_, i) => TOTAL - seen.length + 1 + i);
    assert.deepEqual(seen, expected, 'pagination must walk back contiguously with no gaps');
  });
});

describe('jump to message context', () => {
  test('returns a contiguous window centred on the target', async () => {
    const target = await Message.findOne({ chatId: chat._id, content: 'msg-40' });

    const res = await request(app)
      .get(`/messages/${chat._id}/context/${target._id}?limit=10`)
      .set('Authorization', auth);

    assert.equal(res.status, 200);
    const nums = numbersOf(Array.isArray(res.body) ? res.body : res.body.messages ?? []);

    assert.ok(nums.length > 0, 'context window must not be empty');
    assert.deepEqual(nums, [...nums].sort((a, b) => a - b), 'context must be in ascending order');
    assert.ok(nums.includes(40), 'context must contain the target message');

    for (let i = 1; i < nums.length; i++) {
      assert.equal(nums[i], nums[i - 1] + 1, `context has a gap between ${nums[i - 1]} and ${nums[i]}`);
    }
  });
});
