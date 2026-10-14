#!/usr/bin/env node
/**
 * Local PostgreSQL without Docker (embedded binaries), for development only.
 *   npm run db:embedded -w @trader-sim/api   → postgres://tradesim:tradesim@127.0.0.1:54330/tradesim
 * Data persists in apps/api/node_modules/.cache/pg-dev. Ctrl+C stops the server.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const dir = resolve(import.meta.dirname, '../node_modules/.cache/pg-dev');
const fresh = !existsSync(resolve(dir, 'PG_VERSION'));
mkdirSync(dir, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'tradesim',
  password: 'tradesim',
  port: 54_330,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase('tradesim');
console.log('PostgreSQL ready: postgresql://tradesim:tradesim@127.0.0.1:54330/tradesim');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
