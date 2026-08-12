import { describe, expect, it, vi } from 'vitest';
import { buildLotteonLineKey, extractLotteonLineIds, isLotteonClaimLine } from '@/app/lib/lotteon/lotteon-ids';
import { classifyLotteonConfirmPreflight, runLotteonConfirm } from '@/app/lib/lotteon/lotteon-confirm';
import { isLotteonConfirmableRow } from '@/app/lib/lotteon/lotteon-fetch-panel-logic';
import {
  buildLotteonDispatchInformItem,
  decideLotteonVerifyFromOrders,
  resolveLotteonDeliveryCompanyCode,
  runLotteonInvoiceTransmission,
} from '@/app/lib/lotteon/lotteon-invoice';
import { mapLotteonOrdersToFetchViews, mapLotteonStatus } from '@/app/lib/lotteon/map-lotteon-orders';
import { collectMallLineItemIds } from '@/app/lib/order-integration/snapshots/build-order-sync-snapshots';
import { isOrderFullyTransmittedForPiiClear } from '@/app/lib/order-integration/transmission/order-status-summary';
import { resolveProviderCourierCode } from '@/app/lib/order-integration/transmission/courier-mapping';
import { isShipmentTarget } from '@/app/lib/order-integration/order-status';

const baseOrder = {
  odNo: 'OM1',
  odSeq: '1',
  procSeq: '1',
  orglProcSeq: '',
  clmNo: '',
  odPrgsStepCd: '11',
  odPrgsStepNm: '출고지시',
  dvRtrvDvsCd: 'DV',
  odTypCd: '10',
  odTypDtlCd: '',
  spdNo: 'LO100',
  sitmNo: 'LO10010',
  pdNm: '상품',
  odQty: '1',
  slQty: '1',
  odCmptDttm: '',
  odAcptDttm: '',
  rcvrNm: '홍길동',
  rcvrPhone: '01011112222',
  rcvrZipNo: '',
  rcvrBaseAddr: '',
  rcvrDtlAddr: '',
  dlvMsg: '',
  odAmt: '',
  invcNo: '',
  dvCoCd: '',
  raw: {},
};

describe('lotteon status mapping', () => {
  it('maps 출고지시 to PAYED + NOT_YET and not hub eligible', () => {
    const mapped = mapLotteonStatus(baseOrder);
    expect(mapped).toMatchObject({
      status: 'PAYED',
      placeOrderStatus: 'NOT_YET',
      hubEligible: false,
    });
    const views = mapLotteonOrdersToFetchViews([baseOrder]);
    expect(isShipmentTarget(views[0]!)).toBe(true);
    expect(views[0]?.hubEligible).toBe(false);
  });

  it('maps 상품준비 to PAYED + OK hub eligible', () => {
    const mapped = mapLotteonStatus({ ...baseOrder, odPrgsStepCd: '12' });
    expect(mapped.placeOrderStatus).toBe('OK');
    expect(mapped.hubEligible).toBe(true);
  });

  it('excludes return/exchange from shipment', () => {
    const returned = mapLotteonStatus({ ...baseOrder, odTypCd: '40', odPrgsStepCd: '27' });
    expect(returned.status).toBe('RETURNED');
    expect(returned.hubEligible).toBe(false);
    const views = mapLotteonOrdersToFetchViews([{ ...baseOrder, odTypCd: '40', odPrgsStepCd: '27', slQty: '0' }]);
    expect(isShipmentTarget(views[0]!)).toBe(false);
  });

  it('excludes quantity 0 from hub even when 상품준비', () => {
    const views = mapLotteonOrdersToFetchViews([{ ...baseOrder, odPrgsStepCd: '12', slQty: '0', odQty: '0' }]);
    expect(views[0]?.hubEligible).toBe(false);
    expect(isShipmentTarget(views[0]!)).toBe(false);
  });
});

