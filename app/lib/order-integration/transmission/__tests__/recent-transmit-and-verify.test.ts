import { describe, expect, it, vi } from 'vitest';

import {
  buildRecentTransmitGuidance,
  buildRecentTransmitResultView,
  collectVerifiableAttemptIds,
  filterRecentTransmitResults,
  mergeVerificationIntoRecentTransmitView,
  outcomeLabel,
  verificationStatusLabel,
} from '@/app/lib/order-integration/transmission/recent-transmit-result-view';
import {
  mapCoupangOrderSheetStatuses,
  mapSmartstoreProductOrderStatuses,
} from '@/app/lib/order-integration/transmission/map-transmission-verify-status';
import { parseVerifyTransmissionBody } from '@/app/lib/order-integration/transmission/parse-verify-transmission-body';
import {
  extractCoupangShipmentBoxIds,
  extractSmartstoreProductOrderIds,
  runVerifyTransmissionService,
  type VerifyTransmissionAttemptRecord,
} from '@/app/lib/order-integration/transmission/verify-transmission-status';

describe('buildRecentTransmitResultView', () => {
  it('normalizes success/fail/skip and joins display lookup without PII columns', () => {
    const view = buildRecentTransmitResultView({
      completedAt: '2026-07-21T05:32:00.000Z',
      displayRows: [
        {
          matchId: 'm1',
          providerLabel: 'SMARTSTORE',
          mallOrderNo: 'PO-1',
          carrierName: 'CJ대한통운',
          trackingNumberValue: '1234',
        },
        {
          matchId: 'm2',
          providerLabel: 'COUPANG',
          mallOrderNo: '500001',
          carrierName: '한진택배',
          trackingNumberValue: '5678',
        },
        {
          matchId: 'm3',
          providerLabel: 'SMARTSTORE',
          mallOrderNo: 'PO-3',
          carrierName: 'CJ대한통운',
          trackingNumberValue: '9999',
        },
      ],
      body: {
        batchId: 'batch-1',
        summary: {
          requestedCount: 3,
          successCount: 1,
          failureCount: 1,
          skippedCount: 1,
        },
        results: [
          {
            matchId: 'm1',
            attemptId: 'a1',
            attempted: true,
            previousStatus: 'READY',
            nextStatus: 'SENT',
            success: true,
            retryable: false,
            errorCode: null,
            errorMessage: null,
            providerRequestId: 'req-1',
            requiresRetryPreparation: false,
          },
          {
            matchId: 'm2',
            attemptId: 'a2',
            attempted: true,
            previousStatus: 'READY',
            nextStatus: 'FAILED',
            success: false,
            retryable: true,
            errorCode: 'INVALID_STATUS',
            errorMessage: '현재 주문 상태에서는 등록할 수 없음',
            providerRequestId: null,
            requiresRetryPreparation: false,
          },
          {
            matchId: 'm3',
            attemptId: null,
            attempted: false,
            previousStatus: 'SENT',
            nextStatus: 'SENT',
            success: false,
            retryable: false,
            errorCode: 'MATCH_ALREADY_SENT',
            errorMessage: 'Already sent',
            providerRequestId: null,
            requiresRetryPreparation: false,
          },
        ],
      },
    });

    expect(view).not.toBeNull();
    expect(view!.summary).toEqual({
      requested: 3,
      success: 1,
      failed: 1,
      skipped: 1,
    });
    expect(view!.results.map((row) => row.outcome)).toEqual(['SUCCESS', 'FAILED', 'SKIPPED']);
    expect(view!.results[0]?.attemptId).toBe('a1');
    expect(view!.results[0]?.message).toBe('전송 완료');
    expect(JSON.stringify(view)).not.toMatch(/receiver|phone|address|수취인/i);
    expect(filterRecentTransmitResults(view!.results, 'failed')).toHaveLength(1);
    expect(collectVerifiableAttemptIds(view!.results)).toEqual(['a1']);
    expect(view!.results[0]?.verificationStatus).toBeNull();
    expect(view!.results[1]?.verificationStatus).toBe('NOT_APPLICABLE');
    expect(view!.results[2]?.verificationStatus).toBe('NOT_APPLICABLE');
    expect(verificationStatusLabel(view!.results[0]?.verificationStatus ?? null)).toBe('-');
    expect(verificationStatusLabel('NOT_APPLICABLE')).toBe('확인 대상 아님');
    expect(buildRecentTransmitGuidance(view!.summary)).toContain('1건은 전송됐고 1건은 실패');
    expect(outcomeLabel('SUCCESS')).toBe('전송 완료');
    expect(outcomeLabel('FAILED')).toBe('처리 실패');
  });

  it('distinguishes SMARTSTORE result codes in message column', () => {
    const view = buildRecentTransmitResultView({
      body: {
        batchId: 'batch-1',
        summary: {
          requestedCount: 6,
          successCount: 1,
          failureCount: 5,
          skippedCount: 0,
        },
        results: [
          {
            matchId: 'ok',
            attemptId: 'a0',
            attempted: true,
            previousStatus: 'READY',
            nextStatus: 'SENT',
            success: true,
            retryable: false,
            errorCode: null,
            errorMessage: null,
            providerRequestId: null,
            requiresRetryPreparation: false,
          },
          {
            matchId: 'confirm',
            attemptId: 'a1',
            attempted: true,
            previousStatus: 'READY',
            nextStatus: 'FAILED',
            success: false,
            retryable: false,
            errorCode: 'ORDER_CONFIRMATION_REQUIRED',
            errorMessage: null,
            providerRequestId: null,
            requiresRetryPreparation: false,
          },
          {
            matchId: 'state',
            attemptId: 'a2',
            attempted: true,
            previousStatus: 'READY',
            nextStatus: 'FAILED',
            success: false,
            retryable: false,
            errorCode: 'STATE_NOT_ELIGIBLE',
            errorMessage: null,
            providerRequestId: null,
            requiresRetryPreparation: false,
          },
          {
            matchId: 'carrier',
            attemptId: 'a3',
            attempted: true,
            previousStatus: 'READY',
            nextStatus: 'FAILED',
            success: false,
            retryable: false,
            errorCode: 'CARRIER_MAPPING_REQUIRED',
            errorMessage: null,
            providerRequestId: null,
            requiresRetryPreparation: false,
          },
          {
            matchId: 'conflict',
            attemptId: 'a4',
            attempted: true,
            previousStatus: 'READY',
            nextStatus: 'FAILED',
            success: false,
            retryable: false,
            errorCode: 'CONFLICT',
            errorMessage: null,
            providerRequestId: null,
            requiresRetryPreparation: false,
          },
          {
            matchId: 'not-attempted',
            attemptId: 'a5',
            attempted: true,
            previousStatus: 'READY',
            nextStatus: 'FAILED',
            success: false,
            retryable: false,
            errorCode: 'NOT_ATTEMPTED',
            errorMessage: null,
            providerRequestId: null,
            requiresRetryPreparation: false,
          },
        ],
      },
    });
    expect(view!.results.map((row) => row.message)).toEqual([
      '전송 완료',
      '발주확인이 필요합니다. 주문조회 화면에서 발주확인을 먼저 진행한 뒤 송장을 전송해 주세요.',
      '주문 상태상 송장 전송이 불가합니다.',
      '택배사 확인이 필요합니다. 스마트스토어에서 지원하는 택배사로 연결해 주세요.',
      '송장 연결 충돌이 있어 전송하지 않았습니다.',
      '아직 전송하지 않았습니다. 이전 묶음 오류로 요청하지 않았습니다.',
    ]);
  });

  it('marks non-Coupang/Smartstore success as 상태 확인 지원 예정', () => {
    const view = buildRecentTransmitResultView({
      body: {
        batchId: 'batch-2',
        summary: { requestedCount: 1, successCount: 1, failureCount: 0, skippedCount: 0 },
        results: [
          {
            matchId: 'm-11',
            attemptId: 'a-11',
            attempted: true,
            previousStatus: 'READY',
            nextStatus: 'SENT',
            success: true,
            retryable: false,
            errorCode: null,
            errorMessage: null,
            providerRequestId: null,
            requiresRetryPreparation: false,
          },
        ],
      },
      displayRows: [{ matchId: 'm-11', providerLabel: 'ELEVEN', mallOrderNo: 'E-1' }],
    });

    expect(view?.results[0]?.verificationStatus).toBe('UNSUPPORTED');
    expect(verificationStatusLabel('UNSUPPORTED')).toBe('상태 확인 지원 예정');
    expect(collectVerifiableAttemptIds(view!.results)).toEqual([]);
  });
});

