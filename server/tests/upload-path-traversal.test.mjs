import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = process.env.SECRET_KEY ?? 'test-secret-that-is-long-enough-to-pass-validation';

const { createApp } = await import('../dist/app.js');
const { default: User } = await import('../dist/models/User.js');
const { default: Chat } = await import('../dist/models/Chat.js');
const { default: Message } = await import('../dist/models/Message.js');
const { resolveUploadPath, UPLOAD_BASE_DIR } = await import('../dist/utils/uploadPaths.js');
const { generateAccessToken } = await import('../dist/utils/tokenUtils.js');

const ioStub = {
  to() { return this; },
  in() { return this; },
  emit() { return true; },
  socketsLeave() { return true; },
};

// A file with nothing to do with uploads, one directory above the upload root.
const victimPath = path.resolve(UPLOAD_BASE_DIR, '..', 'traversal-victim.txt');
const traversalFilePath = '/media/../../traversal-victim.txt';

let mongo;
let app;
let attacker;
let chat;
let token;

const plantVictim = () => fs.writeFileSync(victimPath, 'sensitive');

const createFileMessage = () => Message.create({
  chatId: chat._id,
  senderId: attacker._id,
  senderName: 'pt-attacker',
  content: 'attachment',
  filePath: traversalFilePath,
});

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp(ioStub);

  attacker = await User.create({
    username: 'pt-attacker', email: 'pt-attacker@example.com', password: 'password-one',
  });

  chat = await Chat.create({ participants: [attacker._id] });
  token = generateAccessToken(attacker._id.toString());
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
  if (fs.existsSync(victimPath)) fs.unlinkSync(victimPath);
});

describe('resolveUploadPath containment', () => {
  test('resolves a legitimate media path inside the upload root', () => {
    const resolved = resolveUploadPath('/media/user-abc-123.png');

    assert.equal(resolved, path.join(UPLOAD_BASE_DIR, 'media', 'user-abc-123.png'));
  });

  test('resolves a legitimate avatar path inside the upload root', () => {
    const resolved = resolveUploadPath('/uploads/avatars/user-abc-123.png');

    assert.equal(resolved, path.join(UPLOAD_BASE_DIR, 'avatars', 'user-abc-123.png'));
  });

  test('refuses paths that climb out of the upload root', () => {
    assert.equal(resolveUploadPath('/media/../../etc/passwd'), null);
    assert.equal(resolveUploadPath('/uploads/../../etc/passwd'), null);
    assert.equal(resolveUploadPath('/media/../../../../../../etc/passwd'), null);
  });

  test('refuses paths that are not upload URLs at all', () => {
    assert.equal(resolveUploadPath('/etc/passwd'), null);
    assert.equal(resolveUploadPath('https://example.com/x.png'), null);
    assert.equal(resolveUploadPath(''), null);
    assert.equal(resolveUploadPath(null), null);
    assert.equal(resolveUploadPath({ toString: () => '/media/x.png' }), null);
  });
});

describe('DELETE /messages/:id does not delete files outside the upload root', () => {
  test('a traversing filePath leaves the target file untouched', async () => {
    plantVictim();
    const message = await createFileMessage();

    const res = await request(app)
      .delete(`/messages/${message._id}`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    await new Promise(resolve => setTimeout(resolve, 300));

    assert.ok(
      fs.existsSync(victimPath),
      'a message filePath must never be able to unlink a file outside the upload root'
    );
  });
});

describe('DELETE /messages/delete-multiple does not delete files outside the upload root', () => {
  test('a traversing filePath leaves the target file untouched', async () => {
    plantVictim();
    const message = await createFileMessage();

    const res = await request(app)
      .delete('/messages/delete-multiple')
      .set('Authorization', `Bearer ${token}`)
      .send({ messageIds: [message._id.toString()] });

    assert.equal(res.status, 200);
    await new Promise(resolve => setTimeout(resolve, 300));

    assert.ok(
      fs.existsSync(victimPath),
      'bulk delete must not unlink a file outside the upload root either'
    );
  });
});

describe('DELETE /chats/:chatId does not delete files outside the upload root', () => {
  test('a traversing filePath leaves the target file untouched', async () => {
    plantVictim();
    const doomedChat = await Chat.create({ participants: [attacker._id] });
    await Message.create({
      chatId: doomedChat._id,
      senderId: attacker._id,
      senderName: 'pt-attacker',
      content: 'attachment',
      filePath: traversalFilePath,
    });

    const res = await request(app)
      .delete(`/chats/${doomedChat._id}`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    await new Promise(resolve => setTimeout(resolve, 300));

    assert.ok(
      fs.existsSync(victimPath),
      'chat deletion must not unlink a file outside the upload root'
    );
  });
});
