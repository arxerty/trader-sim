import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Test database:
 *  - TEST_DATABASE_URL set (CI / `docker compose --profile test up postgres-test`) → use it;
 *  - otherwise an embedded PostgreSQL is started locally (no Docker needed).
 * Migrations are applied before the suite runs.
 */
export default async function setup(project: TestProject) {
  let url = process.env.TEST_DATABASE_URL;
  let stop: (() => Promise<void>) | undefined;

  if (!url) {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const dir = resolve(import.meta.dirname, '../node_modules/.cache/pg-test');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const port = 54_329;
    const pg = new EmbeddedPostgres({
      databaseDir: dir,
      user: 'postgres',
      password: 'postgres',
      port,
      persistent: false,
      // Force UTF-8 regardless of the OS locale (e.g. WIN1251 on Windows).
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
      onLog: () => {},
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('tradesim_test');
    url = `postgresql://postgres:postgres@127.0.0.1:${port}/tradesim_test`;
    stop = () => pg.stop();
  }

  execSync('npx prisma migrate deploy', {
    cwd: resolve(import.meta.dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  project.provide('databaseUrl', url);

  return async () => {
    await stop?.();
  };
}
