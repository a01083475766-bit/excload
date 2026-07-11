import path from 'path';
import { defineConfig } from 'vitest/config';

import {
  SHIPMENT_TRANSMISSION_IT_HOOK_TIMEOUT_MS,
  SHIPMENT_TRANSMISSION_IT_TEST_TIMEOUT_MS,
} from './app/lib/order-integration/transmission/__tests__/integration/support/integration-timeout';

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
    testTimeout: SHIPMENT_TRANSMISSION_IT_TEST_TIMEOUT_MS,
    hookTimeout: SHIPMENT_TRANSMISSION_IT_HOOK_TIMEOUT_MS,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
