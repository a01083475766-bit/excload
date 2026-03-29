/**
 * 엔진 결과를 InternalOrderFormat으로 변환하는 함수
 *
 * 이 함수는 FinalResult를 받아 InternalOrderFormat 1행으로 변환합니다.
 */

import type { InternalOrderFormat } from './internalOrderFormat';
import { createEmptyBaseHeaderRow } from '@/app/pipeline/base/base-headers';

/** 엔진 입력 타입 (기존과 동일) */
export type EngineResultInput = {
  recipient?: {
    selected?: {
      name?: string;
      phone?: string;
      address?: string;
    };
  };
  products?: Array<{
    selected?: {
      name?: string;
      option?: string;
      options?: string[];
      quantity?: number | string | null;
      requests?: Array<{ text?: string } | string>;
    };
  }>;
  quantity?: number | string | null;
  option?: { selected?: string };
};

/**
 * 엔진 결과 객체를 InternalOrderFormat 1행으로 변환하는 순수 함수
 *
 * @param engineResult - 엔진 처리 결과 객체 (EngineResultInput)
 * @returns InternalOrderFormat 객체 (값이 없으면 null)
 */
export function mapEngineResultToInternalOrder(
  engineResult: EngineResultInput
): InternalOrderFormat {
  const base = createEmptyBaseHeaderRow();

  // 수신자 정보 (recipient에서 추출, sender는 사용하지 않음)
  const recipient = engineResult.recipient?.selected;
  const 받는사람 = recipient?.name ?? '';
  const 받는사람전화1 = recipient?.phone ?? '';
  const 받는사람주소1 = recipient?.address ?? '';

  // 상품 정보 (첫 번째 상품 사용)
  const firstProduct = engineResult.products?.[0]?.selected;
  const 상품명 = firstProduct?.name ?? '';
  const 상품옵션 =
    firstProduct?.option ?? (firstProduct?.options ? firstProduct.options.join(', ') : '');

  // 수량 (product의 quantity 우선, 없으면 engineResult의 quantity) → 문자열 기준헤더로 변환
  const quantityValue = firstProduct?.quantity ?? engineResult.quantity ?? null;
  const 수량 =
    quantityValue === null || quantityValue === undefined ? '' : String(quantityValue);

  // 요청 메시지 (option 또는 product의 requests)를 배송메시지에 매핑
  const requestTexts =
    firstProduct?.requests?.map((req) =>
      typeof req === 'string' ? req : req.text,
    ) ?? [];
  const 배송메시지Source =
    engineResult.option?.selected ??
    (requestTexts.length > 0 ? requestTexts.join(', ') : '');
  const 배송메시지 = 배송메시지Source ?? '';

  return {
    ...base,
    받는사람,
    받는사람전화1,
    받는사람주소1,
    상품명,
    상품옵션,
    수량,
    배송메시지,
  };
}
