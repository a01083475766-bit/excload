import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import { createEmptyBaseHeaderRow, type BaseHeaderRow } from '@/app/pipeline/base/base-headers';
import type { OrderStandardFile, StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import type { CoupangMoney, CoupangOrderItem, CoupangOrderSheet } from '@/app/lib/coupang/client';
import type { OrderFetchView } from '@/app/lib/order-integration/order-fetch-view';
import {
  EXCLOAD_ORDER_STATUS_LABEL,
  type ExcloadPlaceOrderStatus,
} from '@/app/lib/order-integration/order-status';

const COUPANG_STATUS_LABEL: Record<string, string> = {
  ACCEPT: '결제완료',
  INSTRUCT: '상품준비중',
  DEPARTURE: '배송지시',
  DELIVERING: '배송중',
  FINAL_DELIVERY: '배송완료',
  NONE_TRACKING: '업체직송',
};

export const COUPANG_PREVIEW_HEADERS = [
  '주문번호',
  '묶음배송번호',
  '주문상태',
  '받는사람',
  '받는사람전화1',
  '받는사람주소1',
  '상품명',
  '수량',
  '결제일시',
  '배송메시지',
] as const;

export type CoupangPreviewRow = Record<(typeof COUPANG_PREVIEW_HEADERS)[number], string>;

function formatCoupangMoney(money?: CoupangMoney): string {
  if (!money) return '';
  const units = money.units ?? 0;
  const nanos = money.nanos ?? 0;
  if (!nanos) return String(units);
  const fraction = String(Math.abs(nanos)).padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${units}.${fraction}` : String(units);
}

function normalizePhone(value?: string | null): string {
  if (!value) return '';
  return value.replace(/[^\d+]/g, '').replace(/^\+82/, '0');
}

function pickReceiverPhone(receiver?: CoupangOrderSheet['receiver']): string {
  return normalizePhone(receiver?.receiverNumber || receiver?.safeNumber || '');
}

function pickOrdererPhone(orderer?: CoupangOrderSheet['orderer']): string {
  return normalizePhone(orderer?.ordererNumber || orderer?.safeNumber || '');
}

function mapStatusLabel(status?: string): string {
  if (!status) return '';
  return COUPANG_STATUS_LABEL[status] ?? status;
}

/** 쿠팡 API status → 공통 발주 상태 (ACCEPT=미확인, INSTRUCT=확인·발송대기). */
export function normalizeCoupangPlaceOrderStatus(rawStatus?: string | null): ExcloadPlaceOrderStatus {
  switch ((rawStatus ?? '').trim().toUpperCase()) {
    case 'ACCEPT':
      return 'NOT_YET';
    case 'INSTRUCT':
      return 'OK';
    default:
      return 'UNKNOWN';
  }
}

function normalizeCoupangOrderStatus(rawStatus?: string | null): OrderFetchView['status'] {
  switch ((rawStatus ?? '').trim().toUpperCase()) {
    case 'ACCEPT':
    case 'INSTRUCT':
      return 'PAYED';
    case 'DEPARTURE':
    case 'DELIVERING':
      return 'DELIVERING';
    case 'FINAL_DELIVERY':
      return 'DELIVERED';
    case 'NONE_TRACKING':
      return 'DELIVERING';
    default:
      return 'UNKNOWN';
  }
}

function isCoupangHubEligible(rawStatus?: string | null): boolean {
  return (rawStatus ?? '').trim().toUpperCase() === 'INSTRUCT';
}

function buildProductName(item: CoupangOrderItem): string {
  return (
    item.sellerProductName ||
    item.vendorItemName ||
    item.sellerProductItemName ||
    ''
  ).trim();
}

function buildOptionName(item: CoupangOrderItem): string {
  return (item.sellerProductItemName || item.vendorItemName || '').trim();
}

function effectiveShippingCount(item: CoupangOrderItem): number {
  const shippingCount = item.shippingCount ?? 0;
  return shippingCount > 0 ? shippingCount : 1;
}

export function mapCoupangOrderItemToStandardRow(
  sheet: CoupangOrderSheet,
  item: CoupangOrderItem,
): BaseHeaderRow {
  const row = createEmptyBaseHeaderRow();

  row['주문번호'] = sheet.orderId != null ? String(sheet.orderId) : '';
  row['묶음배송번호'] = sheet.shipmentBoxId != null ? String(sheet.shipmentBoxId) : '';
  row['주문상태'] = mapStatusLabel(sheet.status);
  row['주문일시'] = sheet.orderedAt ?? '';
  row['결제일시'] = sheet.paidAt ?? '';
  row['주문자'] = sheet.orderer?.name ?? '';
  row['주문자연락처'] = pickOrdererPhone(sheet.orderer);
  row['주문자이메일'] = sheet.orderer?.email ?? '';
  row['받는사람'] = sheet.receiver?.name ?? '';
  row['받는사람전화1'] = pickReceiverPhone(sheet.receiver);
  row['받는사람우편번호'] = sheet.receiver?.postCode ?? '';
  row['받는사람주소1'] = sheet.receiver?.addr1 ?? '';
  row['받는사람주소2'] = sheet.receiver?.addr2 ?? '';
  row['배송메시지'] = sheet.parcelPrintMessage ?? '';
  row['상품명'] = buildProductName(item);
  row['등록상품명'] = item.sellerProductName ?? '';
  row['등록옵션명'] = item.sellerProductItemName ?? '';
  row['상품옵션'] = buildOptionName(item);
  row['노출상품ID'] = item.productId != null ? String(item.productId) : '';
  row['옵션ID'] = item.vendorItemId != null ? String(item.vendorItemId) : '';
  row['수량'] = String(effectiveShippingCount(item));
  row['옵션판매가'] = formatCoupangMoney(item.salesPrice);
  row['결제금액'] = formatCoupangMoney(item.orderPrice);
  row['판매처'] = '쿠팡';
  row['택배사'] = '';

  return row;
}

export function mapCoupangOrderSheetToStandardRows(sheet: CoupangOrderSheet): BaseHeaderRow[] {
  const items = (sheet.orderItems ?? []).filter((item) => !item.canceled);
  if (!items.length) {
    return [mapCoupangOrderItemToStandardRow(sheet, {})];
  }
  return items.map((item) => mapCoupangOrderItemToStandardRow(sheet, item));
}

export function mapCoupangOrdersToOrderStandardFile(orders: CoupangOrderSheet[]): OrderStandardFile {
  const rows: StandardOrderRow[] = mapCoupangOrdersToStandardRows(orders).map((row) => ({ ...row }));
  return {
    baseHeaders: BASE_HEADERS,
    rows,
    unknownHeaders: [],
  };
}

export function mapCoupangOrdersToStandardRows(orders: CoupangOrderSheet[]): BaseHeaderRow[] {
  return orders.flatMap((sheet) => mapCoupangOrderSheetToStandardRows(sheet));
}

export function mapCoupangOrdersToPreviewRows(orders: CoupangOrderSheet[]): CoupangPreviewRow[] {
  return mapCoupangOrdersToStandardRows(orders).map((row) => ({
    주문번호: row['주문번호'],
    묶음배송번호: row['묶음배송번호'],
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

/**
 * 주문조회 UI 표시용 뷰. 표준행과 동일한 순서(index)로 정렬된다.
 */
export function mapCoupangOrdersToFetchViews(orders: CoupangOrderSheet[]): OrderFetchView[] {
  const rows = mapCoupangOrdersToStandardRows(orders);
  return rows.map((row, rowIndex) => {
    const sheetIndex = orders.findIndex(
      (sheet) => String(sheet.shipmentBoxId ?? '') === String(row['묶음배송번호'] ?? ''),
    );
    const sheet = sheetIndex >= 0 ? orders[sheetIndex] : undefined;
    const rawStatus = sheet?.status ?? '';
    const status = normalizeCoupangOrderStatus(rawStatus);
    const placeOrderStatus = normalizeCoupangPlaceOrderStatus(rawStatus);
    const address = [row['받는사람주소1'], row['받는사람주소2']].filter(Boolean).join(' ').trim();
    const tracking = String(row['운송장번호'] ?? '').trim();

    return {
      rowIndex,
      status,
      statusLabel: row['주문상태'] || EXCLOAD_ORDER_STATUS_LABEL[status],
      placeOrderStatus,
      orderNo: row['주문번호'],
      productOrderNo: row['상품주문번호'] || row['묶음배송번호'] || row['주문번호'],
      paidAt: row['결제일시'],
      orderedAt: row['주문일시'],
      productName: row['상품명'],
      productOption: row['상품옵션'],
      quantity: row['수량'] || '1',
      receiverName: row['받는사람'],
      paymentAmount: row['결제금액'],
      paymentMeans: row['결제구분'],
      hasTracking: Boolean(tracking),
      claimLabel: '',
      shipmentBoxId: row['묶음배송번호'] || undefined,
      mallOrderStatusCode: rawStatus || undefined,
      hubEligible: isCoupangHubEligible(rawStatus),
      detail: {
        ordererName: row['주문자'],
        receiverPhone: row['받는사람전화1'],
        receiverAddress: address,
        deliveryMemo: row['배송메시지'],
        sellerProductCode: row['옵션ID'] || row['노출상품ID'],
      },
    };
  });
}
