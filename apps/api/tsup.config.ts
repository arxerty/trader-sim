import { defineConfig } from 'tsup';

// Workspace packages ship TypeScript sources, so they are bundled into the build;
// real npm dependencies stay external and are installed in the runtime image.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  noExternal: [/^@trader-sim\//],
});
