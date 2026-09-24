import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = process.env.SECRET_KEY ?? 'test-secret-that-is-long-enough-to-pass-validation';

const { registerSocketHandlers } = await import('../dist/socket/socketHandlers.js');
const { default: User } = await import('../dist/models/User.js');
const { default: Chat } = await import('../dist/models/Chat.js');

let mongo;
let alice;
let bob;

// Records every room/event pair emitted through the server so the test can
// count how often new_chat_created went out.
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
  return {
    user: { id: userId },
    on(event, handler) { handlers.set(event, handler); },
    emit() { return true; },
    to() { return { emit() { return true; } }; },
    join() { return true; },
    handlers,
  };
}

const send = (socket, data) => new Promise((resolve) => {
  socket.handlers.get('send_message')(data, resolve);
});

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  alice = await User.create({ username: 'nce-alice', email: 'nce-alice@example.com', password: 'password-one' });
  bob = await User.create({ username: 'nce-bob', email: 'nce-bob@example.com', password: 'password-two' });
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('new_chat_created is only announced for the first message', () => {
  test('a second message does not re-announce the chat', async () => {
    const chat = await Chat.create({ participants: [alice._id, bob._id] });
    const socket = buildSocket(alice._id.toString());
    registerSocketHandlers(ioStub, socket);

    const countNewChat = () => emitted.filter(e => e.event === 'new_chat_created').length;

    const first = await send(socket, { chatId: chat._id.toString(), content: 'hello' });
    assert.equal(first.success, true);
    assert.equal(countNewChat(), 2, 'the first message announces the chat to both participants');

    const second = await send(socket, { chatId: chat._id.toString(), content: 'again' });
    assert.equal(second.success, true);
    assert.equal(countNewChat(), 2, 'later messages must not re-announce the chat');
  });
});
