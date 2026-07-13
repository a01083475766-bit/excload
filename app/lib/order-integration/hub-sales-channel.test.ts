import { describe, expect, it } from 'vitest';
import {
  HUB_SALES_CHANNEL_EXCEL_FALLBACK,
  HUB_SALES_CHANNEL_HEADER,
  fillEmptySalesChannelRows,
  salesChannelLabelFromFileName,
} from '@/app/lib/order-integration/hub-sales-channel';

describe('hub-sales-channel', () => {
  it('strips extension and truncates long file names', () => {
    expect(salesChannelLabelFromFileName('쿠팡_주문_0310.xlsx')).toBe('쿠팡_주문_0310');
    expect(salesChannelLabelFromFileName('a.b.c.xls')).toBe('a.b.c');
    expect(salesChannelLabelFromFileName('')).toBe(HUB_SALES_CHANNEL_EXCEL_FALLBACK);
    expect(salesChannelLabelFromFileName('.xlsx')).toBe(HUB_SALES_CHANNEL_EXCEL_FALLBACK);

    const long = `${'가'.repeat(50)}.xlsx`;
    expect(salesChannelLabelFromFileName(long)).toHaveLength(40);
  });

  it('fills only empty 판매처 cells', () => {
    const rows = fillEmptySalesChannelRows(
      [
        { 주문번호: '1', 판매처: '쿠팡' },
        { 주문번호: '2', 판매처: '  ' },
        { 주문번호: '3' },
      ],
      '텍스트주문',
    );

    expect(rows[0]?.[HUB_SALES_CHANNEL_HEADER]).toBe('쿠팡');
    expect(rows[1]?.[HUB_SALES_CHANNEL_HEADER]).toBe('텍스트주문');
    expect(rows[2]?.[HUB_SALES_CHANNEL_HEADER]).toBe('텍스트주문');
  });
});
