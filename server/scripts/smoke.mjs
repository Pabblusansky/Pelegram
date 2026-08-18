import { spawn } from 'node:child_process';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongo = await MongoMemoryServer.create();

const child = spawn(process.execPath, ['dist/index.js'], {
  env: {
    ...process.env,
    MONGO_URI: mongo.getUri(),
    PORT: '3999',
    SECRET_KEY: 'smoke-test-secret-that-is-long-enough-ok',
    NODE_ENV: 'development',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (d) => { output += d; });
child.stderr.on('data', (d) => { output += d; });

const waitFor = (ms) => new Promise((r) => setTimeout(r, ms));

const base = 'http://127.0.0.1:3999';

let booted = false;
for (let i = 0; i < 60; i++) {
  if (child.exitCode !== null) break;
  try {
    await fetch(`${base}/users`);
    booted = true;
    break;
  } catch {
    await waitFor(500);
  }
}

if (!booted) {
  console.error('smoke: server never accepted connections on 3999');
  console.error(output);
  child.kill();
  await mongo.stop();
  process.exit(1);
}
const results = [];

const rest = await fetch(`${base}/users`);
results.push(['GET /users (no token)', rest.status, rest.status === 401]);

const polling = await fetch(`${base}/socket.io/?EIO=4&transport=polling`);
const body = await polling.text();
results.push([
  'GET /socket.io/ polling',
  polling.status,
  polling.status === 200 && body.includes('sid'),
]);

const restAgain = await fetch(`${base}/users`);
results.push(['GET /users after socket handshake', restAgain.status, restAgain.status === 401]);

child.kill();
await mongo.stop();

console.log('\n--- smoke results ---');
let ok = true;
for (const [name, status, pass] of results) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} -> ${status}`);
  if (!pass) ok = false;
}

if (output.includes('ERR_HTTP_HEADERS_SENT')) {
  console.log('FAIL  server logged ERR_HTTP_HEADERS_SENT');
  ok = false;
} else {
  console.log('PASS  no ERR_HTTP_HEADERS_SENT in server output');
}

process.exit(ok ? 0 : 1);
