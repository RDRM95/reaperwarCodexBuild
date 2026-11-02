import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    // Deterministic fleet battles are CPU-bound. Keep shared CI runners from
    // oversubscribing long simulations and starving worker IPC updates.
    maxWorkers: 2,
  },
});
