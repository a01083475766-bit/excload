import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createEmptyItIds } from '@/app/lib/order-integration/transmission/__tests__/integration/support/cleanup-plans';
import {
  clearIdsAfterSuccessfulCleanup,
  createCleanupRegistry,
  hasAnyTrackedIds,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/cleanup-registry';
import {
  SHIPMENT_TRANSMISSION_IT_HOOK_TIMEOUT_MS,
  SHIPMENT_TRANSMISSION_IT_TEST_TIMEOUT_MS,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/integration-timeout';
import {
  cleanupPendingRegistryEntries,
  runTrackedCleanup,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/scenario-harness';
import { buildItEmail } from '@/app/lib/order-integration/transmission/__tests__/integration/support/ids';

describe('integration timeout config (no DB)', () => {
  it('integration config sets 60s timeouts; default vitest does not', () => {
    const integration = readFileSync(
      path.resolve(process.cwd(), 'vitest.integration.config.ts'),
      'utf8',
    );
    const unit = readFileSync(path.resolve(process.cwd(), 'vitest.config.ts'), 'utf8');
    expect(SHIPMENT_TRANSMISSION_IT_TEST_TIMEOUT_MS).toBe(60_000);
    expect(SHIPMENT_TRANSMISSION_IT_HOOK_TIMEOUT_MS).toBe(60_000);
    expect(integration).toContain('testTimeout');
    expect(integration).toContain('hookTimeout');
    expect(integration).toContain('maxWorkers: 1');
    expect(unit).not.toContain('testTimeout');
    expect(unit).not.toContain('60_000');
  });
});

describe('cleanup registry + harness (no DB)', () => {
  it('after body exception, pending entry is cleaned by fallback', async () => {
    const registry = createCleanupRegistry();
    const ids = createEmptyItIds('r1');
    ids.userId = 'u1';
    ids.userEmail = buildItEmail('r1');
    const entry = registry.register('t1', ids);

    entry.flags.fixtureCreated = true;
    expect(registry.hasPending()).toBe(true);

    const cleanup = vi.fn(async (tracked) => {
      clearIdsAfterSuccessfulCleanup(tracked, ['user']);
      return { ok: true, counts: [{ table: 'user', deleted: 1 }], summary: 'user:1', deletedTotal: 1 };
    });
    const disconnect = vi.fn(async () => {});
    const result = await runTrackedCleanup({
      entry,
      trackAttempts: async () => {},
      cleanup,
      disconnect,
    });
    expect(result.cleanupOk).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    registry.markFullyCleaned('t1');
    expect(registry.hasPending()).toBe(false);
  });

  it('partial cleanup keeps remaining IDs for retry; suite aborts', async () => {
    const registry = createCleanupRegistry();
    const ids = createEmptyItIds('r2');
    ids.userId = 'u2';
    ids.userEmail = buildItEmail('r2');
    ids.matchIds.push('m2');
    registry.register('t2', ids);

    const result = await cleanupPendingRegistryEntries({
      registry,
      createCleanupClient: () => ({
        trackAttempts: async () => {},
        cleanup: async (tracked) => {
          clearIdsAfterSuccessfulCleanup(tracked, ['shipmentMatch']);
          return {
            ok: false,
            counts: [{ table: 'shipmentMatch', deleted: 1 }],
            summary: 'shipmentMatch:1',
            deletedTotal: 1,
            errorCode: 'CLEANUP_FAILED',
          };
        },
        disconnect: async () => {},
      }),
    });
    expect(result.cleanupPass).toBe(false);
    expect(registry.getSuiteAbortReason()).toBeTruthy();
    expect(ids.matchIds).toEqual([]);
    expect(ids.userId).toBe('u2');
  });

  it('empty registry does not call delete', async () => {
    const registry = createCleanupRegistry();
    const cleanup = vi.fn();
    const result = await cleanupPendingRegistryEntries({
      registry,
      createCleanupClient: () => ({
        trackAttempts: async () => {},
        cleanup,
        disconnect: async () => {},
      }),
    });
    expect(cleanup).not.toHaveBeenCalled();
    expect(result.cleanupPass).toBe(true);
  });

  it('completed cleanup is not expanded to broad delete', () => {
    const ids = createEmptyItIds('r3');
    ids.userId = 'u3';
    ids.userEmail = buildItEmail('r3');
    clearIdsAfterSuccessfulCleanup(ids, ['user']);
    expect(hasAnyTrackedIds(ids)).toBe(false);
  });
});
