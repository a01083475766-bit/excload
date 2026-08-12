import { describe, expect, it } from 'vitest';

import {
  collectSelectedAcknowledgementBoxIds,
  isCoupangAcceptRow,
  isRowHubEligible,
} from '@/app/lib/coupang/coupang-fetch-panel-logic';

const rowKey = (mallId: string, accountId: string, rowIndex: number) =>
  `${mallId}:${accountId}:${rowIndex}`;

describe('coupang fetch panel logic', () => {
  it('allows hub only when coupang hubEligible is true', () => {
    expect(isRowHubEligible({ mallId: 'coupang', hubEligible: true })).toBe(true);
    expect(isRowHubEligible({ mallId: 'coupang', hubEligible: false })).toBe(false);
    expect(isRowHubEligible({ mallId: 'smartstore', hubEligible: undefined })).toBe(true);
  });

  it('allows hub only when lotteon hubEligible is true', () => {
    expect(isRowHubEligible({ mallId: 'lotteon', hubEligible: true })).toBe(true);
    expect(isRowHubEligible({ mallId: 'lotteon', hubEligible: false })).toBe(false);
    expect(isRowHubEligible({ mallId: 'lotteon', hubEligible: undefined })).toBe(false);
  });

  it('collects only ACCEPT rows and dedupes shipmentBoxId', () => {
    const rows = [
      {
        mallId: 'coupang',
        accountId: 'acc',
        rowIndex: 0,
        mallOrderStatusCode: 'ACCEPT',
        shipmentBoxId: '100',
      },
      {
        mallId: 'coupang',
        accountId: 'acc',
        rowIndex: 1,
        mallOrderStatusCode: 'ACCEPT',
        shipmentBoxId: '100',
      },
      {
        mallId: 'coupang',
        accountId: 'acc',
        rowIndex: 2,
        mallOrderStatusCode: 'INSTRUCT',
        shipmentBoxId: '200',
      },
    ];
    const selected = new Set([
      rowKey('coupang', 'acc', 0),
      rowKey('coupang', 'acc', 1),
      rowKey('coupang', 'acc', 2),
    ]);

    expect(isCoupangAcceptRow(rows[0]!)).toBe(true);
    expect(collectSelectedAcknowledgementBoxIds(rows, selected, rowKey)).toEqual(['100']);
  });

  it('ignores non-coupang rows for acknowledgement selection', () => {
    const rows = [
      {
        mallId: 'smartstore',
        accountId: 'acc',
        rowIndex: 0,
        mallOrderStatusCode: 'ACCEPT',
        shipmentBoxId: '999',
      },
    ];
    const selected = new Set([rowKey('smartstore', 'acc', 0)]);
    expect(collectSelectedAcknowledgementBoxIds(rows, selected, rowKey)).toEqual([]);
  });
});
