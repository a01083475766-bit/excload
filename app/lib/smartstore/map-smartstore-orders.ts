import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import { createEmptyBaseHeaderRow, type BaseHeaderRow } from '@/app/pipeline/base/base-headers';
import type { OrderStandardFile, StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import type { SmartstoreProductOrderDetail } from '@/app/lib/smartstore/client';
import type { OrderFetchView } from '@/app/lib/order-integration/order-fetch-view';
import {
  EXCLOAD_ORDER_STATUS_LABEL,
  normalizeSmartstoreOrderStatus,
  normalizeSmartstorePlaceOrderStatus,
} from '@/app/lib/order-integration/order-status';

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

/**
 * 결제 금액 선택: 네이버 수량 클레임 확대 이후 폐기 예정인 totalPaymentAmount 대신
 * remain(호출 시점) → initial(주문 시점) → total(레거시) 순으로 사용한다.
 */
function pickPaymentAmount(productOrder: NonNullable<SmartstoreProductOrderDetail['productOrder']>): string {
  const amount =
    productOrder.remainPaymentAmount ??
    productOrder.initialPaymentAmount ??
    productOrder.totalPaymentAmount;
  return amount != null ? String(amount) : '';
}

/**
 * 처리(발송 대상) 수량 선택: remain(호출 시점 잔여) → quantity(레거시) → initial(주문 시점) 순.
 * 부분 클레임 후 실제 발송해야 하는 수량을 반영한다.
 */
function pickProcessingQuantity(
  productOrder: NonNullable<SmartstoreProductOrderDetail['productOrder']>,
): number {
  const quantity =
    productOrder.remainQuantity ?? productOrder.quantity ?? productOrder.initialQuantity;
  return quantity != null ? quantity : 1;
}

const SMARTSTORE_CLAIM_TYPE_LABEL: Record<string, string> = {
  CANCEL: '취소',
  RETURN: '반품',
  EXCHANGE: '교환',
};

function claimLabelOf(
  productOrder: NonNullable<SmartstoreProductOrderDetail['productOrder']>,
): string {
  const type = (productOrder.claimType ?? '').trim().toUpperCase();
  if (!type) return '';
  return SMARTSTORE_CLAIM_TYPE_LABEL[type] ?? type;
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
  row['결제금액'] = pickPaymentAmount(productOrder);
  row['결제구분'] = order.paymentMeans ?? '';
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
  row['수량'] = String(pickProcessingQuantity(productOrder));
  row['상품코드'] = productOrder.sellerProductCode ?? '';
  row['판매처'] = '스마트스토어';

  return row;
}

/**
 * 주문조회 UI 표시용 뷰(정규화 상태·발주상태·클레임 포함).
 * 표준행 배열과 동일한 순서(index)로 정렬된다.
 */
export function mapSmartstoreOrdersToFetchViews(
  orders: SmartstoreProductOrderDetail[],
): OrderFetchView[] {
  return orders.map((detail, index) => {
    const order = detail.order ?? {};
    const productOrder = detail.productOrder ?? {};
    const shipping = productOrder.shippingAddress ?? {};
    const status = normalizeSmartstoreOrderStatus(productOrder.productOrderStatus);
    const address = [shipping.baseAddress ?? '', shipping.detailedAddress ?? '']
      .filter(Boolean)
      .join(' ')
      .trim();
    const processingQuantity = pickProcessingQuantity(productOrder);
    return {
      rowIndex: index,
      status,
      statusLabel:
        mapStatusLabel(productOrder.productOrderStatus) || EXCLOAD_ORDER_STATUS_LABEL[status],
      placeOrderStatus: normalizeSmartstorePlaceOrderStatus(productOrder.placeOrderStatus),
      orderNo: order.orderId ?? '',
      productOrderNo: productOrder.productOrderId ?? order.orderId ?? '',
      paidAt: order.paymentDate ?? '',
      orderedAt: order.orderDate ?? '',
      productName: productOrder.productName ?? '',
      productOption: productOrder.productOption ?? '',
      quantity: String(processingQuantity),
      remainQuantity: productOrder.remainQuantity ?? processingQuantity,
      initialQuantity: productOrder.initialQuantity,
      receiverName: shipping.name ?? '',
      paymentAmount: pickPaymentAmount(productOrder),
      paymentMeans: order.paymentMeans ?? '',
      hasTracking: false,
      claimLabel: claimLabelOf(productOrder),
      detail: {
        ordererName: order.ordererName ?? '',
        receiverPhone: normalizePhone(shipping.tel1 || shipping.tel2),
        receiverAddress: address,
        deliveryMemo: productOrder.shippingMemo ?? '',
        sellerProductCode: productOrder.sellerProductCode ?? '',
      },
    };
  });
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
