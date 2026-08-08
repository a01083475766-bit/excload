import { BASE_HEADERS, createEmptyBaseHeaderRow, type BaseHeaderRow } from '@/app/pipeline/base/base-headers';
import type { OrderStandardFile, StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import type { DomeggookOrderRecord } from '@/app/lib/domeggook/client';
import { toDomeggookOrderNoQueryValue } from '@/app/lib/domeggook/client';

export const DOMEGGOOK_PREVIEW_HEADERS = [
  '주문번호',
  '주문상태',
  '받는사람',
  '받는사람전화1',
  '받는사람우편번호',
  '받는사람주소1',
  '상품명',
  '상품옵션',
  '수량',
  '결제일시',
  '배송메시지',
] as const;

export type DomeggookPreviewRow = Record<(typeof DOMEGGOOK_PREVIEW_HEADERS)[number], string>;

function normalizePhone(value?: string | null): string {
  if (!value) return '';
  return value.replace(/[^\d+]/g, '').replace(/^\+82/, '0');
}

function marketLabel(market: string): string {
  const m = market.trim().toLowerCase();
  if (m === 'supply') return '도매매';
  if (m === 'dome') return '도매꾹';
  return market ? `도매꾹(${market})` : '도매꾹';
}

export function mapDomeggookOrderToStandardRow(order: DomeggookOrderRecord): BaseHeaderRow {
  const row = createEmptyBaseHeaderRow();
  const qty = Number.parseInt(order.quantity, 10);
  const apiOrderNo = toDomeggookOrderNoQueryValue(order.orderNo);

  // 표시용 원본 주문번호 보존 (OR 접두 포함 가능). API용 숫자는 스냅샷 mallLineItemIds에 별도 저장.
  row['주문번호'] = order.orderNo;
  row['상품주문번호'] = order.orderUid || order.orderNo;
  row['주문상태'] = order.orderStatus;
  row['결제일시'] = order.orderedAt;
  row['받는사람'] = order.receiverName;
  row['받는사람전화1'] = normalizePhone(order.receiverPhone);
  row['받는사람우편번호'] = order.postalCode;
  row['받는사람주소1'] = order.receiverAddress1 || order.receiverAddress;
  row['받는사람주소2'] = order.receiverAddress2;
  row['배송메시지'] = order.deliveryMemo;
  row['상품명'] = order.productName;
  row['상품옵션'] = order.productOption;
  row['수량'] = Number.isFinite(qty) && qty > 0 ? String(qty) : order.quantity;
  row['판매처'] = marketLabel(order.market);
  // 비민감 메타 — 기존 표준 슬롯 활용 (표시용 합침 저장 금지)
  if (apiOrderNo) row['출고번호'] = apiOrderNo;
  if (order.statusMode) row['센터코드'] = order.statusMode;
  if (order.market) row['출고타입'] = order.market;
  if (order.deliveryCompany) row['택배사'] = order.deliveryCompany;
  if (order.deliveryCode) row['운송장번호'] = order.deliveryCode;
  if (order.deliveryMethod) row['배송방법'] = order.deliveryMethod;

  return row;
}

export function mapDomeggookOrdersToPreviewRows(orders: DomeggookOrderRecord[]): DomeggookPreviewRow[] {
  return orders.map((order) => ({
    주문번호: order.orderNo,
    주문상태: order.orderStatus,
    받는사람: order.receiverName,
    받는사람전화1: normalizePhone(order.receiverPhone),
    받는사람우편번호: order.postalCode,
    받는사람주소1: order.receiverAddress1 || order.receiverAddress,
    상품명: order.productName,
    상품옵션: order.productOption,
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
