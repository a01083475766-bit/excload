/**
 * 주문조회 UI 확인용 더미 데이터.
 * 실제 API·DB와 무관하며, 「예시 미리보기」에서만 사용한다.
 */
import { buildOrderFetchViewsFromStandardRows } from '@/app/lib/order-integration/order-fetch-view';
import type { OrderFetchView } from '@/app/lib/order-integration/order-fetch-view';
import type { OrderIntegrationMallId } from '@/app/lib/order-integration/malls';
import type { StandardOrderRow } from '@/app/pipeline/order/order-pipeline';

export type OrderFetchDemoMallResult = {
  mallId: OrderIntegrationMallId;
  name: string;
  /** 예시용 — 실계정 없음 */
  accountId: string;
  /** 예시 미리보기 표시 */
  isExamplePreview: true;
  ok: boolean;
  message: string;
  rows: StandardOrderRow[];
  views: OrderFetchView[];
};

function demoRow(partial: Record<string, string>): StandardOrderRow {
  return { ...partial } as StandardOrderRow;
}

function withShipmentFields(views: OrderFetchView[]): OrderFetchView[] {
  return views.map((view) => ({
    ...view,
    remainQuantity: Number(view.quantity) || 1,
    initialQuantity: Number(view.quantity) || 1,
    placeOrderStatus: 'NOT_YET' as const,
  }));
}

/** 스마트스토어 2건 + 쿠팡 2건 (송장 처리 대상·결제완료). */
export function buildOrderFetchDemoResults(): OrderFetchDemoMallResult[] {
  const smartstoreRows: StandardOrderRow[] = [
    demoRow({
      주문번호: 'DEMO-SS-20260721-001',
      상품주문번호: 'DEMO-SS-PO-001',
      주문상태: '결제완료',
      주문일시: '2026-07-20 14:22:00',
      결제일시: '2026-07-20 14:22:10',
      상품명: '[예시] 스마트스토어 면티셔츠',
      상품옵션: '화이트 / L',
      상품코드: 'SS-TEE-W-L',
      수량: '1',
      받는사람: '김예시',
      받는사람전화1: '010-1000-0001',
      받는사람우편번호: '06236',
      받는사람주소1: '서울특별시 강남구 테헤란로 1',
      받는사람주소2: '101호',
      주문자: '김예시',
      배송메시지: '문 앞에 놓아주세요',
      결제금액: '19800',
      결제구분: '신용카드',
      운송장번호: '',
    }),
    demoRow({
      주문번호: 'DEMO-SS-20260721-002',
      상품주문번호: 'DEMO-SS-PO-002',
      주문상태: '결제완료',
      주문일시: '2026-07-19 09:05:00',
      결제일시: '2026-07-19 09:05:30',
      상품명: '[예시] 스마트스토어 에코백',
      상품옵션: '베이지',
      상품코드: 'SS-BAG-BE',
      수량: '2',
      받는사람: '이데모',
      받는사람전화1: '010-1000-0002',
      받는사람우편번호: '48058',
      받는사람주소1: '부산광역시 해운대구 센텀중앙로 1',
      받는사람주소2: '202호',
      주문자: '이데모',
      배송메시지: '',
      결제금액: '24000',
      결제구분: '네이버페이',
      운송장번호: '',
    }),
  ];

  const coupangRows: StandardOrderRow[] = [
    demoRow({
      주문번호: 'DEMO-CP-20260721-001',
      상품주문번호: 'DEMO-CP-PO-001',
      주문상태: '결제완료',
      주문일시: '2026-07-20 18:40:00',
      결제일시: '2026-07-20 18:40:05',
      상품명: '[예시] 쿠팡 무선이어폰',
      상품옵션: '블랙',
      상품코드: 'CP-EAR-BK',
      수량: '1',
      받는사람: '박샘플',
      받는사람전화1: '010-2000-0001',
      받는사람우편번호: '21990',
      받는사람주소1: '인천광역시 연수구 컨벤시아대로 1',
      받는사람주소2: '303호',
      주문자: '박샘플',
      배송메시지: '경비실 보관',
      결제금액: '45900',
      결제구분: '쿠페이',
      운송장번호: '',
    }),
    demoRow({
      주문번호: 'DEMO-CP-20260721-002',
      상품주문번호: 'DEMO-CP-PO-002',
      주문상태: '결제완료',
      주문일시: '2026-07-18 11:12:00',
      결제일시: '2026-07-18 11:12:20',
      상품명: '[예시] 쿠팡 주방매트',
      상품옵션: '그레이 / 중형',
      상품코드: 'CP-MAT-GR-M',
      수량: '1',
      받는사람: '최가상',
      받는사람전화1: '010-2000-0002',
      받는사람우편번호: '34126',
      받는사람주소1: '대전광역시 유성구 대학로 1',
      받는사람주소2: 'B동 1201호',
      주문자: '최가상',
      배송메시지: '벨 누르지 마세요',
      결제금액: '15900',
      결제구분: '신용카드',
      운송장번호: '',
    }),
  ];

  return [
    {
      mallId: 'smartstore',
      name: '스마트스토어',
      accountId: '',
      isExamplePreview: true,
      ok: true,
      message: '예시 2건 (실제 조회 아님)',
      rows: smartstoreRows,
      views: withShipmentFields(buildOrderFetchViewsFromStandardRows(smartstoreRows)),
    },
    {
      mallId: 'coupang',
      name: '쿠팡',
      accountId: '',
      isExamplePreview: true,
      ok: true,
      message: '예시 2건 (실제 조회 아님)',
      rows: coupangRows,
      views: withShipmentFields(buildOrderFetchViewsFromStandardRows(coupangRows)),
    },
  ];
}
