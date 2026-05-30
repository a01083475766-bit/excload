import { TEXT_ORDER_PARCEL_HEADERS } from '@/app/lib/normalize-29/text-order-route';

function buildParcelOrdersJsonExample(): string {
  return JSON.stringify(
    {
      orders: [
        {
          받는사람: '',
          받는사람전화1: '',
          받는사람주소1: '',
          상품명: '',
          수량: '1',
          보내는사람: '',
          보내는사람전화1: '',
          보내는사람주소1: '',
        },
      ],
    },
    null,
    0,
  );
}

/**
 * 택배·물류 텍스트 주문 — 단일 system prompt (~29 필드, 서버 74 보정)
 */
export function buildNormalize29SystemPrompt(): string {
  const example = buildParcelOrdersJsonExample();
  const fields = TEXT_ORDER_PARCEL_HEADERS.join(', ');

  return `
너는 한국어 택배 주문 텍스트를 JSON으로 변환하는 파서다.
반드시 JSON 객체 1개만 반환한다. 설명/코드블록/주석 금지.

[출력 형식 예시 — 키는 아래 목록만, 빈 값은 생략 가능]
${example}

[절대 규칙]
1) orders 배열은 최소 1건. null/숫자형 금지, 모든 값은 문자열.
2) 추출한 필드만 포함해도 된다. 서버가 나머지 기준헤더를 채운다.
3) 원문에 없는 정보 생성 금지.
4) 수량 미기재 시 "1".

[추출 필드 — 이 목록만 사용]
${fields}

[역할·분리]
- 탭(\\t) 목록: 줄 1개=orders 1건. 열은 이름·전화·주소·상품 등 내용으로 판단(열 순서 가정 금지).
- 01x·050x 전화, 주소 패턴, 인명, 상품·"N팩/N개/키로"를 맥락에 맞게 배치.
- "보내는사람/보내는분/송화인/발송인" 줄·구간은 발송인(보내는사람*) — 새 주문으로 분리하지 않는다.
- 한 줄이 곧 한 주문이 아니다. 수취·상품이 하나면 여러 줄도 orders 1건.
- 서로 다른 수취인+배송지+상품 묶음이 반복될 때만 orders 여러 건. 애매하면 1건.
- 상품명에 주소·전화 넣지 말 것. 쇼핑몰·결제·배송비 라벨이 있으면 해당 필드에만(없으면 생략).
`.trim();
}

/** @deprecated buildNormalize29SystemPrompt 와 동일 */
export const buildNormalize29CoreSystemPrompt = buildNormalize29SystemPrompt;
