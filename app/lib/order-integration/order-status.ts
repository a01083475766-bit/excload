/**
 * 엑클로드 공통 주문 상태 정규화 (쇼핑몰 원본 코드 → 공통 상태).
 * UI에는 쇼핑몰 원본 코드를 그대로 노출하지 않고 이 공통 상태를 사용한다.
 * 순수 함수 모듈 — API/DB/네트워크 의존성 없음.
 */

export type ExcloadOrderStatus =
  | 'PAYMENT_WAITING'
  | 'PAYED'
  | 'DELIVERING'
  | 'DELIVERED'
  | 'PURCHASE_DECIDED'
  | 'CANCELED'
  | 'RETURNED'
  | 'EXCHANGED'
  | 'UNKNOWN';

export const EXCLOAD_ORDER_STATUS_LABEL: Record<ExcloadOrderStatus, string> = {
  PAYMENT_WAITING: '결제대기',
  PAYED: '결제완료',
  DELIVERING: '배송중',
  DELIVERED: '배송완료',
  PURCHASE_DECIDED: '구매확정',
  CANCELED: '취소',
  RETURNED: '반품',
  EXCHANGED: '교환',
  UNKNOWN: '기타',
};

/** 발주확인 상태 (스마트스토어 placeOrderStatus 등). */
export type ExcloadPlaceOrderStatus = 'NOT_YET' | 'OK' | 'UNKNOWN';

/** 검색 조건의 '작업 대상' 카테고리. */
export type OrderWorkTarget =
  | 'SHIPMENT_TARGET'
  | 'NEW_PAID'
  | 'PLACE_ORDER_NOT_YET'
  | 'PLACE_ORDER_WAITING'
  | 'DELIVERING'
  | 'DELIVERED'
  | 'CLAIM'
  | 'ALL';

export const ORDER_WORK_TARGET_LABEL: Record<OrderWorkTarget, string> = {
  SHIPMENT_TARGET: '송장 처리 대상',
  NEW_PAID: '신규 결제완료',
  PLACE_ORDER_NOT_YET: '발주 미확인',
  PLACE_ORDER_WAITING: '발주 확인·발송 대기',
  DELIVERING: '배송 중',
  DELIVERED: '배송 완료·구매확정',
  CLAIM: '취소·반품·교환',
  ALL: '전체 주문',
};

/** 검색 UI에 노출할 작업 대상 순서 (송장 처리 대상이 기본·최상단). */
export const ORDER_WORK_TARGET_ORDER: OrderWorkTarget[] = [
  'SHIPMENT_TARGET',
  'NEW_PAID',
  'PLACE_ORDER_NOT_YET',
  'PLACE_ORDER_WAITING',
  'DELIVERING',
  'DELIVERED',
  'CLAIM',
  'ALL',
];

/** 스마트스토어 productOrderStatus → 공통 상태. */
export function normalizeSmartstoreOrderStatus(raw?: string | null): ExcloadOrderStatus {
  switch ((raw ?? '').trim().toUpperCase()) {
    case 'PAYMENT_WAITING':
      return 'PAYMENT_WAITING';
    case 'PAYED':
      return 'PAYED';
    case 'DELIVERING':
      return 'DELIVERING';
    case 'DELIVERED':
      return 'DELIVERED';
    case 'PURCHASE_DECIDED':
      return 'PURCHASE_DECIDED';
    case 'CANCELED':
    case 'CANCELED_BY_NOPAYMENT':
      return 'CANCELED';
    case 'RETURNED':
      return 'RETURNED';
    case 'EXCHANGED':
      return 'EXCHANGED';
    default:
      return 'UNKNOWN';
  }
}

/** 스마트스토어 placeOrderStatus → 공통 발주 상태. */
export function normalizeSmartstorePlaceOrderStatus(raw?: string | null): ExcloadPlaceOrderStatus {
  switch ((raw ?? '').trim().toUpperCase()) {
    case 'OK':
      return 'OK';
    case 'NOT_YET':
      return 'NOT_YET';
    default:
      return 'UNKNOWN';
  }
}

