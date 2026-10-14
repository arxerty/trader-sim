#!/usr/bin/env node
// Runs a command with variables from the repo-root `.env` (Prisma CLI only looks next to the schema).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

for (const file of [resolve('.env'), resolve('../../.env')]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}
const [cmd, ...args] = process.argv.slice(2);
const result = spawnSync(cmd, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});
process.exit(result.status ?? 1);
