import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = process.env.SECRET_KEY ?? 'test-secret-that-is-long-enough-to-pass-validation';

const { createApp } = await import('../dist/app.js');
const { default: User } = await import('../dist/models/User.js');
const { generateAccessToken } = await import('../dist/utils/tokenUtils.js');

const ioStub = {
  to() { return this; },
  emit() { return true; },
};

let mongo;
let app;
let searcher;
let token;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp(ioStub);

  searcher = await User.create({
    username: 'searcher', email: 'searcher@example.com', password: 'password-one',
  });
  await User.create({
    username: 'target', email: 'target@example.com', password: 'password-two',
    phoneNumber: '+100000000',
  });

  token = generateAccessToken(searcher._id.toString());
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('GET /chats/search', () => {
  test('requires authentication', async () => {
    const res = await request(app).get('/chats/search').query({ query: 'target' });
    assert.equal(res.status, 401);
  });

  test('finds a user by username', async () => {
    const res = await request(app)
      .get('/chats/search')
      .query({ query: 'target' })
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].username, 'target');
  });

  test('never exposes password hashes or contact details', async () => {
    const res = await request(app)
      .get('/chats/search')
      .query({ query: 'target' })
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    for (const returned of res.body) {
      assert.equal(returned.password, undefined, 'password hash must never be returned');
      assert.equal(returned.email, undefined, 'email must never be returned');
      assert.equal(returned.phoneNumber, undefined, 'phone number must never be returned');
    }
  });

  test('treats the query as literal text, not a regular expression', async () => {
    const res = await request(app)
      .get('/chats/search')
      .query({ query: '.*' })
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 0, 'a regex wildcard must not match every user');
  });
});
