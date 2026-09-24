import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = process.env.SECRET_KEY ?? 'test-secret-that-is-long-enough-to-pass-validation';

const { createApp } = await import('../dist/app.js');
const { registerSocketHandlers } = await import('../dist/socket/socketHandlers.js');
const { default: User } = await import('../dist/models/User.js');
const { default: Chat } = await import('../dist/models/Chat.js');
const { default: Message } = await import('../dist/models/Message.js');
const { generateAccessToken } = await import('../dist/utils/tokenUtils.js');

const emitted = [];
const ioStub = {
  to(room) {
    return { emit(event, payload) { emitted.push({ room, event, payload }); return true; } };
  },
  in() { return this; },
  emit() { return true; },
  socketsLeave() { return true; },
};

function buildSocket(userId) {
  const handlers = new Map();
  const socket = {
    user: { id: userId },
    joined: [],
    on(event, handler) { handlers.set(event, handler); },
    emit() { return true; },
    to() { return { emit() { return true; } }; },
    join(room) { socket.joined.push(room); return true; },
    handlers,
  };
  registerSocketHandlers(ioStub, socket);
  return socket;
}

const send = (socket, data) => new Promise((resolve) => {
  socket.handlers.get('send_message')(data, resolve);
});

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
const lookup = (from, to) => request(app)
  .get(`/chats/direct/${to._id}`)
  .set('Authorization', `Bearer ${generateAccessToken(from._id.toString())}`);

describe('a chat is created by its first message', () => {
  test('sending to a recipient creates the chat and announces it to both users', async () => {
    const a = await makeUser('fmc-a');
    const b = await makeUser('fmc-b');
    const socket = buildSocket(a._id.toString());

    assert.equal((await lookup(a, b)).status, 404, 'no chat exists before the first message');

    const ack = await send(socket, { recipientId: b._id.toString(), content: 'hi there' });

    assert.equal(ack.success, true);
    assert.ok(ack.chatId, 'the ack carries the new chat id');
    assert.ok(socket.joined.includes(ack.chatId), 'the sender joins the new chat room');

    const stored = await Message.findById(ack.message._id).lean();
    assert.equal(stored.chatId.toString(), ack.chatId);

    const announced = emitted.filter(e => e.event === 'new_chat_created' && e.payload._id.toString() === ack.chatId);
    assert.deepEqual(
      announced.map(e => e.room).sort(),
      [a._id.toString(), b._id.toString()].sort()
    );

    const found = await lookup(b, a);
    assert.equal(found.status, 200);
    assert.equal(found.body._id, ack.chatId);
  });

  test('both users sending a first message at once share one chat', async () => {
    const a = await makeUser('fmc-race-a');
    const b = await makeUser('fmc-race-b');

    const [fromA, fromB] = await Promise.all([
      send(buildSocket(a._id.toString()), { recipientId: b._id.toString(), content: 'from a' }),
      send(buildSocket(b._id.toString()), { recipientId: a._id.toString(), content: 'from b' }),
    ]);

    assert.equal(fromA.success, true);
    assert.equal(fromB.success, true);
    assert.equal(fromA.chatId, fromB.chatId);
    assert.equal(await Message.countDocuments({ chatId: fromA.chatId }), 2);
  });

  test('a second message to the same recipient reuses the chat', async () => {
    const a = await makeUser('fmc-reuse-a');
    const b = await makeUser('fmc-reuse-b');
    const socket = buildSocket(a._id.toString());

    const first = await send(socket, { recipientId: b._id.toString(), content: 'one' });
    const second = await send(socket, { recipientId: b._id.toString(), content: 'two' });

    assert.equal(first.chatId, second.chatId);
  });

  test('invalid recipients are rejected without creating anything', async () => {
    const a = await makeUser('fmc-invalid-a');
    const socket = buildSocket(a._id.toString());
    const chatsBefore = await Chat.countDocuments();

    for (const recipientId of [a._id.toString(), 'not-an-id', new mongoose.Types.ObjectId().toString()]) {
      const ack = await send(socket, { recipientId, content: 'hello?' });
      assert.equal(ack.success, false, `recipient ${recipientId} must be rejected`);
    }
    assert.equal(await Chat.countDocuments(), chatsBefore);
  });

  test('opening a chat over REST no longer announces an empty chat', async () => {
    const a = await makeUser('fmc-rest-a');
    const b = await makeUser('fmc-rest-b');
    const before = emitted.length;

    const res = await request(app)
      .post('/chats')
      .set('Authorization', `Bearer ${generateAccessToken(a._id.toString())}`)
      .send({ recipientId: b._id.toString() });

    assert.equal(res.status, 201);
    assert.equal(emitted.slice(before).filter(e => e.event === 'new_chat_created').length, 0);
  });

  test('looking up a chat with yourself is rejected', async () => {
    const a = await makeUser('fmc-self');
    assert.equal((await lookup(a, a)).status, 400);
  });
});
