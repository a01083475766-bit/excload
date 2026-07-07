import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import { createEmptyBaseHeaderRow, type BaseHeaderRow } from '@/app/pipeline/base/base-headers';
import type { OrderStandardFile, StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import type { LotteonOrderRecord } from '@/app/lib/lotteon/client';

const LOTTEON_STATUS_LABEL: Record<string, string> = {
  '11': '출고지시',
  '12': '상품준비',
  '13': '발송완료',
  '14': '배송완료',
};

export const LOTTEON_PREVIEW_HEADERS = [
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

export type LotteonPreviewRow = Record<(typeof LOTTEON_PREVIEW_HEADERS)[number], string>;

function mapStatusLabel(order: LotteonOrderRecord): string {
  if (order.odPrgsStepNm) return order.odPrgsStepNm;
  if (order.odPrgsStepCd) return LOTTEON_STATUS_LABEL[order.odPrgsStepCd] ?? order.odPrgsStepCd;
  return '';
}

function normalizePhone(value?: string | null): string {
  if (!value) return '';
  return value.replace(/[^\d+]/g, '').replace(/^\+82/, '0');
}

function formatLotteonDateTime(value?: string): string {
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

export function mapLotteonOrderToStandardRow(order: LotteonOrderRecord): BaseHeaderRow {
  const row = createEmptyBaseHeaderRow();
  const paidAt = order.odCmptDttm || order.odAcptDttm;

  row['주문번호'] = order.odNo;
  row['상품주문번호'] = `${order.odNo}-${order.odSeq}`;
  row['주문상태'] = mapStatusLabel(order);
  row['주문일시'] = formatLotteonDateTime(order.odAcptDttm);
  row['결제일시'] = formatLotteonDateTime(paidAt);
  row['받는사람'] = order.rcvrNm;
  row['받는사람전화1'] = normalizePhone(order.rcvrPhone);
  row['받는사람우편번호'] = order.rcvrZipNo;
  row['받는사람주소1'] = order.rcvrBaseAddr;
  row['받는사람주소2'] = order.rcvrDtlAddr;
  row['배송메시지'] = order.dlvMsg;
  row['상품명'] = order.pdNm;
  row['수량'] = order.odQty || '1';
  row['결제금액'] = order.odAmt;
  row['판매처'] = '롯데ON';

  return row;
}

export function mapLotteonOrdersToStandardRows(orders: LotteonOrderRecord[]): BaseHeaderRow[] {
  return orders.map((order) => mapLotteonOrderToStandardRow(order));
}

export function mapLotteonOrdersToOrderStandardFile(orders: LotteonOrderRecord[]): OrderStandardFile {
  const rows: StandardOrderRow[] = mapLotteonOrdersToStandardRows(orders).map((row) => ({ ...row }));
  return {
    baseHeaders: BASE_HEADERS,
    rows,
    unknownHeaders: [],
  };
}

export function mapLotteonOrdersToPreviewRows(orders: LotteonOrderRecord[]): LotteonPreviewRow[] {
  return mapLotteonOrdersToStandardRows(orders).map((row) => ({
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
