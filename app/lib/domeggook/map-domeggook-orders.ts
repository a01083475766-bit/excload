import { BASE_HEADERS, createEmptyBaseHeaderRow, type BaseHeaderRow } from '@/app/pipeline/base/base-headers';
import type { OrderStandardFile, StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import type { DomeggookOrderRecord } from '@/app/lib/domeggook/client';

export const DOMEGGOOK_PREVIEW_HEADERS = [
  '주문번호',
  '주문상태',
  '받는사람',
  '받는사람전화1',
  '받는사람주소1',
  '상품명',
  '수량',
  '결제일시',
  '배송메시지',
] as const;

export type DomeggookPreviewRow = Record<(typeof DOMEGGOOK_PREVIEW_HEADERS)[number], string>;

function normalizePhone(value?: string | null): string {
  if (!value) return '';
  return value.replace(/[^\d+]/g, '').replace(/^\+82/, '0');
}

export function mapDomeggookOrderToStandardRow(order: DomeggookOrderRecord): BaseHeaderRow {
  const row = createEmptyBaseHeaderRow();
  const qty = Number.parseInt(order.quantity, 10);

  row['주문번호'] = order.orderNo;
  row['상품주문번호'] = order.orderNo;
  row['주문상태'] = order.orderStatus;
  row['결제일시'] = order.orderedAt;
  // getOrderList만으로는 수취인·전화·주소가 비어 있을 수 있다. 빈 값을 임의로 채우지 않는다.
  row['받는사람'] = order.receiverName;
  row['받는사람전화1'] = normalizePhone(order.receiverPhone);
  row['받는사람주소1'] = order.receiverAddress;
  row['배송메시지'] = order.deliveryMemo;
  row['상품명'] = order.productName;
  row['수량'] = Number.isFinite(qty) && qty > 0 ? String(qty) : order.quantity;
  row['판매처'] = '도매꾹';

  return row;
}

export function mapDomeggookOrdersToPreviewRows(orders: DomeggookOrderRecord[]): DomeggookPreviewRow[] {
  return orders.map((order) => ({
    주문번호: order.orderNo,
    주문상태: order.orderStatus,
    받는사람: order.receiverName,
    받는사람전화1: normalizePhone(order.receiverPhone),
    받는사람주소1: order.receiverAddress,
    상품명: order.productName,
    수량: order.quantity,
    결제일시: order.orderedAt,
    배송메시지: order.deliveryMemo,
  }));
}

export function mapDomeggookOrdersToOrderStandardFile(orders: DomeggookOrderRecord[]): OrderStandardFile {
  const rows: StandardOrderRow[] = orders.map((order) => ({ ...mapDomeggookOrderToStandardRow(order) }));
  return {
    baseHeaders: BASE_HEADERS,
    rows,
    unknownHeaders: [],
  };
}
