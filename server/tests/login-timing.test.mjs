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
  in() { return this; },
  emit() { return true; },
  socketsLeave() { return true; },
};

// Deliberately small: failed logins count against authLimiter (10 per window,
// keyed on a source address these requests all share), so the whole file has to
// stay under that budget. The effect being measured is roughly 30x, so a few
// samples separate it comfortably.
const SAMPLES = 3;

let mongo;
let app;

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

const timeLogin = async (usernameOrEmail) => {
  const started = process.hrtime.bigint();
  const res = await request(app)
    .post('/api/auth/login')
    .send({ usernameOrEmail, password: 'definitely-the-wrong-password' });
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;

  assert.equal(res.status, 400, 'both paths must report the same failure');
  return elapsed;
};

const medianLoginTime = async (usernameOrEmail) => {
  const samples = [];
  for (let i = 0; i < SAMPLES; i++) {
    samples.push(await timeLogin(usernameOrEmail));
  }
  return median(samples);
};

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp(ioStub);

  await User.create({
    username: 'lt-registered', email: 'lt-registered@example.com', password: 'correct-horse-battery',
  });
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('login does not leak which accounts exist', () => {
  test('an unknown username costs comparable time to a real one', async () => {
    const registered = await medianLoginTime('lt-registered');
    const unknown = await medianLoginTime('lt-does-not-exist');

    // Skipping the bcrypt comparison on the miss path makes it roughly an
    // order of magnitude faster; a fixed hash to compare against keeps the two
    // within the same ballpark.
    assert.ok(
      unknown > registered * 0.4,
      `unknown-user login (${unknown.toFixed(1)}ms) must not be dramatically faster than `
      + `a registered one (${registered.toFixed(1)}ms), that difference reveals which accounts exist`
    );
  });

  test('an unknown username is rejected the same way as a wrong password', async () => {
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'lt-does-not-exist', password: 'whatever' });
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'lt-registered', password: 'whatever' });

    assert.equal(unknown.status, wrongPassword.status);
    assert.deepEqual(unknown.body, wrongPassword.body, 'the response body must not distinguish the two');
  });
});
