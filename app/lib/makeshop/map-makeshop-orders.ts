import {
  BASE_HEADERS,
  createEmptyBaseHeaderRow,
  type BaseHeaderRow,
} from '@/app/pipeline/base/base-headers';
import type { OrderStandardFile, StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import type { MakeshopOrderRecord } from '@/app/lib/makeshop/client';

export const MAKESHOP_PREVIEW_HEADERS = [
  '주문번호',
  '상품주문번호',
  '주문상태',
  '받는사람',
  '받는사람전화1',
  '받는사람주소1',
  '상품명',
  '수량',
  '결제일시',
  '배송메시지',
] as const;

export type MakeshopPreviewRow = Record<(typeof MAKESHOP_PREVIEW_HEADERS)[number], string>;

function normalizePhone(value?: string | null): string {
  if (!value) return '';
  return value.replace(/[^\d+]/g, '').replace(/^\+82/, '0');
}

function formatMakeshopDateTime(value?: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.length >= 19 ? trimmed.slice(0, 19).replace('T', ' ') : trimmed;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  if (digits.length >= 14) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)} ${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}`;
  }
  return trimmed;
}

export function mapMakeshopOrderToStandardRow(order: MakeshopOrderRecord): BaseHeaderRow {
  const row = createEmptyBaseHeaderRow();

  row['주문번호'] = order.orderNo;
  row['상품주문번호'] = `${order.orderNo}-${order.orderItemNo}`;
  row['주문상태'] = order.orderStatus;
  row['주문일시'] = formatMakeshopDateTime(order.orderDate);
  row['결제일시'] = formatMakeshopDateTime(order.paymentDt || order.orderDate);
  row['받는사람'] = order.receiverName;
  row['받는사람전화1'] = normalizePhone(order.receiverPhone);
  row['받는사람우편번호'] = order.receiverZip;
  row['받는사람주소1'] = order.receiverAddr1;
  row['받는사람주소2'] = order.receiverAddr2;
  row['배송메시지'] = order.deliveryMemo;
  row['상품명'] = order.productName;
  row['수량'] = order.orderQty || '1';
  row['결제금액'] = order.payAmt;
  row['판매처'] = '메이크샵';

  return row;
}

export function mapMakeshopOrdersToStandardRows(orders: MakeshopOrderRecord[]): BaseHeaderRow[] {
  return orders.map((order) => mapMakeshopOrderToStandardRow(order));
}

export function mapMakeshopOrdersToOrderStandardFile(orders: MakeshopOrderRecord[]): OrderStandardFile {
  const rows: StandardOrderRow[] = mapMakeshopOrdersToStandardRows(orders).map((row) => ({ ...row }));
  return {
    baseHeaders: BASE_HEADERS,
    rows,
    unknownHeaders: [],
  };
}

export function mapMakeshopOrdersToPreviewRows(orders: MakeshopOrderRecord[]): MakeshopPreviewRow[] {
  return mapMakeshopOrdersToStandardRows(orders).map((row) => ({
    주문번호: row['주문번호'],
    상품주문번호: row['상품주문번호'] ?? row['주문번호'],
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
