import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';

const { CloudinaryStorageEngine } = await import('../dist/config/cloudinary-storage.js');

const sourceStream = (content = 'file-bytes') => Readable.from([Buffer.from(content)]);

function fakeCloudinary({ result, error, captureBody = false } = {}) {
  const calls = { uploads: [], destroys: [], received: [] };

  return {
    calls,
    uploader: {
      upload_stream(options, callback) {
        calls.uploads.push(options);
        const chunks = [];
        return new Writable({
          write(chunk, _enc, cb) {
            if (captureBody) chunks.push(chunk);
            cb();
          },
          final(cb) {
            calls.received.push(Buffer.concat(chunks).toString());
            cb();
            queueMicrotask(() => callback(error, error ? undefined : result));
          },
        });
      },
      destroy(publicId, options) {
        calls.destroys.push({ publicId, options });
        return Promise.resolve({ result: 'ok' });
      },
    },
  };
}

const handle = (engine, file) =>
  new Promise((resolve) => {
    engine._handleFile({}, file, (error, info) => resolve({ error, info }));
  });

const remove = (engine, file) =>
  new Promise((resolve) => {
    engine._removeFile({}, file, (error) => resolve(error));
  });

describe('CloudinaryStorageEngine upload', () => {
  test('reports the secure url as the file path', async () => {
    const cloudinary = fakeCloudinary({
      result: { secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/a.png', public_id: 'pelegram/media/a', bytes: 42 },
    });
    const engine = new CloudinaryStorageEngine(cloudinary, { folder: 'pelegram/media' });

    const { error, info } = await handle(engine, { stream: sourceStream() });

    assert.equal(error, null);
    assert.equal(info.path, 'https://res.cloudinary.com/demo/image/upload/v1/a.png');
    assert.equal(info.filename, 'pelegram/media/a');
    assert.equal(info.size, 42);
  });

  test('passes the configured params through to cloudinary', async () => {
    const params = { folder: 'pelegram/avatars', allowed_formats: ['png'], transformation: [{ width: 300 }] };
    const cloudinary = fakeCloudinary({ result: { secure_url: 'https://x/y.png', public_id: 'y' } });
    const engine = new CloudinaryStorageEngine(cloudinary, params);

    await handle(engine, { stream: sourceStream() });

    assert.deepEqual(cloudinary.calls.uploads[0], params);
  });

  test('streams the file contents to cloudinary', async () => {
    const cloudinary = fakeCloudinary({ result: { secure_url: 'https://x/y.png', public_id: 'y' }, captureBody: true });
    const engine = new CloudinaryStorageEngine(cloudinary, {});

    await handle(engine, { stream: sourceStream('hello-world') });

    assert.equal(cloudinary.calls.received[0], 'hello-world');
  });

  test('surfaces a cloudinary failure as an error', async () => {
    const cloudinary = fakeCloudinary({ error: new Error('cloudinary exploded') });
    const engine = new CloudinaryStorageEngine(cloudinary, {});

    const { error, info } = await handle(engine, { stream: sourceStream() });

    assert.ok(error, 'an upload failure must be reported');
    assert.equal(error.message, 'cloudinary exploded');
    assert.equal(info, undefined);
  });

  test('errors when cloudinary reports neither result nor error', async () => {
    const cloudinary = fakeCloudinary({ result: undefined });
    const engine = new CloudinaryStorageEngine(cloudinary, {});

    const { error } = await handle(engine, { stream: sourceStream() });

    assert.ok(error, 'a missing result must not be treated as success');
  });

  test('reports a read failure from the incoming file stream', async () => {
    const cloudinary = fakeCloudinary({ result: { secure_url: 'https://x/y.png', public_id: 'y' } });
    const engine = new CloudinaryStorageEngine(cloudinary, {});

    const failing = new Readable({
      read() {
        this.destroy(new Error('client aborted'));
      },
    });

    const { error } = await handle(engine, { stream: failing });

    assert.ok(error, 'a stream failure must be reported');
    assert.equal(error.message, 'client aborted');
  });

  test('calls back exactly once even if the stream errors after completion', async () => {
    const cloudinary = fakeCloudinary({ result: { secure_url: 'https://x/y.png', public_id: 'y' } });
    const engine = new CloudinaryStorageEngine(cloudinary, {});

    let calls = 0;
    const stream = sourceStream();
    await new Promise((resolve) => {
      engine._handleFile({}, { stream }, () => {
        calls++;
        resolve();
      });
    });

    stream.emit('error', new Error('late failure'));
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(calls, 1);
  });
});

describe('CloudinaryStorageEngine removal', () => {
  test('destroys the uploaded asset by public id', async () => {
    const cloudinary = fakeCloudinary({});
    const engine = new CloudinaryStorageEngine(cloudinary, { resource_type: 'image' });

    const error = await remove(engine, { filename: 'pelegram/media/a' });

    assert.equal(error, null);
    assert.equal(cloudinary.calls.destroys[0].publicId, 'pelegram/media/a');
    assert.equal(cloudinary.calls.destroys[0].options.resource_type, 'image');
  });

  test('maps the auto resource type to image for deletion', async () => {
    const cloudinary = fakeCloudinary({});
    const engine = new CloudinaryStorageEngine(cloudinary, { resource_type: 'auto' });

    await remove(engine, { filename: 'pelegram/media/a' });

    assert.equal(cloudinary.calls.destroys[0].options.resource_type, 'image');
  });

  test('does nothing when there is no public id', async () => {
    const cloudinary = fakeCloudinary({});
    const engine = new CloudinaryStorageEngine(cloudinary, {});

    const error = await remove(engine, {});

    assert.equal(error, null);
    assert.equal(cloudinary.calls.destroys.length, 0);
  });
});
