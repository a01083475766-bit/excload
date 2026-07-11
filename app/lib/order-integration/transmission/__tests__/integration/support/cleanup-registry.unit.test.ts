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

  it('body finally success leaves registry empty (no afterEach delete)', async () => {
    const registry = createCleanupRegistry();
    const ids = createEmptyItIds('r4');
    ids.userId = 'u4';
    ids.userEmail = buildItEmail('r4');
    const entry = registry.register('t4', ids);
    entry.flags.fixtureCreated = true;

    const bodyCleanup = vi.fn(async (tracked) => {
      clearIdsAfterSuccessfulCleanup(tracked, ['user']);
      return { ok: true, counts: [{ table: 'user', deleted: 1 }], summary: 'user:1', deletedTotal: 1 };
    });
    await runTrackedCleanup({
      entry,
      trackAttempts: async () => {},
      cleanup: bodyCleanup,
      disconnect: async () => {},
    });
    registry.markFullyCleaned('t4');

    const afterEachCleanup = vi.fn();
    const fallback = await cleanupPendingRegistryEntries({
      registry,
      createCleanupClient: () => ({
        trackAttempts: async () => {},
        cleanup: afterEachCleanup,
        disconnect: async () => {},
      }),
    });
    expect(bodyCleanup).toHaveBeenCalledTimes(1);
    expect(afterEachCleanup).not.toHaveBeenCalled();
    expect(fallback.cleanupPass).toBe(true);
    expect(registry.hasPending()).toBe(false);
  });

  it('body throw still cleans via finally; afterEach sees empty registry', async () => {
    const registry = createCleanupRegistry();
    const ids = createEmptyItIds('r5');
    ids.userId = 'u5';
    ids.userEmail = buildItEmail('r5');
    const entry = registry.register('t5', ids);
    entry.flags.fixtureCreated = true;

    let bodyError: unknown;
    try {
      throw new Error('scenario boom');
    } catch (e) {
      bodyError = e;
    } finally {
      await runTrackedCleanup({
        entry,
        trackAttempts: async () => {},
        cleanup: async (tracked) => {
          clearIdsAfterSuccessfulCleanup(tracked, ['user']);
          return {
            ok: true,
            counts: [{ table: 'user', deleted: 1 }],
            summary: 'user:1',
            deletedTotal: 1,
          };
        },
        disconnect: async () => {},
      });
      registry.markFullyCleaned('t5');
    }
    expect(String(bodyError)).toMatch(/scenario boom/);

    const afterEachCleanup = vi.fn();
    await cleanupPendingRegistryEntries({
      registry,
      createCleanupClient: () => ({
        trackAttempts: async () => {},
        cleanup: afterEachCleanup,
        disconnect: async () => {},
      }),
    });
    expect(afterEachCleanup).not.toHaveBeenCalled();
    expect(registry.hasPending()).toBe(false);
  });

  it('body cleanup fail → afterEach retry → afterAll retry clears remaining', async () => {
    const registry = createCleanupRegistry();
    const ids = createEmptyItIds('r6');
    ids.userId = 'u6';
    ids.userEmail = buildItEmail('r6');
    const entry = registry.register('t6', ids);
    entry.flags.fixtureCreated = true;

    // Body finally fails — IDs remain
    const body = await runTrackedCleanup({
      entry,
      trackAttempts: async () => {},
      cleanup: async () => ({
        ok: false,
        counts: [],
        summary: '',
        deletedTotal: 0,
        errorCode: 'BODY_CLEANUP_FAIL',
      }),
      disconnect: async () => {},
    });
    expect(body.cleanupOk).toBe(false);
    expect(registry.hasPending()).toBe(true);

    // afterEach also fails
    const afterEach = await cleanupPendingRegistryEntries({
      registry,
      createCleanupClient: () => ({
        trackAttempts: async () => {},
        cleanup: async () => ({
          ok: false,
          counts: [],
          summary: '',
          deletedTotal: 0,
          errorCode: 'AFTEREACH_FAIL',
        }),
        disconnect: async () => {},
      }),
    });
    expect(afterEach.cleanupPass).toBe(false);
    expect(registry.hasPending()).toBe(true);

    // afterAll succeeds
    const afterAll = await cleanupPendingRegistryEntries({
      registry,
      createCleanupClient: () => ({
        trackAttempts: async () => {},
        cleanup: async (tracked) => {
          clearIdsAfterSuccessfulCleanup(tracked, ['user']);
          return {
            ok: true,
            counts: [{ table: 'user', deleted: 1 }],
            summary: 'user:1',
            deletedTotal: 1,
          };
        },
        disconnect: async () => {},
      }),
    });
    expect(afterAll.cleanupPass).toBe(true);
    expect(registry.hasPending()).toBe(false);
  });

  it('cleanup fail leaves summary FAIL signals (pending + abort)', async () => {
    const registry = createCleanupRegistry();
    const ids = createEmptyItIds('r7');
    ids.userId = 'u7';
    ids.userEmail = buildItEmail('r7');
    registry.register('t7', ids);

    const result = await cleanupPendingRegistryEntries({
      registry,
      createCleanupClient: () => ({
        trackAttempts: async () => {},
        cleanup: async () => ({
          ok: false,
          counts: [],
          summary: '',
          deletedTotal: 0,
          errorCode: 'CLEANUP_FAILED',
        }),
        disconnect: async () => {},
      }),
    });
    expect(result.cleanupPass).toBe(false);
    expect(registry.hasPending()).toBe(true);
    expect(registry.getSuiteAbortReason()).toBeTruthy();
    // Mimic afterAll summary gate: cleanupStatus FAIL when pending/abort
    const cleanupStatus =
      result.cleanupPass && !registry.hasPending() && !registry.getSuiteAbortReason()
        ? 'PASS'
        : 'FAIL';
    expect(cleanupStatus).toBe('FAIL');
  });
});
