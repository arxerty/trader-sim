import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads `.env` for local development (repo root or the api folder).
 * In Docker/CI variables come from the environment and no file is needed.
 */
export function loadDotEnv(): void {
  for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
  }
}
