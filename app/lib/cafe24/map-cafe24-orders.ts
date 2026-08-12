import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import { createEmptyBaseHeaderRow, type BaseHeaderRow } from '@/app/pipeline/base/base-headers';
import type { OrderStandardFile, StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import type { Cafe24Order, Cafe24OrderItem } from '@/app/lib/cafe24/client';
import { formatCafe24ShopNoForCenterCode } from '@/app/lib/cafe24/cafe24-shop-no';
import {
  EXCLOAD_ORDER_STATUS_LABEL,
  type ExcloadOrderStatus,
  type ExcloadPlaceOrderStatus,
} from '@/app/lib/order-integration/order-status';
import type { OrderFetchView } from '@/app/lib/order-integration/order-fetch-view';

export const CAFE24_STATUS_LABEL: Record<string, string> = {
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

function resolveCafe24LineOrderStatus(
  order: Cafe24Order,
  item: Cafe24OrderItem | null,
): string {
  const itemStatus = String(item?.order_status ?? '')
    .trim()
    .toUpperCase();
  if (itemStatus) return itemStatus;
  return String(order.order_status ?? '')
    .trim()
    .toUpperCase();
}

export function mapCafe24OrderRowToStandardRow(input: {
  order: Cafe24Order;
  item: Cafe24OrderItem | null;
}): BaseHeaderRow {
  const row = createEmptyBaseHeaderRow();
  const { order, item } = input;
  const receiver = order.receivers?.[0] ?? {};
  const buyer = order.buyer ?? {};
  const lineStatus = resolveCafe24LineOrderStatus(order, item);

  row['주문번호'] = order.order_id ?? '';
  row['상품주문번호'] = item?.order_item_code ?? order.order_id ?? '';
  row['주문상태'] = mapStatusLabel(lineStatus);
  // Cafe24 멀티쇼핑몰 shop_no 보존(비민감). 스냅샷 mallLineItemIds(`shop_no:N`)에서도 사용.
  // 도매꾹은 동일 필드에 WAIT* 상태코드를 넣지만 몰별로 해석하므로 스키마 변경 없이 유지.
  row['센터코드'] = formatCafe24ShopNoForCenterCode(order.shop_no);
  // 원본 주문/품목 상태 코드(N10 등) — 발주확인 판정용. 개인정보 아님.
  row['출고타입'] = lineStatus;
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

export function mapCafe24Status(orderStatus: string | null | undefined): {
  status: ExcloadOrderStatus;
  placeOrderStatus: ExcloadPlaceOrderStatus;
  statusLabel: string;
  hubEligible: boolean;
  claimLabel: string;
  mallOrderStatusCode: string;
} {
  const code = String(orderStatus ?? '')
    .trim()
    .toUpperCase();
  const statusLabel = CAFE24_STATUS_LABEL[code] ?? code;
  if (code.startsWith('C')) {
    return {
      status: 'CANCELED',
      placeOrderStatus: 'UNKNOWN',
      statusLabel,
      hubEligible: false,
      claimLabel: EXCLOAD_ORDER_STATUS_LABEL.CANCELED,
      mallOrderStatusCode: code,
    };
  }
  if (code.startsWith('R')) {
    return {
      status: 'RETURNED',
      placeOrderStatus: 'UNKNOWN',
      statusLabel,
      hubEligible: false,
      claimLabel: EXCLOAD_ORDER_STATUS_LABEL.RETURNED,
      mallOrderStatusCode: code,
    };
  }
  if (code.startsWith('E')) {
    return {
      status: 'EXCHANGED',
      placeOrderStatus: 'UNKNOWN',
      statusLabel,
      hubEligible: false,
      claimLabel: EXCLOAD_ORDER_STATUS_LABEL.EXCHANGED,
      mallOrderStatusCode: code,
    };
  }
  if (code === 'N00') {
    return {
      status: 'PAYED',
      placeOrderStatus: 'UNKNOWN',
      statusLabel,
      hubEligible: false,
      claimLabel: '',
      mallOrderStatusCode: code,
    };
  }
  if (code === 'N10') {
    // 상품준비중 — 엑클로드 발주확인(prepare) 전
    return {
      status: 'PAYED',
      placeOrderStatus: 'NOT_YET',
      statusLabel,
      hubEligible: false,
      claimLabel: '',
      mallOrderStatusCode: code,
    };
  }
  if (code === 'N20' || code === 'N21' || code === 'N22') {
    return {
      status: 'PAYED',
      placeOrderStatus: 'OK',
      statusLabel,
      hubEligible: code !== 'N22',
      claimLabel: '',
      mallOrderStatusCode: code,
    };
  }
  if (code === 'N30') {
    return {
      status: 'DELIVERING',
      placeOrderStatus: 'OK',
      statusLabel,
      hubEligible: false,
      claimLabel: '',
      mallOrderStatusCode: code,
    };
  }
  if (code === 'N40') {
    return {
      status: 'DELIVERED',
      placeOrderStatus: 'OK',
      statusLabel,
      hubEligible: false,
      claimLabel: '',
      mallOrderStatusCode: code,
    };
  }
  if (code === 'N50') {
    return {
      status: 'PURCHASE_DECIDED',
      placeOrderStatus: 'OK',
      statusLabel,
      hubEligible: false,
      claimLabel: '',
      mallOrderStatusCode: code,
    };
  }
  return {
    status: 'UNKNOWN',
    placeOrderStatus: 'UNKNOWN',
    statusLabel: statusLabel || EXCLOAD_ORDER_STATUS_LABEL.UNKNOWN,
    hubEligible: false,
    claimLabel: '',
    mallOrderStatusCode: code,
  };
}

export function mapCafe24OrdersToFetchViews(orders: Cafe24Order[]): OrderFetchView[] {
  return flattenCafe24Orders(orders).map((entry, rowIndex) => {
    const lineStatus = resolveCafe24LineOrderStatus(entry.order, entry.item);
    const mapped = mapCafe24Status(lineStatus);
    const row = mapCafe24OrderRowToStandardRow(entry);
    const address = [row['받는사람주소1'], row['받는사람주소2']].filter(Boolean).join(' ').trim();
    return {
      rowIndex,
      status: mapped.status,
      statusLabel: mapped.statusLabel || row['주문상태'],
      placeOrderStatus: mapped.placeOrderStatus,
      orderNo: row['주문번호'],
      productOrderNo: row['상품주문번호'] || row['주문번호'],
      paidAt: row['결제일시'],
      orderedAt: row['주문일시'],
      productName: row['상품명'],
      productOption: row['상품옵션'],
      quantity: row['수량'] || '1',
      receiverName: row['받는사람'],
      paymentAmount: row['결제금액'],
      paymentMeans: row['결제구분'],
      hasTracking: Boolean(row['운송장번호']),
      claimLabel: mapped.claimLabel,
      mallOrderStatusCode: mapped.mallOrderStatusCode || undefined,
      hubEligible: mapped.hubEligible,
      detail: {
        ordererName: row['주문자'],
        receiverPhone: row['받는사람전화1'],
        receiverAddress: address,
        deliveryMemo: row['배송메시지'],
        sellerProductCode: row['상품코드'],
      },
    };
  });
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
