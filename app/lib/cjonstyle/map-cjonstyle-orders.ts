import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import { createEmptyBaseHeaderRow, type BaseHeaderRow } from '@/app/pipeline/base/base-headers';
import type { OrderStandardFile, StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import type { CjonstyleOrderRecord } from '@/app/lib/cjonstyle/client';

export const CJONSTYLE_PREVIEW_HEADERS = [
  '주문번호',
  '상품주문번호',
  '배송타입',
  '주문상태',
  '받는사람',
  '받는사람전화1',
  '받는사람주소1',
  '상품명',
  '수량',
  '결제일시',
  '배송메시지',
] as const;

export type CjonstylePreviewRow = Record<(typeof CJONSTYLE_PREVIEW_HEADERS)[number], string>;

function normalizePhone(value?: string | null): string {
  if (!value) return '';
  return value.replace(/[^\d+]/g, '').replace(/^\+82/, '0');
}

function formatCjonstyleDateTime(value?: string): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  if (digits.length >= 14) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)} ${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}`;
  }
  if (digits.length >= 12) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)} ${digits.slice(8, 10)}:${digits.slice(10, 12)}`;
  }
  return value;
}

export function mapCjonstyleOrderToStandardRow(order: CjonstyleOrderRecord): BaseHeaderRow {
  const row = createEmptyBaseHeaderRow();

  row['주문번호'] = order.ordNo;
  row['상품주문번호'] = `${order.ordNo}-${order.ordItemSeq}`;
  row['주문상태'] = order.statusName || `배송타입 ${order.deliveryMethodCode}`;
  row['결제일시'] = formatCjonstyleDateTime(order.ordDate);
  row['받는사람'] = order.rcvrNm;
  row['받는사람전화1'] = normalizePhone(order.rcvrPhone);
  row['받는사람우편번호'] = order.rcvrZip;
  row['받는사람주소1'] = order.rcvrAddr1;
  row['받는사람주소2'] = order.rcvrAddr2;
  row['배송메시지'] = order.dlvMsg;
  row['상품명'] = order.itemNm;
  row['수량'] = order.ordQty || '1';
  row['결제금액'] = order.payAmt;
  row['판매처'] = 'CJ온스타일';

  return row;
}

export function mapCjonstyleOrdersToStandardRows(orders: CjonstyleOrderRecord[]): BaseHeaderRow[] {
  return orders.map((order) => mapCjonstyleOrderToStandardRow(order));
}

export function mapCjonstyleOrdersToOrderStandardFile(orders: CjonstyleOrderRecord[]): OrderStandardFile {
  const rows: StandardOrderRow[] = mapCjonstyleOrdersToStandardRows(orders).map((row) => ({ ...row }));
  return {
    baseHeaders: BASE_HEADERS,
    rows,
    unknownHeaders: [],
  };
}

export function mapCjonstyleOrdersToPreviewRows(orders: CjonstyleOrderRecord[]): CjonstylePreviewRow[] {
  return mapCjonstyleOrdersToStandardRows(orders).map((row, index) => ({
    주문번호: row['주문번호'],
    상품주문번호: row['상품주문번호'] ?? row['주문번호'],
    배송타입: orders[index]?.deliveryMethodCode ?? '',
    주문상태: row['주문상태'],
    받는사람: row['받는사람'],
    받는사람전화1: row['받는사람전화1'],
    받는사람주소1: [row['받는사람주소1'], row['받는사람주소2']].filter(Boolean).join(' ').trim(),
    상품명: row['상품명'],
    수량: row['수량'],
    결제일시: row['결제일시'],
    배송메시지: row['배송메시지'],
  }));
}