describe('lotteon confirm eligibility', () => {
  it('allows only 출고지시 DV rows', () => {
    expect(
      isLotteonConfirmableRow({
        mallId: 'lotteon',
        status: 'PAYED',
        placeOrderStatus: 'NOT_YET',
        mallOrderStatusCode: '11',
      }),
    ).toBe(true);
    expect(
      classifyLotteonConfirmPreflight({
        odNo: 'OM1',
        odSeq: '1',
        odPrgsStepCd: '11',
        dvRtrvDvsCd: 'DV',
        odTypCd: '10',
      }),
    ).toBeNull();
  });

  it('skips claim and already confirmed', () => {
    expect(
      classifyLotteonConfirmPreflight({
        odNo: 'OM1',
        odSeq: '1',
        odTypCd: '40',
        odPrgsStepCd: '11',
      })?.status,
    ).toBe('SKIPPED_NOT_ELIGIBLE');
    expect(
      classifyLotteonConfirmPreflight({
        odNo: 'OM1',
        odSeq: '1',
        odPrgsStepCd: '12',
      })?.status,
    ).toBe('ALREADY_CONFIRMED');
  });

  it('does not treat generic inform failure as already confirmed', async () => {
    const result = await runLotteonConfirm({
      credentials: { apiKey: 'k' },
      items: [{ odNo: 'OM1', odSeq: '1', odPrgsStepCd: '11' }],
      inform: async () => {
        throw new Error('연동완료 통보에 실패했습니다.');
      },
    });
    expect(result.results[0]?.status).toBe('FAILED');
    expect(result.failedCount).toBe(1);
  });

  it('reports partial success per order', async () => {
    const inform = vi.fn(async ({ items }: { items: Array<{ odNo: string }> }) => {
      if (items[0]?.odNo === 'FAIL') throw new Error('처리 실패');
      return { returnCode: '0000' };
    });
    const result = await runLotteonConfirm({
      credentials: { apiKey: 'k' },
      items: [
        { odNo: 'OK1', odSeq: '1', odPrgsStepCd: '11' },
        { odNo: 'FAIL', odSeq: '1', odPrgsStepCd: '11' },
        { odNo: 'CLM', odSeq: '1', odTypCd: '20', odPrgsStepCd: '11' },
      ],
      inform: inform as never,
    });
    expect(result.confirmedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.results.map((row) => row.status)).toEqual([
      'CONFIRMED',
      'FAILED',
      'SKIPPED_NOT_ELIGIBLE',
    ]);
  });
});

