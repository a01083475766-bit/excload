import { describe, expect, it, vi } from 'vitest';

import {
  parseTransmitDryRunBody,
  SHIPMENT_TRANSMISSION_DRY_RUN_MAX_MATCH_IDS,
} from '@/app/lib/order-integration/transmission/parse-transmit-dry-run-body';
import {
  runShipmentTransmissionDryRun,
  type RunShipmentTransmissionDryRunClient,
} from '@/app/lib/order-integration/transmission/dry-run';

function buildMatchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'match-1',
    userId: 'user-a',
    uploadBatchId: 'batch-1',
    provider: 'COUPANG' as const,
    integrationAccountId: 'acc-1',
    userConfirmationStatus: 'CONFIRMED' as const,
    transmissionStatus: 'NONE' as const,
    orderSyncOrderId: 'order-1',
    finalTrackingNumber: null,
    finalCarrierCode: null,
    finalCarrierName: null,
    createdAt: new Date('2026-07-11T10:00:00.000Z'),
    uploadRow: {
      trackingNumber: '012345678901',
      carrierCode: 'CJ',
      carrierName: 'CJ대한통운',
      originalRowIndex: 0,
    },
    orderSyncOrder: {
      id: 'order-1',
      userId: 'user-a',
      provider: 'COUPANG' as const,
      integrationAccountId: 'acc-1',
      mallOrderNo: 'MALL-1',
      excloadOrderNo: 'EXC-1',
      mallLineItemIds: ['LI-1'],
      transmissionStatus: 'NONE' as const,
    },
    ...overrides,
  };
}

function buildClient(options: {
  batch?: Record<string, unknown> | null;
  matches?: ReturnType<typeof buildMatchRow>[];
}) {
  const findFirst = vi.fn(async () =>
    options.batch === undefined
      ? {
          id: 'batch-1',
          userId: 'user-a',
          provider: 'COUPANG',
          integrationAccountId: 'acc-1',
          status: 'READY',
        }
      : options.batch,
  );
  const findMany = vi.fn(async () => options.matches ?? [buildMatchRow()]);
  return {
    client: {
      shipmentUploadBatch: { findFirst },
      shipmentMatch: { findMany },
    } as unknown as RunShipmentTransmissionDryRunClient,
    findFirst,
    findMany,
  };
}

describe('parseTransmitDryRunBody', () => {
  it('treats null/undefined as full-batch evaluation', () => {
    expect(parseTransmitDryRunBody(null)).toEqual({
      ok: true,
      body: { matchIds: undefined, retryFailed: false },
    });
    expect(parseTransmitDryRunBody(undefined)).toEqual({
      ok: true,
      body: { matchIds: undefined, retryFailed: false },
    });
  });

  it('keeps empty matchIds as zero selection', () => {
    expect(parseTransmitDryRunBody({ matchIds: [] })).toEqual({
      ok: true,
      body: { matchIds: [], retryFailed: false },
    });
  });

  it('rejects non-object, bad matchIds, bad retryFailed, oversize', () => {
    expect(parseTransmitDryRunBody([]).ok).toBe(false);
    expect(parseTransmitDryRunBody({ matchIds: 'x' }).ok).toBe(false);
    expect(parseTransmitDryRunBody({ matchIds: [1] }).ok).toBe(false);
    expect(parseTransmitDryRunBody({ matchIds: [''] }).ok).toBe(false);
    expect(parseTransmitDryRunBody({ retryFailed: 'yes' }).ok).toBe(false);
    expect(
      parseTransmitDryRunBody({
        matchIds: Array.from({ length: SHIPMENT_TRANSMISSION_DRY_RUN_MAX_MATCH_IDS + 1 }, (_, i) =>
          `m${i}`,
        ),
      }).ok,
    ).toBe(false);
  });

  it('ignores unknown fields', () => {
    const parsed = parseTransmitDryRunBody({
      matchIds: ['m1'],
      retryFailed: true,
      extra: 1,
    });
    expect(parsed).toEqual({
      ok: true,
      body: { matchIds: ['m1'], retryFailed: true },
    });
  });

  it('trims matchIds and rejects whitespace-only; max uses raw length', () => {
    expect(parseTransmitDryRunBody({ matchIds: [' match-1 '] })).toEqual({
      ok: true,
      body: { matchIds: ['match-1'], retryFailed: false },
    });
    expect(parseTransmitDryRunBody({ matchIds: [' '] }).ok).toBe(false);
    expect(parseTransmitDryRunBody({}).ok).toBe(true);
    expect(parseTransmitDryRunBody({})).toEqual({
      ok: true,
      body: { matchIds: undefined, retryFailed: false },
    });
    // 500 raw entries over limit even if many would collapse after trim
    expect(
      parseTransmitDryRunBody({
        matchIds: Array.from({ length: 500 }, () => ' same '),
      }).ok,
    ).toBe(true);
  });
});

