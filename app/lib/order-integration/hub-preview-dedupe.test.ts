import { describe, expect, it } from 'vitest';
import {
  buildHubPreviewSourceDedupeKey,
  filterHubPreviewRowsBySourceDedupe,
} from '@/app/lib/order-integration/hub-preview-dedupe';
import type { PreviewRowWithId } from '@/app/order-convert/OrderConvertPreviewTableRow';

describe('buildHubPreviewSourceDedupeKey', () => {
  it('uses mall + order + product order id', () => {
    const key = buildHubPreviewSourceDedupeKey({
      판매처: '스마트스토어',
      주문번호: 'O-1',
      상품주문번호: 'PO-9',
    });
    expect(key).toBe(['스마트스토어', 'O-1', 'PO-9'].join('\u001f'));
  });

  it('falls back to shipment box + option id for Coupang-like rows', () => {
    const key = buildHubPreviewSourceDedupeKey({
      판매처: '쿠팡',
      주문번호: 'C-1',
      묶음배송번호: 'BOX-1',
      옵션ID: 'VI-2',
    });
    expect(key).toBe(['쿠팡', 'C-1', 'BOX-1:VI-2'].join('\u001f'));
  });

  it('returns null when order number is missing', () => {
    expect(
      buildHubPreviewSourceDedupeKey({
        판매처: '스마트스토어',
        상품주문번호: 'PO-1',
      }),
    ).toBeNull();
  });
});

describe('filterHubPreviewRowsBySourceDedupe', () => {
  const row = (id: string, key?: string): PreviewRowWithId => ({
    rowId: id,
    data: { 받는사람: id },
    ...(key ? { sourceDedupeKey: key } : {}),
  });

  it('skips rows whose source key already exists', () => {
    const result = filterHubPreviewRowsBySourceDedupe(
      [row('n1', 'a'), row('n2', 'b'), row('n3', 'a')],
      [row('e1', 'a')],
    );
    expect(result.skipped).toBe(2);
    expect(result.toAdd.map((r) => r.rowId)).toEqual(['n2']);
  });

  it('keeps rows without a key', () => {
    const result = filterHubPreviewRowsBySourceDedupe([row('n1'), row('n2', 'x')], [
      row('e1', 'x'),
    ]);
    expect(result.skipped).toBe(1);
    expect(result.toAdd.map((r) => r.rowId)).toEqual(['n1']);
  });
});
