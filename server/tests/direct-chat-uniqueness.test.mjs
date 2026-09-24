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
const { generateAccessToken } = await import('../dist/utils/tokenUtils.js');
const { directChatKey } = await import('../dist/utils/directChat.js');

const ioStub = {
  to() { return this; },
  in() { return this; },
  emit() { return true; },
  socketsLeave() { return true; },
};

let mongo;
let app;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Chat.syncIndexes();
  app = createApp(ioStub);
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const makeUser = (name) => User.create({ username: name, email: `${name}@example.com`, password: 'password-one' });
const open = (from, to) => request(app)
  .post('/chats')
  .set('Authorization', `Bearer ${generateAccessToken(from._id.toString())}`)
  .send({ recipientId: to._id.toString() });

describe('one-to-one chats are unique per pair', () => {
  test('both users opening a chat at once end up in the same chat', async () => {
    const a = await makeUser('dcu-a');
    const b = await makeUser('dcu-b');

    const responses = await Promise.all([open(a, b), open(b, a), open(a, b), open(b, a)]);

    for (const res of responses) assert.ok([200, 201].includes(res.status), `unexpected status ${res.status}`);
    assert.equal(new Set(responses.map(r => r.body._id)).size, 1, 'every caller must get the same chat');
    assert.equal(responses.filter(r => r.status === 201).length, 1, 'exactly one request creates it');
    assert.equal(await Chat.countDocuments({ participants: { $all: [a._id, b._id], $size: 2 } }), 1);
  });

  test('a chat created before directKey existed is adopted, not duplicated', async () => {
    const a = await makeUser('dcu-legacy-a');
    const b = await makeUser('dcu-legacy-b');
    const legacy = await Chat.create({ isGroupChat: false, participants: [a._id, b._id] });

    const res = await open(b, a);

    assert.equal(res.status, 200);
    assert.equal(res.body._id, legacy._id.toString());
    const stored = await Chat.findById(legacy._id).lean();
    assert.equal(stored.directKey, directChatKey(a._id.toString(), b._id.toString()));
  });

  test('the database itself rejects a second chat with the same key', async () => {
    const a = await makeUser('dcu-db-a');
    const b = await makeUser('dcu-db-b');
    const directKey = directChatKey(a._id.toString(), b._id.toString());

    await Chat.create({ participants: [a._id, b._id], directKey });
    await assert.rejects(
      Chat.create({ participants: [a._id, b._id], directKey }),
      (err) => err.code === 11000
    );
  });
});
