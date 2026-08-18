import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { spawnSync } from 'node:child_process';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.SECRET_KEY = process.env.SECRET_KEY ?? 'test-secret-that-is-long-enough-to-pass-validation';

const { createApp } = await import('../dist/app.js');
const { default: User } = await import('../dist/models/User.js');
const { JWT_ALGORITHMS } = await import('../dist/middleware/authenticateToken.js');
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
    username: 'tc-user', email: 'tc-user@example.com', password: 'password-one',
  });
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('access token verification', () => {
  test('only HS256 is accepted', () => {
    assert.deepEqual([...JWT_ALGORITHMS], ['HS256']);
  });

  test('rejects a token signed with an algorithm the server does not use', async () => {
    const hs512 = jwt.sign({ id: user._id.toString() }, process.env.SECRET_KEY, { algorithm: 'HS512' });

    const res = await request(app).get('/users').set('Authorization', `Bearer ${hs512}`);

    assert.equal(res.status, 401, 'the token header must not be able to choose the algorithm');
  });

  test('rejects an unsigned token', async () => {
    const unsigned = jwt.sign({ id: user._id.toString() }, '', { algorithm: 'none' });

    const res = await request(app).get('/users').set('Authorization', `Bearer ${unsigned}`);

    assert.equal(res.status, 401);
  });

  test('rejects a token offered under a non-Bearer scheme', async () => {
    const token = generateAccessToken(user._id.toString());

    const res = await request(app).get('/users').set('Authorization', `Basic ${token}`);

    assert.equal(res.status, 401, 'only the Bearer scheme carries an access token');
  });

  test('accepts the tokens the server itself issues', async () => {
    const res = await request(app)
      .get('/users')
      .set('Authorization', `Bearer ${generateAccessToken(user._id.toString())}`);

    assert.equal(res.status, 200);
  });
});

describe('credential-bearing queries are not injectable', () => {
  test('login rejects an operator object in place of a username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: { $ne: null }, password: { $ne: null } });

    assert.equal(res.status, 400, 'an operator object must never reach the user lookup');
    assert.ok(res.body.accessToken === undefined, 'no token may be issued');
  });

  test('refresh rejects an operator object in place of a token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: { $ne: null } });

    assert.equal(res.status, 400);
    assert.ok(res.body.accessToken === undefined, 'no token may be issued');
  });
});

describe('CORS configuration', () => {
  test('a wildcard origin is refused at startup', () => {
    const result = spawnSync(
      process.execPath,
      ['-e', 'import("./dist/config/env.js")'],
      {
        env: { ...process.env, CORS_ORIGIN: '*' },
        encoding: 'utf8',
      }
    );

    assert.equal(result.status, 1, 'a wildcard origin combined with credentials must not boot');
    assert.match(result.stderr, /CORS_ORIGIN/);
  });

  test('a concrete origin boots', () => {
    const result = spawnSync(
      process.execPath,
      ['-e', 'import("./dist/config/env.js")'],
      {
        env: { ...process.env, CORS_ORIGIN: 'https://pelegram.example' },
        encoding: 'utf8',
      }
    );

    assert.equal(result.status, 0, result.stderr);
  });

  test('the allow-origin header names the configured origin, not the caller', async () => {
    const res = await request(app)
      .get('/users')
      .set('Origin', 'https://attacker.example')
      .set('Authorization', `Bearer ${generateAccessToken(user._id.toString())}`);

    assert.notEqual(
      res.headers['access-control-allow-origin'],
      'https://attacker.example',
      'an arbitrary origin must never be reflected back'
    );
  });

  test('a preflight is not answered with a wildcard origin', async () => {
    const res = await request(app)
      .options('/users')
      .set('Origin', 'https://attacker.example')
      .set('Access-Control-Request-Method', 'GET');

    assert.notEqual(res.headers['access-control-allow-origin'], '*');
  });
});
