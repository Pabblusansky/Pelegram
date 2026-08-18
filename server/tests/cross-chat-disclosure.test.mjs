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

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const SECRET = 'TOP SECRET: the merger closes friday';

let mongo;
let app;
let attackerChat;
let ownMessage;
let foreignMessage;
let token;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp(ioStub);

  const attacker = await User.create({
    username: 'ccd-attacker', email: 'ccd-attacker@example.com', password: 'password-one',
  });
  const victim = await User.create({
    username: 'ccd-victim', email: 'ccd-victim@example.com', password: 'password-two',
  });

  attackerChat = await Chat.create({ participants: [attacker._id] });
  const victimChat = await Chat.create({ participants: [victim._id] });

  ownMessage = await Message.create({
    chatId: attackerChat._id, senderId: attacker._id, senderName: 'ccd-attacker', content: 'my own note',
  });
  foreignMessage = await Message.create({
    chatId: victimChat._id, senderId: victim._id, senderName: 'ccd-victim', content: SECRET,
  });

  token = generateAccessToken(attacker._id.toString());
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const uploadQuoting = (messageId) => request(app)
  .post(`/api/files/upload/chat/${attackerChat._id}`)
  .set('Authorization', `Bearer ${token}`)
  .field('replyTo', JSON.stringify({ _id: messageId.toString() }))
  .attach('mediaFile', onePixelPng, 'pixel.png');

describe('quoting another chat\'s message in an upload', () => {
  test('does not disclose the foreign message content', async () => {
    const res = await uploadQuoting(foreignMessage._id);

    assert.equal(res.status, 201);
    const body = JSON.stringify(res.body);
    assert.ok(
      !body.includes(SECRET),
      'a message from a chat the caller is not in must never be quoted back to them'
    );
  });

  test('does not disclose the foreign author either', async () => {
    const res = await uploadQuoting(foreignMessage._id);

    assert.equal(res.status, 201);
    assert.ok(
      !JSON.stringify(res.body).includes('ccd-victim'),
      'the foreign sender must not be disclosed'
    );
  });

  test('does not persist the foreign content on the new message', async () => {
    const res = await uploadQuoting(foreignMessage._id);
    const stored = await Message.findById(res.body.savedMessage._id).lean();

    assert.ok(
      !stored.replyTo || stored.replyTo.content !== SECRET,
      'the leaked content must not be written into the attacker\'s chat'
    );
  });

  test('quoting a message from the caller\'s own chat still works', async () => {
    const res = await uploadQuoting(ownMessage._id);

    assert.equal(res.status, 201);
    assert.equal(res.body.savedMessage.replyTo.content, 'my own note');
  });
});
