import { describe, expect, it, vi } from 'vitest';

import {
  mergeLotteonFetchedOrderLists,
  type LotteonOrderRecord,
} from '@/app/lib/lotteon/client';
import { runLotteonConfirm } from '@/app/lib/lotteon/lotteon-confirm';
import { mergeLotteonConfirmedOrdersIntoFetchResult } from '@/app/lib/lotteon/lotteon-confirm-merge';
import { isLotteonConfirmableRow } from '@/app/lib/lotteon/lotteon-fetch-panel-logic';
import { buildLotteonLineKey, extractLotteonLineIds } from '@/app/lib/lotteon/lotteon-ids';
import {
  decideLotteonVerifyFromOrders,
  runLotteonInvoiceTransmission,
} from '@/app/lib/lotteon/lotteon-invoice';
import {
  mapLotteonOrdersToFetchViews,
  mapLotteonOrdersToStandardRows,
  mapLotteonStatus,
} from '@/app/lib/lotteon/map-lotteon-orders';
import { isRowHubEligible } from '@/app/lib/order-integration/hub-eligibility';
import { collectMallLineItemIds } from '@/app/lib/order-integration/snapshots/build-order-sync-snapshots';
import { isShipmentTarget } from '@/app/lib/order-integration/order-status';
import { isOrderFullyTransmittedForPiiClear } from '@/app/lib/order-integration/transmission/order-status-summary';

function order(partial: Partial<LotteonOrderRecord> & Pick<LotteonOrderRecord, 'odNo' | 'odSeq' | 'odPrgsStepCd'>): LotteonOrderRecord {
  return {
    procSeq: '1',
    orglProcSeq: '',
    clmNo: '',
    odPrgsStepNm: '',
    dvRtrvDvsCd: 'DV',
    odTypCd: '10',
    odTypDtlCd: '',
    spdNo: 'SP1',
    sitmNo: 'SI1',
    pdNm: '상품',
    odQty: '2',
    slQty: '2',
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
    ...partial,
  };
}

