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
const { safeExtension, randomFileSuffix } = await import('../dist/config/multer-config.js');
const { generateAccessToken } = await import('../dist/utils/tokenUtils.js');

const ioStub = {
  to() { return this; },
  emit() { return true; },
};

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const htmlPayload = Buffer.from('<script>alert(document.domain)</script>');

let mongo;
let app;
let uploader;
let chat;
let token;

const upload = (buffer, filename, contentType) => request(app)
  .post(`/api/files/upload/chat/${chat._id}`)
  .set('Authorization', `Bearer ${token}`)
  .attach('mediaFile', buffer, { filename, contentType });

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp(ioStub);

  uploader = await User.create({
    username: 'uh-uploader', email: 'uh-uploader@example.com', password: 'password-one',
  });
  const partner = await User.create({
    username: 'uh-partner', email: 'uh-partner@example.com', password: 'password-two',
  });

  chat = await Chat.create({ participants: [uploader._id, partner._id] });
  token = generateAccessToken(uploader._id.toString());
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('stored file extensions', () => {
  test('an .html filename is not carried over to the stored file', async () => {
    const res = await upload(htmlPayload, 'payload.html', 'image/png');

    assert.equal(res.status, 201);
    const { filePath } = res.body.savedMessage;
    assert.ok(
      !filePath.endsWith('.html'),
      `stored path must not keep the attacker's extension, got ${filePath}`
    );
    assert.ok(filePath.endsWith('.png'), `expected the declared type's extension, got ${filePath}`);
  });

  test('the upload it produces is not served as an HTML document', async () => {
    const res = await upload(htmlPayload, 'payload.html', 'image/png');
    const served = await request(app).get(res.body.savedMessage.filePath);

    assert.equal(served.status, 200);
    assert.ok(
      !/text\/html/.test(served.headers['content-type']),
      `uploaded bytes must never be served as HTML, got ${served.headers['content-type']}`
    );
  });

  test('an .svg filename cannot smuggle a scriptable image type', async () => {
    const res = await upload(htmlPayload, 'payload.svg', 'image/png');

    assert.equal(res.status, 201);
    assert.ok(
      !res.body.savedMessage.filePath.endsWith('.svg'),
      'SVG is scriptable in a document context and must not be reachable via the filename'
    );
  });

  test('a path traversal attempt in the filename does not escape the media directory', async () => {
    const res = await upload(onePixelPng, '../../../../evil.png', 'image/png');

    assert.equal(res.status, 201);
    const { filePath } = res.body.savedMessage;
    assert.ok(filePath.startsWith('/media/'), `expected a /media path, got ${filePath}`);
    assert.ok(!filePath.includes('..'), `path must not contain traversal segments, got ${filePath}`);
  });

  test('only the accepted MIME types map to an extension', () => {
    assert.equal(safeExtension('image/png'), '.png');
    assert.equal(safeExtension('text/html'), '');
    assert.equal(safeExtension('image/svg+xml'), '');
    assert.equal(safeExtension('application/x-httpd-php'), '');
  });
});

describe('stored file names', () => {
  test('the random suffix is long and unpredictable', () => {
    const suffixes = new Set(Array.from({ length: 500 }, () => randomFileSuffix()));

    assert.equal(suffixes.size, 500, 'every suffix must be distinct');
    for (const suffix of suffixes) {
      assert.match(suffix, /^[0-9a-f]{32}$/, 'suffix must be 128 bits of hex');
    }
  });

  test('the stored name does not embed a guessable timestamp', async () => {
    const res = await upload(onePixelPng, 'pixel.png', 'image/png');
    const filePath = res.body.savedMessage.filePath;

    assert.ok(
      !new RegExp(String(Date.now()).slice(0, 8)).test(filePath),
      `an unauthenticated URL must not be derivable from the clock, got ${filePath}`
    );
  });
});

describe('headers on the upload mounts', () => {
  test('served uploads forbid MIME sniffing and sandbox active content', async () => {
    const res = await upload(onePixelPng, 'pixel.png', 'image/png');
    const served = await request(app).get(res.body.savedMessage.filePath);

    assert.equal(served.headers['x-content-type-options'], 'nosniff');
    assert.match(served.headers['content-security-policy'], /default-src 'none'/);
    assert.match(served.headers['content-security-policy'], /sandbox/);
  });
});
