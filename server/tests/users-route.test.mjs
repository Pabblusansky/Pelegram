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
let user;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  app = createApp(ioStub);

  user = await User.create({
    username: 'alice',
    email: 'alice@example.com',
    password: 'super-secret-password',
    displayName: 'Alice',
  });
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('GET /users authentication', () => {
  test('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/users');
    assert.equal(res.status, 401);
  });

  test('rejects a malformed token', async () => {
    const res = await request(app)
      .get('/users')
      .set('Authorization', 'Bearer not.a.real.token');
    assert.equal(res.status, 401);
  });

  test('rejects a token signed with the old default_secret fallback', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const forged = jwt.sign({ id: user._id.toString() }, 'default_secret');

    const res = await request(app)
      .get('/users')
      .set('Authorization', `Bearer ${forged}`);

    assert.equal(res.status, 401);
  });

  test('accepts a validly signed token', async () => {
    const token = generateAccessToken(user._id.toString());
    const res = await request(app)
      .get('/users')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 1);
  });
});

describe('GET /users response shape', () => {
  test('never exposes password hashes or contact details', async () => {
    const token = generateAccessToken(user._id.toString());
    const res = await request(app)
      .get('/users')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);

    for (const returned of res.body) {
      assert.equal(returned.password, undefined, 'password hash must never be returned');
      assert.equal(returned.email, undefined, 'email must never be returned');
      assert.equal(returned.phoneNumber, undefined, 'phone number must never be returned');
    }
  });

  test('returns only the fields the client needs', async () => {
    const token = generateAccessToken(user._id.toString());
    const res = await request(app)
      .get('/users')
      .set('Authorization', `Bearer ${token}`);

    const allowed = new Set(['_id', 'username', 'displayName', 'avatar']);
    for (const returned of res.body) {
      for (const key of Object.keys(returned)) {
        assert.ok(allowed.has(key), `unexpected field "${key}" in /users response`);
      }
    }
  });
});

describe('GET /api/users/status authentication', () => {
  test('requires a token', async () => {
    const res = await request(app).get('/api/users/status');
    assert.equal(res.status, 401);
  });
});