describe('209 + 140 merge prefers current progress', () => {
  it('keeps 12 when 209=11 and 140=12', () => {
    const merged = mergeLotteonFetchedOrderLists(
      [order({ odNo: 'OM1', odSeq: '1', odPrgsStepCd: '11' })],
      [order({ odNo: 'OM1', odSeq: '1', odPrgsStepCd: '12' })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.odPrgsStepCd).toBe('12');
    expect(mapLotteonStatus(merged[0]!).placeOrderStatus).toBe('OK');
    expect(mapLotteonStatus(merged[0]!).hubEligible).toBe(true);
  });

  it('keeps 13 when 209=11 and 140=13', () => {
    const merged = mergeLotteonFetchedOrderLists(
      [order({ odNo: 'OM1', odSeq: '1', odPrgsStepCd: '11' })],
      [order({ odNo: 'OM1', odSeq: '1', odPrgsStepCd: '13', invcNo: 'TRK1', dvCoCd: '0002' })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.odPrgsStepCd).toBe('13');
    expect(mapLotteonStatus(merged[0]!).status).toBe('DELIVERING');
  });

  it('maps 14/15 to delivered and does not fall back to 11', () => {
    for (const step of ['14', '15'] as const) {
      const merged = mergeLotteonFetchedOrderLists(
        [order({ odNo: 'OM1', odSeq: '1', odPrgsStepCd: '11' })],
        [order({ odNo: 'OM1', odSeq: '1', odPrgsStepCd: step })],
      );
      expect(merged).toHaveLength(1);
      expect(merged[0]?.odPrgsStepCd).toBe(step);
      expect(mapLotteonStatus(merged[0]!).status).toBe('DELIVERED');
    }
  });

  it('does not duplicate the same line across 209 and 140', () => {
    const merged = mergeLotteonFetchedOrderLists(
      [
        order({ odNo: 'OM1', odSeq: '1', procSeq: '1', spdNo: 'SP1', sitmNo: 'SI1', odPrgsStepCd: '11' }),
        order({ odNo: 'OM1', odSeq: '2', procSeq: '1', spdNo: 'SP2', sitmNo: 'SI2', odPrgsStepCd: '11' }),
      ],
      [
        order({ odNo: 'OM1', odSeq: '1', procSeq: '1', spdNo: 'SP1', sitmNo: 'SI1', odPrgsStepCd: '12' }),
      ],
    );
    expect(merged).toHaveLength(2);
    expect(merged.find((row) => row.odSeq === '1')?.odPrgsStepCd).toBe('12');
    expect(merged.find((row) => row.odSeq === '2')?.odPrgsStepCd).toBe('11');
  });

  it('keeps split lines with different procSeq/sitmNo separate', () => {
    const merged = mergeLotteonFetchedOrderLists(
      [
        order({ odNo: 'OM1', odSeq: '1', procSeq: '1', sitmNo: 'A', odPrgsStepCd: '11' }),
        order({ odNo: 'OM1', odSeq: '1', procSeq: '2', sitmNo: 'B', odPrgsStepCd: '11' }),
      ],
      [order({ odNo: 'OM1', odSeq: '1', procSeq: '2', sitmNo: 'B', odPrgsStepCd: '12' })],
    );
    expect(merged).toHaveLength(2);
    expect(merged.find((row) => row.procSeq === '1')?.odPrgsStepCd).toBe('11');
    expect(merged.find((row) => row.procSeq === '2')?.odPrgsStepCd).toBe('12');
  });
});

describe('confirm success/failure UI merge', () => {
  it('promotes only successful lines to 12 and hub-eligible', () => {
    const views = mapLotteonOrdersToFetchViews([
      order({ odNo: 'OM1', odSeq: '1', odPrgsStepCd: '11' }),
      order({ odNo: 'OM1', odSeq: '2', odPrgsStepCd: '11' }),
    ]);
    const rows = mapLotteonOrdersToStandardRows([
      order({ odNo: 'OM1', odSeq: '1', odPrgsStepCd: '11' }),
      order({ odNo: 'OM1', odSeq: '2', odPrgsStepCd: '11' }),
    ]);
    const merged = mergeLotteonConfirmedOrdersIntoFetchResult({
      rows,
      views,
      results: [
        { productOrderNo: 'OM1-1', status: 'CONFIRMED' },
        { productOrderNo: 'OM1-2', status: 'FAILED' },
      ],
    });

    expect(merged.views[0]?.mallOrderStatusCode).toBe('12');
    expect(merged.views[0]?.placeOrderStatus).toBe('OK');
    expect(merged.views[0]?.hubEligible).toBe(true);
    expect(isLotteonConfirmableRow({ mallId: 'lotteon', ...merged.views[0]! })).toBe(false);
    expect(isRowHubEligible({ mallId: 'lotteon', hubEligible: merged.views[0]?.hubEligible })).toBe(true);

    expect(merged.views[1]?.mallOrderStatusCode).toBe('11');
    expect(merged.views[1]?.placeOrderStatus).toBe('NOT_YET');
    expect(isLotteonConfirmableRow({ mallId: 'lotteon', ...merged.views[1]! })).toBe(true);
    expect(isRowHubEligible({ mallId: 'lotteon', hubEligible: merged.views[1]?.hubEligible })).toBe(false);
  });
});

describe('snapshot mallLineItemIds round-trip', () => {
  it('stores lotteonLine ids only for shippable 상품준비 lines and restores identifiers', () => {
    const ready = order({
      odNo: 'OM1',
      odSeq: '1',
      procSeq: '1',
      spdNo: 'SP1',
      sitmNo: 'SI1',
      odPrgsStepCd: '12',
      slQty: '1',
      odQty: '3',
    });
    const split = order({
      odNo: 'OM1',
      odSeq: '2',
      procSeq: '2',
      spdNo: 'SP2',
      sitmNo: 'SI2',
      odPrgsStepCd: '12',
      slQty: '2',
      odQty: '2',
    });
    const claim = order({
      odNo: 'OM1',
      odSeq: '3',
      odPrgsStepCd: '23',
      odTypCd: '40',
      dvRtrvDvsCd: 'RTRV',
      slQty: '0',
    });
    const zero = order({
      odNo: 'OM1',
      odSeq: '4',
      odPrgsStepCd: '12',
      slQty: '0',
      odQty: '1',
    });

    const views = mapLotteonOrdersToFetchViews([ready, split, claim, zero]);
    expect(isRowHubEligible({ mallId: 'lotteon', hubEligible: views[0]?.hubEligible })).toBe(true);
    expect(isRowHubEligible({ mallId: 'lotteon', hubEligible: views[1]?.hubEligible })).toBe(true);
    expect(isRowHubEligible({ mallId: 'lotteon', hubEligible: views[2]?.hubEligible })).toBe(false);
    expect(isRowHubEligible({ mallId: 'lotteon', hubEligible: views[3]?.hubEligible })).toBe(false);
    expect(isShipmentTarget(views[2]!)).toBe(false);
    expect(isShipmentTarget(views[3]!)).toBe(false);

    const shippableRows = mapLotteonOrdersToStandardRows([ready, split]);
    const ids = collectMallLineItemIds(shippableRows as Array<Record<string, string>>);
    expect(ids.filter((id) => id.startsWith('lotteonLine:'))).toHaveLength(2);

    const restored = extractLotteonLineIds(ids, 'OM1');
    expect(restored).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ odNo: 'OM1', odSeq: '1', procSeq: '1', spdNo: 'SP1', sitmNo: 'SI1', slQty: '1' }),
        expect.objectContaining({ odNo: 'OM1', odSeq: '2', procSeq: '2', spdNo: 'SP2', sitmNo: 'SI2', slQty: '2' }),
      ]),
    );
    // slQty는 잔여(발송 가능) 수량. 최초 odQty=3이 아님.
    expect(restored.find((row) => row.odSeq === '1')?.slQty).toBe('1');
  });
});

