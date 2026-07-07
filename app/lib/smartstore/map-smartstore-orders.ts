import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import { createEmptyBaseHeaderRow, type BaseHeaderRow } from '@/app/pipeline/base/base-headers';
import type { OrderStandardFile, StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import type { SmartstoreProductOrderDetail } from '@/app/lib/smartstore/client';

const SMARTSTORE_STATUS_LABEL: Record<string, string> = {
  PAYED: '결제완료',
  PAYMENT_WAITING: '결제대기',
  DELIVERING: '배송중',
  DELIVERED: '배송완료',
  PURCHASE_DECIDED: '구매확정',
  CANCELED: '취소',
  CANCELED_BY_NOPAYMENT: '미결제취소',
  RETURNED: '반품',
  EXCHANGED: '교환',
};

export const SMARTSTORE_PREVIEW_HEADERS = [
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

export type SmartstorePreviewRow = Record<(typeof SMARTSTORE_PREVIEW_HEADERS)[number], string>;

function mapStatusLabel(status?: string): string {
  if (!status) return '';
  return SMARTSTORE_STATUS_LABEL[status] ?? status;
}

function normalizePhone(value?: string | null): string {
  if (!value) return '';
  return value.replace(/[^\d+]/g, '').replace(/^\+82/, '0');
}

export function mapSmartstoreOrderToStandardRow(detail: SmartstoreProductOrderDetail): BaseHeaderRow {
  const row = createEmptyBaseHeaderRow();
  const order = detail.order ?? {};
  const productOrder = detail.productOrder ?? {};
  const shipping = productOrder.shippingAddress ?? {};

  row['주문번호'] = order.orderId ?? '';
  row['상품주문번호'] = productOrder.productOrderId ?? '';
  row['주문상태'] = mapStatusLabel(productOrder.productOrderStatus);
  row['주문일시'] = order.orderDate ?? '';
  row['결제일시'] = order.paymentDate ?? '';
  row['주문자'] = order.ordererName ?? '';
  row['주문자연락처'] = normalizePhone(order.ordererTel);
  row['받는사람'] = shipping.name ?? '';
  row['받는사람전화1'] = normalizePhone(shipping.tel1 || shipping.tel2);
  row['받는사람우편번호'] = shipping.zipCode ?? '';
  row['받는사람주소1'] = shipping.baseAddress ?? '';
  row['받는사람주소2'] = shipping.detailedAddress ?? '';
  row['배송메시지'] = productOrder.shippingMemo ?? '';
  row['상품명'] = productOrder.productName ?? '';
  row['상품옵션'] = productOrder.productOption ?? '';
  row['수량'] = productOrder.quantity != null ? String(productOrder.quantity) : '1';
  row['판매처'] = '스마트스토어';

  return row;
}

export function mapSmartstoreOrdersToStandardRows(
  orders: SmartstoreProductOrderDetail[],
): BaseHeaderRow[] {
  return orders.map((order) => mapSmartstoreOrderToStandardRow(order));
}

export function mapSmartstoreOrdersToOrderStandardFile(
  orders: SmartstoreProductOrderDetail[],
): OrderStandardFile {
  const rows: StandardOrderRow[] = mapSmartstoreOrdersToStandardRows(orders).map((row) => ({ ...row }));
  return {
    baseHeaders: BASE_HEADERS,
    rows,
    unknownHeaders: [],
  };
}

export function mapSmartstoreOrdersToPreviewRows(
  orders: SmartstoreProductOrderDetail[],
): SmartstorePreviewRow[] {
  return mapSmartstoreOrdersToStandardRows(orders).map((row) => ({
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