/** 이미 한글 라벨(결제완료 등)만 있는 몰용 폴백 정규화. */
export function normalizeOrderStatusFromKoreanLabel(label?: string | null): ExcloadOrderStatus {
  const value = (label ?? '').trim();
  if (!value) return 'UNKNOWN';
  if (value.includes('결제대기') || value.includes('입금대기')) return 'PAYMENT_WAITING';
  if (value.includes('구매확정')) return 'PURCHASE_DECIDED';
  if (value.includes('배송완료')) return 'DELIVERED';
  if (value.includes('배송중') || value.includes('배송 중')) return 'DELIVERING';
  if (value.includes('취소')) return 'CANCELED';
  if (value.includes('반품')) return 'RETURNED';
  if (value.includes('교환')) return 'EXCHANGED';
  if (value.includes('결제완료') || value.includes('발송대기') || value.includes('신규주문')) return 'PAYED';
  // 11번가 발주확인 후(배송준비중)도 송장 처리 대상
  if (value.includes('배송준비') || value.includes('상품준비') || value.includes('발주확인')) return 'PAYED';
  return 'UNKNOWN';
}

export function isClaimStatus(status: ExcloadOrderStatus): boolean {
  return status === 'CANCELED' || status === 'RETURNED' || status === 'EXCHANGED';
}

export type OrderStatusView = {
  status: ExcloadOrderStatus;
  placeOrderStatus?: ExcloadPlaceOrderStatus;
  /**
   * API 호출 시점 잔여 수량. 부분 클레임 후 남은 수량.
   * 미지정(undefined)이면 수량 정보가 없는 몰로 보고 수량 조건은 통과시킨다.
   */
  remainQuantity?: number;
};

/**
 * 송장 처리 대상 판정.
 * - 결제완료(PAYED, 발송 가능 상태) 이면서
 * - 아직 발송(배송중/완료)·구매확정·취소·반품·교환 완료 상태가 아니고
 * - 잔여 수량이 1 이상 (전체 취소·반품으로 남은 수량이 0이면 제외)
 *
 * 부분 클레임(claimType 존재)만으로 주문 전체를 제외하지 않는다.
 * 예) 최초 3개 중 1개 취소 → remain 2, status PAYED → 남은 2개는 발송 대상.
 */
export function isShipmentTarget(view: OrderStatusView): boolean {
  if (view.status !== 'PAYED') return false;
  if (view.remainQuantity != null && view.remainQuantity <= 0) return false;
  return true;
}

/** 작업 대상 카테고리 매칭 (검색 필터용). */
export function matchesWorkTarget(target: OrderWorkTarget, view: OrderStatusView): boolean {
  switch (target) {
    case 'ALL':
      return true;
    case 'SHIPMENT_TARGET':
      return isShipmentTarget(view);
    case 'NEW_PAID':
      return view.status === 'PAYED';
    case 'PLACE_ORDER_NOT_YET':
      return view.status === 'PAYED' && view.placeOrderStatus === 'NOT_YET';
    case 'PLACE_ORDER_WAITING':
      return view.status === 'PAYED' && view.placeOrderStatus === 'OK';
    case 'DELIVERING':
      return view.status === 'DELIVERING';
    case 'DELIVERED':
      return view.status === 'DELIVERED' || view.status === 'PURCHASE_DECIDED';
    case 'CLAIM':
      return isClaimStatus(view.status);
    default:
      return false;
  }
}

/**
 * 발주 관련 보조문구는 결제완료(PAYED)일 때만 노출한다.
 * 배송중·배송완료·구매확정·클레임 등에서는 placeOrderStatus와 무관하게 숨긴다.
 */
export function resolvePlaceOrderSecondaryHint(
  view: OrderStatusView,
): 'NOT_YET' | 'OK' | null {
  if (view.status !== 'PAYED') return null;
  if (view.placeOrderStatus === 'NOT_YET') return 'NOT_YET';
  if (view.placeOrderStatus === 'OK') return 'OK';
  return null;
}

const INVOICE_MISSING_AFTER_SHIP_TITLE =
  '주문은 배송 이후 상태이지만, 쇼핑몰 조회 결과에 송장번호가 없습니다. 직접배송·방문수령 등의 주문일 수 있습니다.';

export type InvoiceInfoDisplay = {
  text: string;
  title?: string;
};

/**
 * 주문조회 표의 「송장 정보」열 문구.
 * 송장번호 원문은 사용하지 않고 hasTracking boolean만 본다.
 */
export function resolveInvoiceInfoDisplay(input: {
  hasTracking: boolean;
  status: ExcloadOrderStatus;
}): InvoiceInfoDisplay {
  if (input.hasTracking) return { text: '등록됨' };
  if (input.status === 'PAYED') return { text: '미등록' };
  if (
    input.status === 'DELIVERING' ||
    input.status === 'DELIVERED' ||
    input.status === 'PURCHASE_DECIDED'
  ) {
    return { text: '송장번호 없음', title: INVOICE_MISSING_AFTER_SHIP_TITLE };
  }
  // 그 밖(취소·반품 등): 기존과 동일하게 미등록
  return { text: '미등록' };
}