describe('timeout and uncertain dispatch safety', () => {
  it('reconciles 210 timeout via 140 and does not invite blind retry when confirmed', async () => {
    const result = await runLotteonConfirm({
      credentials: { apiKey: 'k' },
      items: [{ odNo: 'OM1', odSeq: '1', odPrgsStepCd: '11' }],
      inform: async () => {
        throw new Error('timeout');
      },
      fetchByOdNo: async () => [order({ odNo: 'OM1', odSeq: '1', odPrgsStepCd: '12' })],
    });
    expect(result.results[0]?.status).toBe('ALREADY_CONFIRMED');
    expect(result.needsCheckCount).toBe(0);
  });

  it('keeps NEEDS_CHECK when 210 times out and 140 does not confirm', async () => {
    const result = await runLotteonConfirm({
      credentials: { apiKey: 'k' },
      items: [{ odNo: 'OM1', odSeq: '1', odPrgsStepCd: '11' }],
      inform: async () => {
        throw new Error('gateway timeout');
      },
      fetchByOdNo: async () => [],
    });
    expect(result.results[0]?.status).toBe('NEEDS_CHECK');
    expect(result.needsCheckCount).toBe(1);
    expect(result.results[0]?.message).toMatch(/다시 시도/);
  });

  it('marks 137 timeout as unknown/not retryable unless 140 confirms', async () => {
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
    const unknown = await runLotteonInvoiceTransmission({
      credentials: { apiKey: 'k' },
      mallOrderNo: 'OM1',
      mallLineItemIds: [line],
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: '123456789012',
      inform: async () => {
        throw new Error('request timeout');
      },
      fetchByOdNo: async () => [order({ odNo: 'OM1', odSeq: '1', odPrgsStepCd: '12' })],
    });
    expect(unknown.outcomeKind).toBe('unknown');
    expect(unknown.retryable).toBe(false);
    expect(unknown.errorCode).toBe('PROVIDER_STATUS_UNKNOWN');

    const confirmed = await runLotteonInvoiceTransmission({
      credentials: { apiKey: 'k' },
      mallOrderNo: 'OM1',
      mallLineItemIds: [line],
      courierCode: 'CJ',
      courierName: null,
      trackingNumber: '123456789012',
      inform: async () => {
        throw new Error('request timeout');
      },
      fetchByOdNo: async () => [
        order({
          odNo: 'OM1',
          odSeq: '1',
          odPrgsStepCd: '13',
          invcNo: '123456789012',
          dvCoCd: '0002',
          spdNo: 'SP',
          sitmNo: 'SI',
        }),
      ],
    });
    expect(confirmed.success).toBe(true);
  });

  it('does not confirm a different sitmNo line as success', () => {
    const line = extractLotteonLineIds(
      [
        buildLotteonLineKey({
          odNo: 'OM1',
          odSeq: '1',
          procSeq: '1',
          spdNo: 'SP1',
          sitmNo: 'SI1',
          dvRtrvDvsCd: 'DV',
          odTypCd: '10',
          slQty: '1',
          clmNo: '',
          odPrgsStepCd: '12',
        }),
      ],
      'OM1',
    )[0]!;
    const decision = decideLotteonVerifyFromOrders({
      lines: [line],
      expectedTracking: 'TRK',
      expectedDvCoCd: '0002',
      orders: [
        {
          odNo: 'OM1',
          odSeq: '1',
          procSeq: '1',
          spdNo: 'SP1',
          sitmNo: 'OTHER',
          odPrgsStepCd: '13',
          invcNo: 'TRK',
          dvCoCd: '0002',
        },
      ],
    });
    expect(decision.status).toBe('PENDING');
  });

  it('blocks PII clear while any match is PENDING/FAILED/UNKNOWN', () => {
    expect(isOrderFullyTransmittedForPiiClear(['SENT', 'FAILED'])).toBe(false);
    expect(isOrderFullyTransmittedForPiiClear(['SENT', 'UNKNOWN'])).toBe(false);
    expect(isOrderFullyTransmittedForPiiClear(['SENT', 'SKIPPED'])).toBe(true);
  });
});

describe('hub eligibility regression for other malls', () => {
  it('keeps coupang strict and other malls default-true when hubEligible unset', () => {
    expect(isRowHubEligible({ mallId: 'coupang', hubEligible: undefined })).toBe(false);
    expect(isRowHubEligible({ mallId: 'coupang', hubEligible: true })).toBe(true);
    expect(isRowHubEligible({ mallId: 'smartstore', hubEligible: undefined })).toBe(true);
    expect(isRowHubEligible({ mallId: 'eleven', hubEligible: undefined })).toBe(true);
    expect(isRowHubEligible({ mallId: 'cafe24', hubEligible: undefined })).toBe(false);
    expect(isRowHubEligible({ mallId: 'domeggook', hubEligible: undefined })).toBe(true);
  });
});
