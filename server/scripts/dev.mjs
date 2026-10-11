// Development runner, restarted by `node --watch-path=src` whenever a source
// file changes (see the dev:watch script). Replaces nodemon, which pulled in
// a vulnerable glob dependency for this one job.
import { execSync } from 'node:child_process';

process.env.NODE_ENV ??= 'development';

try {
  execSync('npx tsc', { stdio: 'inherit' });
} catch {
  // tsc already printed the errors; wait for the next save instead of exiting.
  console.error('[dev] TypeScript build failed; waiting for changes...');
  await new Promise(() => {});
}

await import('../dist/index.js');