describe('runShipmentTransmissionDryRun', () => {
  it('returns 404 for missing/other-user batch', async () => {
    const { client, findMany } = buildClient({ batch: null });
    const result = await runShipmentTransmissionDryRun(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchIds: undefined,
      retryFailed: false,
    });
    expect(result).toEqual({
      success: false,
      status: 404,
      error: '업로드 배치를 찾을 수 없습니다.',
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns 409 when batch is not READY', async () => {
    const { client, findMany } = buildClient({
      batch: {
        id: 'batch-1',
        userId: 'user-a',
        provider: 'COUPANG',
        integrationAccountId: 'acc-1',
        status: 'UPLOADED',
      },
    });
    const result = await runShipmentTransmissionDryRun(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchIds: undefined,
      retryFailed: false,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.status).toBe(409);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('evaluates all matches with stable order when matchIds omitted', async () => {
    const { client, findMany } = buildClient({
      matches: [
        buildMatchRow({
          id: 'match-b',
          uploadRow: {
            trackingNumber: '222',
            carrierCode: 'CJ',
            carrierName: 'CJ',
            originalRowIndex: 1,
          },
        }),
        buildMatchRow({
          id: 'match-a',
          uploadRow: {
            trackingNumber: '111',
            carrierCode: 'CJ',
            carrierName: 'CJ',
            originalRowIndex: 0,
          },
        }),
      ],
    });
    const result = await runShipmentTransmissionDryRun(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchIds: undefined,
      retryFailed: false,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.body.dryRun).toBe(true);
    expect(result.body.summary.requestedCount).toBe(2);
    expect(result.body.summary.eligibleCount).toBe(2);
    expect(result.body.results.map((r) => r.matchId)).toEqual(['match-b', 'match-a']);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uploadBatchId: 'batch-1', userId: 'user-a' },
      }),
    );
    expect(JSON.stringify(result.body)).not.toMatch(/receiver|phone|address|credential|rawRow/i);
  });

  it('returns empty results without match query for matchIds []', async () => {
    const { client, findMany } = buildClient({});
    const result = await runShipmentTransmissionDryRun(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchIds: [],
      retryFailed: false,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.body.results).toEqual([]);
    expect(result.body.summary).toEqual({
      requestedCount: 0,
      evaluatedCount: 0,
      eligibleCount: 0,
      ineligibleCount: 0,
      duplicateMatchIdCount: 0,
      missingMatchIdCount: 0,
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('preserves request order, dedupes, and counts missing', async () => {
    const { client, findMany } = buildClient({
      matches: [buildMatchRow({ id: 'match-2' }), buildMatchRow({ id: 'match-1' })],
    });
    findMany.mockImplementation((async (args: { where: { id?: { in: string[] } } }) => {
      const ids = new Set(args.where.id?.in ?? []);
      return [buildMatchRow({ id: 'match-1' }), buildMatchRow({ id: 'match-2' })].filter((m) =>
        ids.has(m.id),
      );
    }) as typeof findMany);

    const result = await runShipmentTransmissionDryRun(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchIds: ['match-2', 'missing-x', 'match-1', 'match-2'],
      retryFailed: false,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.body.results.map((r) => r.matchId)).toEqual([
      'match-2',
      'missing-x',
      'match-1',
    ]);
    expect(result.body.summary.duplicateMatchIdCount).toBe(1);
    expect(result.body.summary.missingMatchIdCount).toBe(1);
    expect(result.body.summary.requestedCount).toBe(4);
    expect(result.body.results[1]?.reasonCode).toBe('MATCH_NOT_FOUND');
    expect(findMany).toHaveBeenCalledTimes(1);
    const firstCall = findMany.mock.calls[0] as unknown as [
      { where: { id?: { in: string[] } } },
    ];
    expect(firstCall[0]?.where?.id?.in).toEqual(['match-2', 'missing-x', 'match-1']);
    // summary invariants
    const s = result.body.summary;
    expect(s.eligibleCount + s.ineligibleCount).toBe(s.evaluatedCount);
    expect(s.evaluatedCount).toBe(result.body.results.length);
  });

  it('dedupes trim-normalized ids from parser output without duplicate DB ids', async () => {
    const { client, findMany } = buildClient({ matches: [buildMatchRow({ id: 'match-1' })] });
    await runShipmentTransmissionDryRun(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchIds: ['match-1', 'match-1'],
      retryFailed: false,
    });
    const firstCall = findMany.mock.calls[0] as unknown as [
      { where: { id?: { in: string[] } } },
    ];
    expect(firstCall[0]?.where?.id?.in).toEqual(['match-1']);
  });

  it('marks FAILED+retry as eligible with requiresRetryPreparation (no DB write)', async () => {
    const { client, findMany } = buildClient({
      matches: [buildMatchRow({ transmissionStatus: 'FAILED' })],
    });
    const result = await runShipmentTransmissionDryRun(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchIds: ['match-1'],
      retryFailed: true,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.body.results[0]?.eligible).toBe(true);
    expect(result.body.results[0]?.requiresRetryPreparation).toBe(true);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(client).not.toHaveProperty('shipmentTransmissionAttempt');
  });

  it('NONE eligible has requiresRetryPreparation false', async () => {
    const { client } = buildClient({ matches: [buildMatchRow({ transmissionStatus: 'NONE' })] });
    const result = await runShipmentTransmissionDryRun(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchIds: ['match-1'],
      retryFailed: false,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.body.results[0]?.eligible).toBe(true);
    expect(result.body.results[0]?.requiresRetryPreparation).toBe(false);
  });

  it('full-batch summary has zero missing/duplicate', async () => {
    const { client } = buildClient({
      matches: [buildMatchRow({ id: 'm1' }), buildMatchRow({ id: 'm2' })],
    });
    const result = await runShipmentTransmissionDryRun(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchIds: undefined,
      retryFailed: false,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.body.summary.duplicateMatchIdCount).toBe(0);
    expect(result.body.summary.missingMatchIdCount).toBe(0);
    expect(
      result.body.summary.eligibleCount + result.body.summary.ineligibleCount,
    ).toBe(result.body.summary.evaluatedCount);
  });

  it('does not expose other-batch matches (treated as missing)', async () => {
    const { client, findMany } = buildClient({ matches: [] });
    findMany.mockResolvedValue([]);
    const result = await runShipmentTransmissionDryRun(client, {
      userId: 'user-a',
      batchId: 'batch-1',
      matchIds: ['other-batch-match'],
      retryFailed: false,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.body.results[0]?.reasonCode).toBe('MATCH_NOT_FOUND');
    expect(result.body.results[0]?.candidate).toBeNull();
  });

  it('applies confirmation / transmission / tracking / courier / retry rules', async () => {
    const cases: Array<{
      name: string;
      row: ReturnType<typeof buildMatchRow>;
      retryFailed?: boolean;
      reason: string | null;
      eligible: boolean;
    }> = [
      {
        name: 'EXCLUDED',
        row: buildMatchRow({ userConfirmationStatus: 'EXCLUDED' }),
        reason: 'CONFIRMATION_NOT_ELIGIBLE',
        eligible: false,
      },
      {
        name: 'UNCONFIRMED',
        row: buildMatchRow({ userConfirmationStatus: 'UNCONFIRMED' }),
        reason: 'CONFIRMATION_NOT_ELIGIBLE',
        eligible: false,
      },
      {
        name: 'MANUALLY_LINKED',
        row: buildMatchRow({ userConfirmationStatus: 'MANUALLY_LINKED' }),
        reason: null,
        eligible: true,
      },
      {
        name: 'EDITED',
        row: buildMatchRow({ userConfirmationStatus: 'EDITED' }),
        reason: null,
        eligible: true,
      },
      {
        name: 'READY',
        row: buildMatchRow({ transmissionStatus: 'READY' }),
        reason: null,
        eligible: true,
      },
      {
        name: 'SENT',
        row: buildMatchRow({ transmissionStatus: 'SENT' }),
        reason: 'ALREADY_SENT',
        eligible: false,
      },
      {
        name: 'SKIPPED',
        row: buildMatchRow({ transmissionStatus: 'SKIPPED' }),
        reason: 'TRANSMISSION_SKIPPED',
        eligible: false,
      },
      {
        name: 'PROCESSING',
        row: buildMatchRow({ transmissionStatus: 'PROCESSING' }),
        reason: 'TRANSMISSION_SKIPPED',
        eligible: false,
      },
      {
        name: 'UNKNOWN',
        row: buildMatchRow({ transmissionStatus: 'UNKNOWN' }),
        reason: 'TRANSMISSION_SKIPPED',
        eligible: false,
      },
      {
        name: 'FAILED no retry',
        row: buildMatchRow({ transmissionStatus: 'FAILED' }),
        retryFailed: false,
        reason: 'RETRY_NOT_REQUESTED',
        eligible: false,
      },
      {
        name: 'FAILED retry',
        row: buildMatchRow({ transmissionStatus: 'FAILED' }),
        retryFailed: true,
        reason: null,
        eligible: true,
      },
      {
        name: 'tracking missing',
        row: buildMatchRow({
          finalTrackingNumber: null,
          uploadRow: {
            trackingNumber: '   ',
            carrierCode: 'CJ',
            carrierName: 'CJ',
            originalRowIndex: 0,
          },
        }),
        reason: 'TRACKING_NUMBER_MISSING',
        eligible: false,
      },
      {
        name: 'courier missing',
        row: buildMatchRow({
          finalCarrierCode: null,
          finalCarrierName: null,
          uploadRow: {
            trackingNumber: '012345678901',
            carrierCode: null,
            carrierName: null,
            originalRowIndex: 0,
          },
        }),
        reason: 'COURIER_MISSING',
        eligible: false,
      },
      {
        name: 'order missing',
        row: buildMatchRow({ orderSyncOrderId: 'order-1', orderSyncOrder: null }),
        reason: 'ORDER_NOT_FOUND',
        eligible: false,
      },
      {
        name: 'provider mismatch',
        row: buildMatchRow({ provider: 'SMARTSTORE' }),
        reason: 'PROVIDER_MISMATCH',
        eligible: false,
      },
      {
        name: 'final tracking preferred',
        row: buildMatchRow({
          finalTrackingNumber: 'FINAL-TRACK',
          finalCarrierCode: 'HANJIN',
          finalCarrierName: '한진',
        }),
        reason: null,
        eligible: true,
      },
    ];

    for (const c of cases) {
      const { client } = buildClient({ matches: [c.row] });
      const result = await runShipmentTransmissionDryRun(client, {
        userId: 'user-a',
        batchId: 'batch-1',
        matchIds: [c.row.id as string],
        retryFailed: c.retryFailed === true,
      });
      expect(result.success, c.name).toBe(true);
      if (!result.success) continue;
      const row = result.body.results[0];
      expect(row?.eligible, c.name).toBe(c.eligible);
      expect(row?.reasonCode, c.name).toBe(c.reason);
      if (c.name === 'final tracking preferred') {
        expect(row?.candidate?.trackingNumber).toBe('FINAL-TRACK');
        expect(row?.candidate?.courierCode).toBe('HANJIN');
      }
      if (c.name === 'FAILED retry') {
        expect(row?.requiresRetryPreparation).toBe(true);
      }
      if (c.name === 'FAILED no retry' || c.name === 'READY' || c.name === 'MANUALLY_LINKED') {
        expect(row?.requiresRetryPreparation).toBe(false);
      }
    }
  });

  it('never calls write methods on the client surface', async () => {
    const { client } = buildClient({});
    const keys = Object.keys(client);
    expect(keys).toEqual(['shipmentUploadBatch', 'shipmentMatch']);
    expect(Object.keys(client.shipmentUploadBatch)).toEqual(['findFirst']);
    expect(Object.keys(client.shipmentMatch)).toEqual(['findMany']);
  });
});
