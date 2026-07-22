import { describe, expect, it } from 'vitest';

import {
  collectSelectedSmartstoreConfirmProductOrderIds,
  isSmartstorePlaceOrderNotYetRow,
} from '@/app/lib/smartstore/smartstore-fetch-panel-logic';

const rowKey = (mallId: string, accountId: string, rowIndex: number) =>
  `${mallId}:${accountId}:${rowIndex}`;

describe('smartstore-fetch-panel-logic', () => {
  it('detects only smartstore PAYED + NOT_YET without claim', () => {
    expect(
      isSmartstorePlaceOrderNotYetRow({
        mallId: 'smartstore',
        status: 'PAYED',
        placeOrderStatus: 'NOT_YET',
      }),
    ).toBe(true);
    expect(
      isSmartstorePlaceOrderNotYetRow({
        mallId: 'coupang',
        status: 'PAYED',
        placeOrderStatus: 'NOT_YET',
      }),
    ).toBe(false);
    expect(
      isSmartstorePlaceOrderNotYetRow({
        mallId: 'smartstore',
        status: 'PAYED',
        placeOrderStatus: 'OK',
      }),
    ).toBe(false);
    expect(
      isSmartstorePlaceOrderNotYetRow({
        mallId: 'smartstore',
        status: 'PAYED',
        placeOrderStatus: 'NOT_YET',
        claimLabel: '취소',
      }),
    ).toBe(false);
  });

  it('collects productOrderIds with dedupe and rejects orderId fallback', () => {
    const rows = [
      {
        mallId: 'smartstore',
        accountId: 'a1',
        rowIndex: 0,
        status: 'PAYED',
        placeOrderStatus: 'NOT_YET',
        orderNo: 'ORDER-1',
        productOrderNo: 'PO-1',
      },
      {
        mallId: 'smartstore',
        accountId: 'a1',
        rowIndex: 1,
        status: 'PAYED',
        placeOrderStatus: 'NOT_YET',
        orderNo: 'ORDER-1',
        productOrderNo: 'PO-2',
      },
      {
        mallId: 'smartstore',
        accountId: 'a1',
        rowIndex: 2,
        status: 'PAYED',
        placeOrderStatus: 'NOT_YET',
        orderNo: 'ORDER-9',
        productOrderNo: 'ORDER-9',
      },
      {
        mallId: 'coupang',
        accountId: 'a1',
        rowIndex: 3,
        status: 'PAYED',
        placeOrderStatus: 'NOT_YET',
        orderNo: 'C-1',
        productOrderNo: 'C-PO-1',
      },
    ];

    const selected = new Set([
      rowKey('smartstore', 'a1', 0),
      rowKey('smartstore', 'a1', 1),
      rowKey('smartstore', 'a1', 1),
      rowKey('smartstore', 'a1', 2),
      rowKey('coupang', 'a1', 3),
    ]);

    expect(collectSelectedSmartstoreConfirmProductOrderIds(rows, selected, rowKey)).toEqual([
      'PO-1',
      'PO-2',
    ]);
  });
});