describe('lotteon line ids and invoice body', () => {
  it('keeps split-line identifiers', () => {
    const key = buildLotteonLineKey({
      odNo: 'OM1',
      odSeq: '2',
      procSeq: '3',
      spdNo: 'SP',
      sitmNo: 'SI',
      dvRtrvDvsCd: 'DV',
      odTypCd: '10',
      slQty: '1',
      clmNo: '',
      odPrgsStepCd: '12',
    });
    const parsed = extractLotteonLineIds([key], 'OM1');
    expect(parsed[0]).toMatchObject({ odNo: 'OM1', odSeq: '2', procSeq: '3', spdNo: 'SP', sitmNo: 'SI' });
  });

  it('stores lotteonLine in snapshot mallLineItemIds', () => {
    const ids = collectMallLineItemIds([
      {
        주문번호: 'OM1',
        상품주문번호: 'OM1-1',
        출고타입: 'DV',
        출고번호: '1',
        판매상품번호: 'SP',
        옵션ID: 'SI',
        관리상품번호: '10',
        수량: '2',
        주문상태: '상품준비',
        제휴주문번호: '',
      },
    ]);
    expect(ids.some((id) => id.startsWith('lotteonLine:OM1|1|1|SP|SI'))).toBe(true);
  });

  it('maps official courier codes', () => {
    expect(resolveProviderCourierCode({ provider: 'LOTTEON', courierCode: 'CJ' })).toBe('0002');
    expect(resolveLotteonDeliveryCompanyCode({ courierCode: 'HANJIN', courierName: null })).toEqual({
      ok: true,
      dvCoCd: '0006',
    });
  });

  it('builds dispatch inform with step 13 and tracking', () => {
    const item = buildLotteonDispatchInformItem({
      line: extractLotteonLineIds(
        [
          buildLotteonLineKey({
            odNo: 'OM1',
            odSeq: '1',
            procSeq: '1',
            spdNo: 'SP',
            sitmNo: 'SI',
            dvRtrvDvsCd: 'DV',
            odTypCd: '10',
            slQty: '1',
            clmNo: '',
            odPrgsStepCd: '12',
          }),
        ],
        'OM1',
      )[0]!,
      dvCoCd: '0002',
      invcNo: '123456789012',
      now: new Date('2026-08-12T03:00:00.000Z'),
    });
    expect(item.odPrgsStepCd).toBe('13');
    expect(item.dvCoCd).toBe('0002');
    expect(item.invcNo).toBe('123456789012');
    expect(item.invcNbr).toBe('1');
    expect(item.spdNo).toBe('SP');
    expect(item.sitmNo).toBe('SI');
    expect(item.dvTrcStatDttm).toHaveLength(14);
  });

  it('rejects claim lines and missing tracking', async () => {
    const claimKey = buildLotteonLineKey({
      odNo: 'OM1',
      odSeq: '1',
      procSeq: '1',
      spdNo: 'SP',
      sitmNo: 'SI',
      dvRtrvDvsCd: 'RTRV',
      odTypCd: '40',
      slQty: '1',
      clmNo: 'CM1',
      odPrgsStepCd: '23',
    });
    expect(isLotteonClaimLine(extractLotteonLineIds([claimKey])[0]!)).toBe(true);
    const claimResult = await runLotteonInvoiceTransmission({
      credentials: { apiKey: 'k' },
      mallOrderNo: 'OM1',
      mallLineItemIds: [claimKey],
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: '123456789012',
      inform: vi.fn(),
    });
    expect(claimResult.success).toBe(false);
    expect(claimResult.errorCode).toBe('CLAIM_EXCLUDED');

    const missing = await runLotteonInvoiceTransmission({
      credentials: { apiKey: 'k' },
      mallOrderNo: 'OM1',
      mallLineItemIds: [
        buildLotteonLineKey({
          odNo: 'OM1',
          odSeq: '1',
          procSeq: '1',
          spdNo: 'SP',
          sitmNo: 'SI',
          dvRtrvDvsCd: 'DV',
          odTypCd: '10',
          slQty: '1',
          clmNo: '',
          odPrgsStepCd: '12',
        }),
      ],
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: '  ',
      inform: vi.fn(),
    });
    expect(missing.errorCode).toBe('TRACKING_NUMBER_MISSING');
  });

  it('reuses in-flight promise for duplicate transmit', async () => {
    let calls = 0;
    const inform = vi.fn(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { returnCode: '0000' };
    });
    const line = buildLotteonLineKey({
      odNo: 'OM1',
      odSeq: '1',
      procSeq: '1',
      spdNo: 'SP',
      sitmNo: 'SI',
      dvRtrvDvsCd: 'DV',
      odTypCd: '10',
      slQty: '1',
      clmNo: '',
      odPrgsStepCd: '12',
    });
    const input = {
      credentials: { apiKey: 'k' },
      mallOrderNo: 'OM1',
      mallLineItemIds: [line],
      courierCode: 'CJ' as const,
      courierName: null,
      trackingNumber: '123456789012',
      inform: inform as never,
    };
    const [a, b] = await Promise.all([
      runLotteonInvoiceTransmission(input),
      runLotteonInvoiceTransmission(input),
    ]);
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    expect(calls).toBe(1);
  });

  it('reports partial invoice success without marking the whole request success', async () => {
    const inform = vi.fn(async ({ items }: { items: Array<{ odSeq: string }> }) => {
      if (items[0]?.odSeq === '2') throw new Error('처리 실패');
      return { returnCode: '0000' };
    });
    const result = await runLotteonInvoiceTransmission({
      credentials: { apiKey: 'k' },
      mallOrderNo: 'OM1',
      mallLineItemIds: [
        buildLotteonLineKey({
          odNo: 'OM1',
          odSeq: '1',
          procSeq: '1',
          spdNo: 'SP',
          sitmNo: 'SI',
          dvRtrvDvsCd: 'DV',
          odTypCd: '10',
          slQty: '1',
          clmNo: '',
          odPrgsStepCd: '12',
        }),
        buildLotteonLineKey({
          odNo: 'OM1',
          odSeq: '2',
          procSeq: '1',
          spdNo: 'SP2',
          sitmNo: 'SI2',
          dvRtrvDvsCd: 'DV',
          odTypCd: '10',
          slQty: '1',
          clmNo: '',
          odPrgsStepCd: '12',
        }),
      ],
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: '123456789012',
      inform: inform as never,
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PARTIAL_ERROR');
    expect(result.retryable).toBe(false);
    expect(result.outcomeKind).toBe('unknown');
  });
});

describe('lotteon verify and pii', () => {
  it('confirms only when progress is 13+ and tracking matches', () => {
    const line = extractLotteonLineIds(
      [
        buildLotteonLineKey({
          odNo: 'OM1',
          odSeq: '1',
          procSeq: '1',
          spdNo: 'SP',
          sitmNo: 'SI',
          dvRtrvDvsCd: 'DV',
          odTypCd: '10',
          slQty: '1',
          clmNo: '',
          odPrgsStepCd: '12',
        }),
      ],
      'OM1',
    )[0]!;
    expect(
      decideLotteonVerifyFromOrders({
        lines: [line],
        expectedTracking: '123',
        expectedDvCoCd: '0002',
        orders: [{ odNo: 'OM1', odSeq: '1', procSeq: '1', odPrgsStepCd: '12' }],
      }).status,
    ).toBe('PENDING');
    expect(
      decideLotteonVerifyFromOrders({
        lines: [line],
        expectedTracking: '123',
        expectedDvCoCd: '0002',
        orders: [
          { odNo: 'OM1', odSeq: '1', procSeq: '1', odPrgsStepCd: '13', invcNo: '123', dvCoCd: '0002' },
        ],
      }).status,
    ).toBe('CONFIRMED');
  });

  it('does not treat mixed SENT/FAILED as complete for PII clear', () => {
    expect(isOrderFullyTransmittedForPiiClear(['SENT', 'FAILED'])).toBe(false);
    expect(isOrderFullyTransmittedForPiiClear(['SENT', 'SKIPPED'])).toBe(true);
  });
});
