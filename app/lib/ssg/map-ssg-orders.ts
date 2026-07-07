import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import { createEmptyBaseHeaderRow, type BaseHeaderRow } from '@/app/pipeline/base/base-headers';
import type { OrderStandardFile, StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import type { SsgOrderRecord } from '@/app/lib/ssg/client';

const SSG_SOURCE_LABEL: Record<SsgOrderRecord['source'], string> = {
  shpp_direction: '배송지시',
  warehouse_out: '출고대상',
};

export const SSG_PREVIEW_HEADERS = [
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

export type SsgPreviewRow = Record<(typeof SSG_PREVIEW_HEADERS)[number], string>;

function mapStatusLabel(order: SsgOrderRecord): string {
  if (order.statusName) return order.statusName;
  return SSG_SOURCE_LABEL[order.source];
}

function normalizePhone(value?: string | null): string {
  if (!value) return '';
  return value.replace(/[^\d+]/g, '').replace(/^\+82/, '0');
}

function formatSsgDateTime(value?: string): string {
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

function buildProductOrderNo(order: SsgOrderRecord): string {
  if (order.shppNo && order.shppSeq) {
    return `${order.ordNo}-${order.ordItemSeq}(${order.shppNo}-${order.shppSeq})`;
  }
  return `${order.ordNo}-${order.ordItemSeq}`;
}

export function mapSsgOrderToStandardRow(order: SsgOrderRecord): BaseHeaderRow {
  const row = createEmptyBaseHeaderRow();

  row['주문번호'] = order.ordNo;
  row['상품주문번호'] = buildProductOrderNo(order);
  row['주문상태'] = mapStatusLabel(order);
  row['결제일시'] = formatSsgDateTime(order.ordCmplDts);
  row['받는사람'] = order.rcptpeNm;
  row['받는사람전화1'] = normalizePhone(order.rcptpePhone);
  row['받는사람우편번호'] = order.shpplocZipcd;
  row['받는사람주소1'] = order.shpplocBascAddr;
  row['받는사람주소2'] = order.shpplocDtlAddr;
  row['배송메시지'] = order.ordMemoCntt;
  row['상품명'] = order.itemNm;
  row['수량'] = order.ordQty || '1';
  row['결제금액'] = order.sellprc;
  row['판매처'] = 'SSG.COM';

  return row;
}

export function mapSsgOrdersToStandardRows(orders: SsgOrderRecord[]): BaseHeaderRow[] {
  return orders.map((order) => mapSsgOrderToStandardRow(order));
}

export function mapSsgOrdersToOrderStandardFile(orders: SsgOrderRecord[]): OrderStandardFile {
  const rows: StandardOrderRow[] = mapSsgOrdersToStandardRows(orders).map((row) => ({ ...row }));
  return {
    baseHeaders: BASE_HEADERS,
    rows,
    unknownHeaders: [],
  };
}

export function mapSsgOrdersToPreviewRows(orders: SsgOrderRecord[]): SsgPreviewRow[] {
  return mapSsgOrdersToStandardRows(orders).map((row) => ({
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
