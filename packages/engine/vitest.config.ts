import { defineConfig } from 'vitest/config';

// The engine must not depend on any browser API, so tests run in plain Node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
