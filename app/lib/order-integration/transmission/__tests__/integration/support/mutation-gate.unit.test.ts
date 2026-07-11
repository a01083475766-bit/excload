import { afterEach, describe, expect, it, vi } from 'vitest';

import { createIntegrationPrismaClient } from '@/app/lib/order-integration/transmission/__tests__/integration/support/prisma-it-client';
import {
  evaluateIntegrationMutationGate,
  SHIPMENT_TRANSMISSION_IT_RUN,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/mutation-gate';
import {
  buildCleanupDeletePlans,
  createEmptyItIds,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/cleanup-plans';
import { buildItEmail } from '@/app/lib/order-integration/transmission/__tests__/integration/support/ids';

const GOOD = {
  [SHIPMENT_TRANSMISSION_IT_RUN]: 'true',
  ALLOW_TEST_DB_MUTATION: 'true',
  EXCLOAD_ENV_PROFILE: 'smoke',
  TEST_DB_ENV_FILE: '.env.smoke.local',
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/it_fake',
  DIRECT_URL: 'postgresql://u:p@127.0.0.1:5432/it_fake',
} as const;

const GATE_KEYS = [
  SHIPMENT_TRANSMISSION_IT_RUN,
  'ALLOW_TEST_DB_MUTATION',
  'EXCLOAD_ENV_PROFILE',
  'TEST_DB_ENV_FILE',
  'DATABASE_URL',
  'DIRECT_URL',
] as const;

function clearGateEnv() {
  for (const key of GATE_KEYS) {
    delete process.env[key];
  }
}

function applyGateEnv(env: Record<string, string>) {
  clearGateEnv();
  Object.assign(process.env, env);
}

afterEach(() => {
  clearGateEnv();
});

describe('integration safety gate (no DB)', () => {
  it('fails when run marker missing', () => {
    const { [SHIPMENT_TRANSMISSION_IT_RUN]: _drop, ...rest } = GOOD;
    const result = evaluateIntegrationMutationGate(rest);
    expect(result).toEqual({ ok: false, reason: 'IT_RUN_NOT_ENABLED' });
  });

  it('fails when mutation flag is false', () => {
    expect(
      evaluateIntegrationMutationGate({
        ...GOOD,
        ALLOW_TEST_DB_MUTATION: 'false',
      }),
    ).toEqual({ ok: false, reason: 'MUTATION_FLAG_BLOCKED' });
  });

  it('fails when profile mismatches', () => {
    expect(
      evaluateIntegrationMutationGate({
        ...GOOD,
        EXCLOAD_ENV_PROFILE: 'production',
      }),
    ).toEqual({ ok: false, reason: 'PROFILE_MISMATCH' });
  });

  it('fails when env file marker mismatches', () => {
    expect(
      evaluateIntegrationMutationGate({
        ...GOOD,
        TEST_DB_ENV_FILE: '.env',
      }),
    ).toEqual({ ok: false, reason: 'ENV_FILE_MARKER_MISMATCH' });
  });

  it('passes when all conditions are set', () => {
    expect(evaluateIntegrationMutationGate(GOOD)).toEqual({ ok: true });
  });

  it('does not call Prisma factory when gate fails', () => {
    const factory = vi.fn(() => ({}) as never);
    applyGateEnv({
      ALLOW_TEST_DB_MUTATION: 'false',
      EXCLOAD_ENV_PROFILE: 'smoke',
      TEST_DB_ENV_FILE: '.env.smoke.local',
      DATABASE_URL: GOOD.DATABASE_URL,
      DIRECT_URL: GOOD.DIRECT_URL,
    });
    expect(() => createIntegrationPrismaClient(factory)).toThrow(/blocked/);
    expect(factory).not.toHaveBeenCalled();
  });

  it('calls Prisma factory only after gate passes', () => {
    const factory = vi.fn((url: string) => ({ url }) as never);
    applyGateEnv({ ...GOOD });
    const client = createIntegrationPrismaClient(factory);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(GOOD.DATABASE_URL);
    expect(client).toEqual({ url: GOOD.DATABASE_URL });
  });
});

describe('fixture partial-failure cleanup plans (no DB)', () => {
  it('after User only — plans include user, not missing tables', () => {
    const ids = createEmptyItIds('run1');
    ids.userId = 'user-only';
    ids.userEmail = buildItEmail('run1');
    const plans = buildCleanupDeletePlans(ids);
    expect(plans.map((p) => p.table)).toEqual(['user']);
    expect(JSON.stringify(plans)).toContain('user-only');
    expect(JSON.stringify(plans)).not.toContain('shipmentMatch');
  });

  it('after User+Account — no order/match deletes', () => {
    const ids = createEmptyItIds('run2');
    ids.userId = 'u2';
    ids.userEmail = buildItEmail('run2');
    ids.accountId = 'acc2';
    const tables = buildCleanupDeletePlans(ids).map((p) => p.table);
    expect(tables).toEqual(['orderIntegrationAccount', 'user']);
    expect(tables).not.toContain('orderSyncOrder');
    expect(tables).not.toContain('shipmentMatch');
  });

  it('after Order before Match — deletes order scope only', () => {
    const ids = createEmptyItIds('run3');
    ids.userId = 'u3';
    ids.userEmail = buildItEmail('run3');
    ids.accountId = 'acc3';
    ids.orderBatchIds.push('ob3');
    ids.orderIds.push('o3');
    const tables = buildCleanupDeletePlans(ids).map((p) => p.table);
    expect(tables).toContain('orderSyncOrder');
    expect(tables).toContain('orderSyncBatch');
    expect(tables).not.toContain('shipmentMatch');
    expect(tables).not.toContain('shipmentUploadRow');
  });

  it('empty id lists produce no empty where plans', () => {
    const ids = createEmptyItIds('run-empty');
    expect(buildCleanupDeletePlans(ids)).toEqual([]);
  });
});