describe('map transmission verify status', () => {
  it('maps smartstore statuses including partial', () => {
    expect(mapSmartstoreProductOrderStatuses({ statuses: ['DELIVERING'] }).status).toBe('CONFIRMED');
    expect(mapSmartstoreProductOrderStatuses({ statuses: ['PAYED'] }).status).toBe('PENDING');
    expect(mapSmartstoreProductOrderStatuses({ statuses: ['CANCELED'] }).status).toBe('ATTENTION');
    expect(
      mapSmartstoreProductOrderStatuses({ statuses: ['DELIVERING', 'PAYED'] }),
    ).toMatchObject({ status: 'PARTIAL', confirmedItems: 1, totalItems: 2 });
  });

  it('maps coupang statuses', () => {
    expect(mapCoupangOrderSheetStatuses({ statuses: ['DEPARTURE'] }).status).toBe('CONFIRMED');
    expect(mapCoupangOrderSheetStatuses({ statuses: ['INSTRUCT'] }).status).toBe('PENDING');
    expect(mapCoupangOrderSheetStatuses({ statuses: ['NONE_TRACKING'] }).status).toBe('ATTENTION');
  });
});

describe('parseVerifyTransmissionBody', () => {
  it('rejects empty and dedupes ids', () => {
    expect(parseVerifyTransmissionBody(null).ok).toBe(false);
    expect(parseVerifyTransmissionBody({ attemptIds: [] }).ok).toBe(false);
    expect(parseVerifyTransmissionBody({ attemptIds: [' a ', 'a', 'b'] })).toEqual({
      ok: true,
      body: { attemptIds: ['a', 'b'] },
    });
  });
});

