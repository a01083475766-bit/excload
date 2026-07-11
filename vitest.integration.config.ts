import path from 'path';
import { defineConfig } from 'vitest/config';

/**
 * Shipment-transmission smoke DB integration only.
 * Run via: npm run order-transmission:test-db:integration
 * (never via default `npm test` / `vitest`)
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'app/lib/order-integration/transmission/__tests__/integration/**/*.integration.test.ts',
    ],
    fileParallelism: false,
    maxWorkers: 1,
    sequence: {
      concurrent: false,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
