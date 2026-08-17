import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = process.env.SECRET_KEY ?? 'test-secret-that-is-long-enough-to-pass-validation';

const { createApp } = await import('../dist/app.js');
const { default: User } = await import('../dist/models/User.js');

const ioStub = {
  to() { return this; },
  emit() { return true; },
};

let mongo;
let app;

const credentials = {
  username: 'bob',
  email: 'bob@example.com',
  password: 'a-good-password',
};

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp(ioStub);
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('registration', () => {
  test('creates an account and stores the password hashed', async () => {
    const res = await request(app).post('/api/auth/register').send(credentials);
    assert.equal(res.status, 201);

    const stored = await User.findOne({ username: credentials.username });
    assert.ok(stored, 'user should exist');
    assert.notEqual(stored.password, credentials.password, 'password must not be stored in plain text');
    assert.match(stored.password, /^\$2[aby]\$/, 'password should be a bcrypt hash');
  });

  test('rejects a duplicate username', async () => {
    const res = await request(app).post('/api/auth/register').send(credentials);
    assert.equal(res.status, 400);
  });

  test('rejects a short password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'carol',
      email: 'carol@example.com',
      password: 'x',
    });
    assert.equal(res.status, 400);
  });
});

describe('login', () => {
  test('returns tokens for valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      usernameOrEmail: credentials.username,
      password: credentials.password,
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.accessToken, 'expected an access token');
    assert.ok(res.body.refreshToken, 'expected a refresh token');
    assert.equal(res.body.username, credentials.username);
    assert.equal(res.body.password, undefined, 'login must not echo the password');
  });

  test('issues a token the API actually accepts', async () => {
    const login = await request(app).post('/api/auth/login').send({
      usernameOrEmail: credentials.username,
      password: credentials.password,
    });

    const res = await request(app)
      .get('/users')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    assert.equal(res.status, 200, 'a freshly issued token must pass authentication');
  });

  test('rejects a wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      usernameOrEmail: credentials.username,
      password: 'wrong-password',
    });
    assert.equal(res.status, 400);
  });
});

describe('refresh', () => {
  test('rotates the refresh token and rejects reuse', async () => {
    const login = await request(app).post('/api/auth/login').send({
      usernameOrEmail: credentials.username,
      password: credentials.password,
    });
    const original = login.body.refreshToken;

    const first = await request(app).post('/api/auth/refresh').send({ refreshToken: original });
    assert.equal(first.status, 200);
    assert.ok(first.body.accessToken);
    assert.notEqual(first.body.refreshToken, original, 'refresh token should rotate');

    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken: original });
    assert.equal(replay.status, 401, 'reusing a spent refresh token must be rejected');
  });

  test('rejects an unknown refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'a'.repeat(80) });
    assert.equal(res.status, 401);
  });
});
