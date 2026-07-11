import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertCleanupWhereNotEmpty,
  buildCleanupDeletePlans,
  createEmptyItIds,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/cleanup-plans';
import {
  buildAccountCreateData,
  buildOrderCreateData,
  buildReadyMatchCreateData,
  buildUploadRowCreateData,
  buildUserCreateData,
  fixturePayloadLooksSensitive,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/fixture-builders';
import {
  buildItEmail,
  buildItMallOrderNo,
  createShipmentTransmissionItRunId,
  SHIPMENT_TRANSMISSION_IT_PREFIX,
} from '@/app/lib/order-integration/transmission/__tests__/integration/support/ids';
import { evaluateIntegrationMutationGate } from '@/app/lib/order-integration/transmission/__tests__/integration/support/mutation-gate';

describe('shipment transmission integration support (no DB)', () => {
  const runId = createShipmentTransmissionItRunId();

  it('fixture builders use IT prefixes and no sensitive values', () => {
    const user = buildUserCreateData({ runId, slot: 'a' });
    const account = buildAccountCreateData({ runId, slot: 'a', userId: 'user-1' });
    const order = buildOrderCreateData({
      runId,
      slot: 'a',
      userId: 'user-1',
      batchId: 'batch-1',
      integrationAccountId: 'acc-1',
    });
    const row = buildUploadRowCreateData({
      runId,
      slot: 'a',
      userId: 'user-1',
      uploadBatchId: 'ub-1',
      mallOrderNo: order.mallOrderNo,
      excloadOrderNo: order.excloadOrderNo,
    });
    const match = buildReadyMatchCreateData({
      runId,
      slot: 'a',
      userId: 'user-1',
      uploadBatchId: 'ub-1',
      uploadRowId: 'ur-1',
      orderSyncOrderId: 'ord-1',
      integrationAccountId: 'acc-1',
      trackingNumber: row.trackingNumber,
    });

    expect(user.email.startsWith(SHIPMENT_TRANSMISSION_IT_PREFIX.emailLocal)).toBe(true);
    expect(order.mallOrderNo.startsWith(SHIPMENT_TRANSMISSION_IT_PREFIX.mallOrderNo)).toBe(true);
    expect(row.trackingNumber.startsWith(SHIPMENT_TRANSMISSION_IT_PREFIX.trackingNumber)).toBe(
      true,
    );
    expect(account.accessKeyCiphertext).toBeNull();
    expect(account.secretKeyCiphertext).toBeNull();
    expect(fixturePayloadLooksSensitive(user)).toBe(false);
    expect(fixturePayloadLooksSensitive(account)).toBe(false);
    expect(fixturePayloadLooksSensitive(order)).toBe(false);
    expect(fixturePayloadLooksSensitive(row)).toBe(false);
    expect(fixturePayloadLooksSensitive(match)).toBe(false);
    expect(fixturePayloadLooksSensitive({ receiverPhone: '01012345678' })).toBe(true);
  });

  it('cleanup plans use only tracked IDs and never empty where', () => {
    const ids = createEmptyItIds(runId);
    ids.userId = 'user-1';
    ids.userEmail = buildItEmail(runId);
    ids.accountId = 'acc-1';
    ids.matchIds.push('m-1');
    ids.attemptIds.push('a-1');
    ids.uploadRowIds.push('r-1');
    ids.uploadBatchIds.push('b-1');
    ids.orderIds.push('o-1');
    ids.orderBatchIds.push('ob-1');

    const plans = buildCleanupDeletePlans(ids);
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      assertCleanupWhereNotEmpty(plan.where);
      const blob = JSON.stringify(plan.where);
      expect(blob).not.toBe('{}');
      expect(blob.includes('"in"') || blob.includes('"id"')).toBe(true);
    }
    expect(JSON.stringify(plans)).toContain('a-1');
    expect(JSON.stringify(plans)).toContain('m-1');
    expect(JSON.stringify(plans)).not.toContain(buildItMallOrderNo(runId, 'x'));
  });

  it('mutation gate blocks without IT run flag', () => {
    const blocked = evaluateIntegrationMutationGate({
      ALLOW_TEST_DB_MUTATION: 'true',
      EXCLOAD_ENV_PROFILE: 'smoke',
      TEST_DB_ENV_FILE: '.env.smoke.local',
      DATABASE_URL: 'postgresql://u:p@localhost/db',
      DIRECT_URL: 'postgresql://u:p@localhost/db',
    });
    expect(blocked.ok).toBe(false);

    const allowed = evaluateIntegrationMutationGate({
      SHIPMENT_TRANSMISSION_IT_RUN: 'true',
      ALLOW_TEST_DB_MUTATION: 'true',
      EXCLOAD_ENV_PROFILE: 'smoke',
      TEST_DB_ENV_FILE: '.env.smoke.local',
      DATABASE_URL: 'postgresql://u:p@localhost/db',
      DIRECT_URL: 'postgresql://u:p@localhost/db',
    });
    expect(allowed.ok).toBe(true);
  });

  it('default vitest config excludes integration tests', () => {
    const configPath = path.resolve(process.cwd(), 'vitest.config.ts');
    const text = readFileSync(configPath, 'utf8');
    expect(text).toContain('*.integration.test.ts');
    expect(text).toMatch(/exclude:[\s\S]*integration\.test\.ts/);
  });

  it('package integration script has no migrate', () => {
    const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const script = pkg.scripts['order-transmission:test-db:integration'];
    expect(script).toContain('run-shipment-transmission-db-integration.mjs');
    expect(script.toLowerCase()).not.toContain('migrate');
  });

  it('integration vitest config is transmission-scoped and sequential', () => {
    const text = readFileSync(path.resolve(process.cwd(), 'vitest.integration.config.ts'), 'utf8');
    expect(text).toContain(
      'app/lib/order-integration/transmission/__tests__/integration/**/*.integration.test.ts',
    );
    expect(text).toContain('maxWorkers: 1');
    expect(text).toContain('fileParallelism: false');
    expect(text).toContain('testTimeout');
    expect(text).toContain('hookTimeout');
  });
});
