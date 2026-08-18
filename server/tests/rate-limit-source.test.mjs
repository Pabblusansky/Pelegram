import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = process.env.SECRET_KEY ?? 'test-secret-that-is-long-enough-to-pass-validation';

const { createApp } = await import('../dist/app.js');
const { default: User } = await import('../dist/models/User.js');
const { env } = await import('../dist/config/env.js');

const ioStub = {
  to() { return this; },
  in() { return this; },
  emit() { return true; },
  socketsLeave() { return true; },
};

const ATTEMPTS = 25;

let mongo;
let app;

const guessPasswords = async (decorate) => {
  let blocked = 0;
  for (let i = 0; i < ATTEMPTS; i++) {
    const req = request(app).post('/api/auth/login');
    decorate(req, i);
    const res = await req.send({ usernameOrEmail: 'rl-target', password: `guess-${i}` });
    if (res.status === 429) blocked++;
  }
  return blocked;
};

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp(ioStub);

  await User.create({
    username: 'rl-target', email: 'rl-target@example.com', password: 'correct-horse-battery',
  });
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('auth rate limiting cannot be steered by request headers', () => {
  test('proxy trust is off unless explicitly configured', () => {
    assert.equal(
      env.TRUST_PROXY, 0,
      'trusting X-Forwarded-For by default lets any client forge its source address'
    );
  });

  test('a rotated X-Forwarded-For does not buy extra login attempts', async () => {
    const blocked = await guessPasswords((req, i) => req.set('X-Forwarded-For', `10.0.0.${i}`));

    assert.ok(
      blocked > 0,
      `brute force must still be throttled when the source header is rotated, but 0 of ${ATTEMPTS} were blocked`
    );
  });

  test('a rotated X-Real-IP does not buy extra login attempts', async () => {
    const blocked = await guessPasswords((req, i) => req.set('X-Real-IP', `10.1.0.${i}`));

    assert.ok(blocked > 0, 'X-Real-IP must not be trusted either');
  });

  test('the correct password is still rejected once throttled', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.0.0.99')
      .send({ usernameOrEmail: 'rl-target', password: 'correct-horse-battery' });

    assert.equal(res.status, 429, 'throttling must not be escapable by supplying valid credentials');
  });
});
