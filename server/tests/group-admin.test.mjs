import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fs from 'node:fs';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = process.env.SECRET_KEY ?? 'test-secret-that-is-long-enough-to-pass-validation';

const { createApp } = await import('../dist/app.js');
const { default: User } = await import('../dist/models/User.js');
const { default: Chat } = await import('../dist/models/Chat.js');
const { generateAccessToken } = await import('../dist/utils/tokenUtils.js');

const ioStub = { to() { return this; }, emit() { return true; } };

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

let mongo;
let app;
let admin;
let member;
let outsider;
let group;
let direct;

const as = (u) => `Bearer ${generateAccessToken(u._id.toString())}`;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp(ioStub);

  admin = await User.create({ username: 'ga-admin', email: 'ga-admin@example.com', password: 'password-one' });
  member = await User.create({ username: 'ga-member', email: 'ga-member@example.com', password: 'password-two' });
  outsider = await User.create({ username: 'ga-outsider', email: 'ga-outsider@example.com', password: 'password-three' });

  group = await Chat.create({
    name: 'Secret Group',
    isGroupChat: true,
    participants: [admin._id, member._id],
    admin: [admin._id],
  });

  direct = await Chat.create({ participants: [admin._id, member._id] });
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('group admin authorization', () => {
  test('a plain member cannot rename the group', async () => {
    const res = await request(app)
      .patch(`/chats/${group._id}/group/name`)
      .set('Authorization', as(member))
      .send({ name: 'Renamed By Member' });

    assert.equal(res.status, 403, `expected 403, got ${res.status}`);
    const after = await Chat.findById(group._id).lean();
    assert.equal(after.name, 'Secret Group', 'the group name must not change');
  });

  test('an outsider cannot rename the group', async () => {
    const res = await request(app)
      .patch(`/chats/${group._id}/group/name`)
      .set('Authorization', as(outsider))
      .send({ name: 'Renamed By Outsider' });

    assert.equal(res.status, 403, `expected 403, got ${res.status}`);
  });

  test('the admin can rename the group', async () => {
    const res = await request(app)
      .patch(`/chats/${group._id}/group/name`)
      .set('Authorization', as(admin))
      .send({ name: 'Renamed By Admin' });

    assert.equal(res.status, 200, `expected the admin rename to succeed, got ${res.status}`);
  });

  test('a plain member cannot add participants', async () => {
    const res = await request(app)
      .post(`/chats/${group._id}/group/participants`)
      .set('Authorization', as(member))
      .send({ participantIds: [outsider._id.toString()] });

    assert.equal(res.status, 403, `expected 403, got ${res.status}`);
    const after = await Chat.findById(group._id).lean();
    assert.equal(after.participants.length, 2, 'no participant should have been added');
  });

  test('a plain member cannot remove participants', async () => {
    const res = await request(app)
      .delete(`/chats/${group._id}/group/participants/${admin._id}`)
      .set('Authorization', as(member));

    assert.equal(res.status, 403, `expected 403, got ${res.status}`);
  });

  test('a plain member cannot delete the group avatar', async () => {
    const res = await request(app)
      .delete(`/chats/${group._id}/group/avatar`)
      .set('Authorization', as(member));

    assert.equal(res.status, 403, `expected 403, got ${res.status}`);
  });

  test('a non-admin avatar upload is rejected before the file is stored', async () => {
    const dir = path.resolve('uploads/group-avatars');
    const before = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;

    const res = await request(app)
      .patch(`/chats/${group._id}/group/avatar`)
      .set('Authorization', as(member))
      .attach('avatar', onePixelPng, 'pixel.png');

    assert.equal(res.status, 403, `expected 403, got ${res.status}`);

    const after = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
    assert.equal(after, before, 'a rejected upload must not write a file to disk');
  });

  test('group admin routes reject a direct chat', async () => {
    const res = await request(app)
      .patch(`/chats/${direct._id}/group/name`)
      .set('Authorization', as(admin))
      .send({ name: 'Not A Group' });

    assert.equal(res.status, 400, `expected 400, got ${res.status}`);
  });

  test('group admin routes deny an unknown chat id', async () => {
    const res = await request(app)
      .patch(`/chats/${new mongoose.Types.ObjectId()}/group/name`)
      .set('Authorization', as(admin))
      .send({ name: 'Ghost' });

    assert.equal(res.status, 404, `expected 404, got ${res.status}`);
  });

  test('an unauthenticated caller cannot rename the group', async () => {
    const res = await request(app)
      .patch(`/chats/${group._id}/group/name`)
      .send({ name: 'Anonymous' });

    assert.equal(res.status, 401);
  });
});
