/**
 * 주문조회 화면 표시용 뷰 모델.
 * 택배 업로드 표준행(StandardOrderRow)과 index로 1:1 정렬된다.
 * - 목록 열: 개인정보 최소 노출
 * - detail(행 상세): 연락처·주소 등은 펼쳤을 때만 노출
 */
import {
  type ExcloadOrderStatus,
  type ExcloadPlaceOrderStatus,
  EXCLOAD_ORDER_STATUS_LABEL,
  normalizeOrderStatusFromKoreanLabel,
} from '@/app/lib/order-integration/order-status';

export type OrderFetchView = {
  /** 해당 몰 표준행 배열에서의 index (선택 → 표준행 역참조용). */
  rowIndex: number;
  status: ExcloadOrderStatus;
  statusLabel: string;
  placeOrderStatus: ExcloadPlaceOrderStatus;
  orderNo: string;
  productOrderNo: string;
  paidAt: string;
  orderedAt: string;
  productName: string;
  productOption: string;
  /** 처리(발송 대상) 수량 = remain → quantity → initial. */
  quantity: string;
  /** API 호출 시점 잔여 수량(송장 대상 판정용). 미지정 시 수량 조건 통과. */
  remainQuantity?: number;
  /** 주문 시점 수량(부분 클레임 표시용). */
  initialQuantity?: number;
  receiverName: string;
  paymentAmount: string;
  paymentMeans: string;
  hasTracking: boolean;
  claimLabel: string;
  /** 행 상세(펼침) 전용 — 개인정보. */
  detail: {
    ordererName: string;
    receiverPhone: string;
    receiverAddress: string;
    deliveryMemo: string;
    sellerProductCode: string;
  };
};

function str(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return value == null ? '' : String(value);
}

/**
 * 스마트스토어 전용 뷰가 없는 몰용 폴백.
 * 표준행의 한글 상태 라벨을 공통 상태로 되돌려 최소한의 정규화를 제공한다.
 */
export function buildOrderFetchViewFromStandardRow(
  row: Record<string, unknown>,
  rowIndex: number,
): OrderFetchView {
  const status = normalizeOrderStatusFromKoreanLabel(str(row, '주문상태'));
  const address = [str(row, '받는사람주소1'), str(row, '받는사람주소2')]
    .filter(Boolean)
    .join(' ')
    .trim();
  const tracking = str(row, '운송장번호');
  return {
    rowIndex,
    status,
    statusLabel: str(row, '주문상태') || EXCLOAD_ORDER_STATUS_LABEL[status],
    placeOrderStatus: 'UNKNOWN',
    orderNo: str(row, '주문번호'),
    productOrderNo: str(row, '상품주문번호') || str(row, '주문번호'),
    paidAt: str(row, '결제일시'),
    orderedAt: str(row, '주문일시'),
    productName: str(row, '상품명'),
    productOption: str(row, '상품옵션'),
    quantity: str(row, '수량') || '1',
    receiverName: str(row, '받는사람'),
    paymentAmount: str(row, '결제금액'),
    paymentMeans: str(row, '결제구분'),
    hasTracking: Boolean(tracking),
    claimLabel: '',
    detail: {
      ordererName: str(row, '주문자'),
      receiverPhone: str(row, '받는사람전화1'),
      receiverAddress: address,
      deliveryMemo: str(row, '배송메시지'),
      sellerProductCode: str(row, '상품코드'),
    },
  };
}

export function buildOrderFetchViewsFromStandardRows(
  rows: ReadonlyArray<Record<string, unknown>>,
): OrderFetchView[] {
  return rows.map((row, index) => buildOrderFetchViewFromStandardRow(row, index));
}
