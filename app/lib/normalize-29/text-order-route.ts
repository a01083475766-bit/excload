/**
 * normalize-29 입력 분류: 단순(코어 프롬프트) vs 복잡(전체 74필드 프롬프트)
 */

export type Normalize29PromptRoute = 'core' | 'full';

/** 택배 텍스트 주문 AI core 필드 (~29). 서버가 나머지 BASE_HEADERS는 "" 로 보정 */
export const TEXT_ORDER_SIMPLE_CORE_HEADERS = [
  '주문번호',
  '보내는사람',
  '보내는사람전화1',
  '보내는사람전화2',
  '보내는사람우편번호',
  '보내는사람주소1',
  '보내는사람주소2',
  '받는사람',
  '받는사람전화1',
  '받는사람전화2',
  '받는사람우편번호',
  '받는사람주소1',
  '받는사람주소2',
  '주문자',
  '주문자연락처',
  '주문일시',
  '상품명',
  '추가상품',
  '상품옵션',
  '상품옵션1',
  '수량',
  '배송메시지',
  '상품별추가메시지',
  '주문자추가메시지',
  '운임구분',
  '운임',
  '운송장번호',
  '택배사',
  '내부메모',
] as const;

const MALL_OR_EXTENDED_MARKERS =
  /주문\s*(?:번호|ID|#)|제휴주문|상품주문번호|관리상품번호|판매상품번호|주문ID|쿠팡|네이버\s*주문|11번가|옥션|G마켓|스마트스토어|결제금액|결제구분|운임구분|주문배송비|구매확정|출고지시|센터코드|옵션코드|판매자할인|쿠폰할인|포인트|배송첨부|출고발송|택배사코드/i;

/**
 * 배송비·택배비 등 쇼핑몰 정산 라벨 (단독 "배송비 3000" 등 → full)
 * - "무료배송"은 '배송비' 부분 문자열이 아니므로 제외됨
 * - 주소 "제주특별자치도" 오탐 방지: bare "제주"는 쓰지 않고 제주+배송비 패턴만
 */
const SHIPPING_FEE_LABEL_MARKERS =
  /(?:^|[\s\t,，|])배송비(?:\s*[:：]?\s*\d|\s+\d|[\d])|(?:^|[\s\t,，|])택배비(?:\s*[:：]?\s*\d|\s+\d|\s|$|[\d])|(?:^|[\s\t,，|])운송비(?:\s*[:：]?\s*\d|\s+\d|\s|$|[\d])|추가배송비|도서산간|제주\s*배송비|제주배송비/i;

/** @internal 테스트·디버그용 */
export function hasShippingFeeFullTrigger(text: string): boolean {
  return SHIPPING_FEE_LABEL_MARKERS.test(text);
}

function hasMallOrExtendedFullTrigger(text: string): boolean {
  return MALL_OR_EXTENDED_MARKERS.test(text) || SHIPPING_FEE_LABEL_MARKERS.test(text);
}

function countKoreanMobilePhones(text: string): number {
  const re = /01[016789](?:[-\s]?\d{3,4}[-\s]?\d{4}|\d{8})/g;
  return [...text.matchAll(re)].length;
}

function looksLikeUniformTabOrderList(lines: string[]): boolean {
  if (lines.length < 2) return false;
  const tabCounts = lines.map((line) => (line.match(/\t/g) ?? []).length);
  const minTabs = Math.min(...tabCounts);
  const maxTabs = Math.max(...tabCounts);
  return minTabs >= 2 && maxTabs - minTabs <= 1;
}

/**
 * 단순 → core(짧은 프롬프트·빠른 응답), 애매·쇼핑몰·대량 → full(기존 전체 규칙)
 */
export function classifyNormalize29PromptRoute(text: string): Normalize29PromptRoute {
  const trimmed = text.trim();
  if (!trimmed) return 'core';

  if (trimmed.length > 2500) return 'full';
  if (hasMallOrExtendedFullTrigger(trimmed)) return 'full';

  const phoneCount = countKoreanMobilePhones(trimmed);
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const uniformTabList = looksLikeUniformTabOrderList(lines);

  if (phoneCount >= 6 && !uniformTabList) return 'full';
  if (lines.length >= 12 && phoneCount >= 4 && !uniformTabList) return 'full';

  const blocks = trimmed.split(/\n\s*\n/).filter((block) => block.trim().length > 0);
  if (blocks.length >= 3 && phoneCount >= 2 && !uniformTabList) return 'full';

  const maxTabs = lines.reduce(
    (max, line) => Math.max(max, (line.match(/\t/g) ?? []).length),
    0,
  );
  if (maxTabs >= 8) return 'full';

  return 'core';
}
