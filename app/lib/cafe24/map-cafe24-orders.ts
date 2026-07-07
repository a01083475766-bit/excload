import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import { createEmptyBaseHeaderRow, type BaseHeaderRow } from '@/app/pipeline/base/base-headers';
import type { OrderStandardFile, StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import type { Cafe24Order, Cafe24OrderItem } from '@/app/lib/cafe24/client';

const CAFE24_STATUS_LABEL: Record<string, string> = {
  N00: '입금전',
  N10: '상품준비중',
  N20: '배송준비중',
  N21: '배송대기',
  N22: '배송보류',
  N30: '배송중',
  N40: '배송완료',
  N50: '구매확정',
  C00: '취소신청',
  C40: '취소완료',
  R00: '반품신청',
  R40: '반품완료',
  E00: '교환신청',
  E40: '교환완료',
};

export const CAFE24_PREVIEW_HEADERS = [
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

export type Cafe24PreviewRow = Record<(typeof CAFE24_PREVIEW_HEADERS)[number], string>;

function mapStatusLabel(status?: string): string {
  if (!status) return '';
  return CAFE24_STATUS_LABEL[status] ?? status;
}

function normalizePhone(value?: string | null): string {
  if (!value) return '';
  return value.replace(/[^\d+]/g, '').replace(/^\+82/, '0');
}

function flattenCafe24Orders(orders: Cafe24Order[]): Array<{ order: Cafe24Order; item: Cafe24OrderItem | null }> {
  const rows: Array<{ order: Cafe24Order; item: Cafe24OrderItem | null }> = [];

  for (const order of orders) {
    const items = order.items ?? [];
    if (!items.length) {
      rows.push({ order, item: null });
      continue;
    }
    for (const item of items) {
      rows.push({ order, item });
    }
  }

  return rows;
}

export function mapCafe24OrderRowToStandardRow(input: {
  order: Cafe24Order;
  item: Cafe24OrderItem | null;
}): BaseHeaderRow {
  const row = createEmptyBaseHeaderRow();
  const { order, item } = input;
  const receiver = order.receivers?.[0] ?? {};
  const buyer = order.buyer ?? {};

  row['주문번호'] = order.order_id ?? '';
  row['상품주문번호'] = item?.order_item_code ?? order.order_id ?? '';
  row['주문상태'] = mapStatusLabel(order.order_status);
  row['주문일시'] = order.order_date ?? '';
  row['결제일시'] = order.payment_date ?? '';
  row['주문자'] = buyer.name ?? '';
  row['주문자연락처'] = normalizePhone(buyer.cellphone || buyer.phone);
  row['받는사람'] = receiver.name ?? '';
  row['받는사람전화1'] = normalizePhone(receiver.cellphone || receiver.phone);
  row['받는사람우편번호'] = receiver.zipcode ?? '';
  row['받는사람주소1'] = receiver.address1 ?? '';
  row['받는사람주소2'] = receiver.address2 ?? '';
  row['배송메시지'] = receiver.shipping_message ?? order.shipping_message ?? '';
  row['상품명'] = item?.product_name ?? '';
  row['상품옵션'] = item?.option_value ?? '';
  row['수량'] = item?.quantity != null ? String(item.quantity) : '1';
  row['결제금액'] = order.payment_amount != null ? String(order.payment_amount) : '';
  row['판매처'] = '카페24';

  return row;
}

export function mapCafe24OrdersToStandardRows(orders: Cafe24Order[]): BaseHeaderRow[] {
  return flattenCafe24Orders(orders).map((entry) => mapCafe24OrderRowToStandardRow(entry));
}

export function mapCafe24OrdersToOrderStandardFile(orders: Cafe24Order[]): OrderStandardFile {
  const rows: StandardOrderRow[] = mapCafe24OrdersToStandardRows(orders).map((row) => ({ ...row }));
  return {
    baseHeaders: BASE_HEADERS,
    rows,
    unknownHeaders: [],
  };
}

export function mapCafe24OrdersToPreviewRows(orders: Cafe24Order[]): Cafe24PreviewRow[] {
  return mapCafe24OrdersToStandardRows(orders).map((row) => ({
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