describe('verify identifier extractors', () => {
  const base: VerifyTransmissionAttemptRecord = {
    id: 'a1',
    userId: 'u1',
    uploadBatchId: 'b1',
    shipmentMatchId: 'm1',
    provider: 'SMARTSTORE',
    integrationAccountId: 'acc',
    status: 'SUCCESS',
    mallOrderNo: 'ORD-1',
    mallLineItemIdsJson: null,
    orderSyncOrder: null,
  };

  it('extracts smartstore product order ids and coupang box ids', () => {
    expect(
      extractSmartstoreProductOrderIds({
        ...base,
        mallLineItemIdsJson: ['PO-1', 'bundle:99'],
      }),
    ).toEqual(['PO-1']);

    expect(
      extractCoupangShipmentBoxIds({
        ...base,
        provider: 'COUPANG',
        orderSyncOrder: {
          mallLineItemIds: ['bundle:111'],
          normalizedPayloadJson: { shipmentBoxIds: ['222', '111'] },
        },
      }),
    ).toEqual(['222', '111']);
  });
});

describe('runVerifyTransmissionService', () => {
  it('verifies smartstore success attempt and marks unsupported providers', async () => {
    const { buildSmartstoreItemShipmentFingerprint } = await import(
      '@/app/lib/smartstore/smartstore-batch-dispatch'
    );
    const fp = buildSmartstoreItemShipmentFingerprint({
      userId: 'u1',
      integrationAccountId: 'acc-ss',
      productOrderId: 'PO-1',
      deliveryCompanyCode: 'CJGLS',
      trackingNumber: '123456789012',
    });
    const result = await runVerifyTransmissionService(
      {
        findAttempts: async () => [
          {
            id: 'a-ss',
            userId: 'u1',
            uploadBatchId: 'b1',
            shipmentMatchId: 'm-ss',
            provider: 'SMARTSTORE',
            integrationAccountId: 'acc-ss',
            status: 'SUCCESS',
            mallOrderNo: 'ORD-1',
            mallLineItemIdsJson: ['PO-1'],
            trackingNumberNormalized: '123456789012',
            courierCode: 'CJ',
            responseSummaryJson: {
              itemResults: [
                {
                  productOrderId: 'PO-1',
                  status: 'SUCCESS',
                  shipmentFingerprint: fp,
                },
              ],
            },
            orderSyncOrder: { mallLineItemIds: ['PO-1'], normalizedPayloadJson: null },
          },
          {
            id: 'a-11',
            userId: 'u1',
            uploadBatchId: 'b1',
            shipmentMatchId: 'm-11',
            provider: 'ELEVEN',
            integrationAccountId: 'acc-11',
            status: 'SUCCESS',
            mallOrderNo: 'ORD-2',
            mallLineItemIdsJson: ['X'],
            orderSyncOrder: null,
          },
        ],
        loadAccount: async () =>
          ({
            id: 'acc-ss',
          }) as never,
        resolveSmartstoreCredentials: () => ({
          clientId: 'cid',
          clientSecret: 'secret',
          authType: 'SELF',
        }),
        fetchSmartstoreByIds: async () => [
          {
            productOrder: { productOrderId: 'PO-1', productOrderStatus: 'DELIVERING' },
            delivery: { deliveryCompanyCode: 'CJGLS', trackingNumber: '123456789012' },
          },
        ],
        now: () => new Date('2026-07-21T06:00:00.000Z'),
      },
      { userId: 'u1', batchId: 'b1', attemptIds: ['a-ss', 'a-11', 'missing'] },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.results).toEqual([
      expect.objectContaining({ attemptId: 'a-ss', status: 'CONFIRMED' }),
      expect.objectContaining({ attemptId: 'a-11', status: 'UNSUPPORTED' }),
      expect.objectContaining({ attemptId: 'missing', status: 'CHECK_FAILED' }),
    ]);
  });

  it('never calls transmitted-order PII clear helpers', async () => {
    const clearSpy = vi.spyOn(
      await import('@/app/lib/order-integration/snapshots/clear-transmitted-order-pii'),
      'clearTransmittedOrderPiiIfComplete',
    );
    const { buildSmartstoreItemShipmentFingerprint } = await import(
      '@/app/lib/smartstore/smartstore-batch-dispatch'
    );
    const fp = buildSmartstoreItemShipmentFingerprint({
      userId: 'u1',
      integrationAccountId: 'acc-ss',
      productOrderId: 'PO-1',
      deliveryCompanyCode: 'CJGLS',
      trackingNumber: '123456789012',
    });

    const result = await runVerifyTransmissionService(
      {
        findAttempts: async () => [
          {
            id: 'a-ss',
            userId: 'u1',
            uploadBatchId: 'b1',
            shipmentMatchId: 'm-ss',
            provider: 'SMARTSTORE',
            integrationAccountId: 'acc-ss',
            status: 'SUCCESS',
            mallOrderNo: 'ORD-1',
            mallLineItemIdsJson: ['PO-1'],
            trackingNumberNormalized: '123456789012',
            courierCode: 'CJ',
            responseSummaryJson: {
              itemResults: [
                {
                  productOrderId: 'PO-1',
                  status: 'SUCCESS',
                  shipmentFingerprint: fp,
                },
              ],
            },
            orderSyncOrder: { mallLineItemIds: ['PO-1'], normalizedPayloadJson: null },
          },
        ],
        loadAccount: async () => ({ id: 'acc-ss' }) as never,
        resolveSmartstoreCredentials: () => ({
          clientId: 'cid',
          clientSecret: 'secret',
          authType: 'SELF',
        }),
        fetchSmartstoreByIds: async () => [
          {
            productOrder: { productOrderId: 'PO-1', productOrderStatus: 'DELIVERING' },
            delivery: { deliveryCompanyCode: 'CJGLS', trackingNumber: '123456789012' },
          },
        ],
      },
      { userId: 'u1', batchId: 'b1', attemptIds: ['a-ss'] },
    );

    expect(result.ok).toBe(true);
    expect(clearSpy).not.toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('flags coupang invoice mismatch as ATTENTION even when status is DEPARTURE', async () => {
    const result = await runVerifyTransmissionService(
      {
        findAttempts: async () => [
          {
            id: 'a-cp',
            userId: 'u1',
            uploadBatchId: 'b1',
            shipmentMatchId: 'm-cp',
            provider: 'COUPANG',
            integrationAccountId: 'acc-cp',
            status: 'SUCCESS',
            mallOrderNo: 'ORD-1',
            mallLineItemIdsJson: ['bundle:111'],
            trackingNumberNormalized: 'INV-1',
            orderSyncOrder: {
              mallLineItemIds: ['bundle:111'],
              normalizedPayloadJson: { shipmentBoxIds: ['111'] },
            },
          },
        ],
        loadAccount: async () => ({ id: 'acc-cp' }) as never,
        resolveCoupangCredentials: () => ({
          vendorId: 'A00012345',
          accessKey: 'access',
          secretKey: 'secret',
        }),
        fetchCoupangByBoxId: async () => ({
          shipmentBoxId: '111',
          status: 'DEPARTURE',
          invoiceNumber: 'OTHER',
        }),
      },
      { userId: 'u1', batchId: 'b1', attemptIds: ['a-cp'] },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.results[0]?.status).toBe('ATTENTION');
  });

  it('merges verification into recent transmit view labels', () => {
    const view = buildRecentTransmitResultView({
      body: {
        batchId: 'b1',
        summary: { requestedCount: 1, successCount: 1, failureCount: 0, skippedCount: 0 },
        results: [
          {
            matchId: 'm1',
            attemptId: 'a1',
            attempted: true,
            previousStatus: 'READY',
            nextStatus: 'SENT',
            success: true,
            retryable: false,
            errorCode: null,
            errorMessage: null,
            providerRequestId: null,
            requiresRetryPreparation: false,
          },
        ],
      },
      displayRows: [{ matchId: 'm1', providerLabel: 'COUPANG', mallOrderNo: '1' }],
    })!;
    const merged = mergeVerificationIntoRecentTransmitView(view, {
      results: [
        {
          attemptId: 'a1',
          status: 'PENDING',
          message: '대기',
        },
      ],
    });
    expect(verificationStatusLabel(merged.results[0]?.verificationStatus ?? null)).toBe('반영 대기');
  });
});
