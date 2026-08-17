import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Node 20 wants a directory here, Node 22 wants a glob, and each rejects the
// other's form. Resolving the file list ourselves works the same on both.
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = path.join(serverDir, 'tests');

const files = readdirSync(testsDir)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => path.join('tests', name));

if (files.length === 0) {
  console.error('No test files found in tests/');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: serverDir,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
