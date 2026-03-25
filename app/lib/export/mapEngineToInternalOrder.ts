/**
 * 엔진 결과를 InternalOrderFormat으로 변환하는 함수
 * 
 * 이 함수는 FinalResult를 받아 InternalOrderFormat 1행으로 변환합니다.
 * 추론/보정/판단 로직은 포함하지 않으며, 단순 매핑만 수행합니다.
 */

import type { InternalOrderFormat } from './internalOrderFormat';
import type { FinalResult } from '@/app/lib/refinement-engine/types/FinalResult';

/**
 * 엔진 결과 입력 타입
 * 
 * mapEngineResultToInternalOrder 함수에서 사용하는 엔진 결과 타입입니다.
 * 현재 엔진이 반환하는 필드 기반으로 정의되었으며, optional 필드를 허용합니다.
 */
export interface EngineResultInput {
  /** 수신자 정보 */
  recipient?: {
    /** 선택된 수신자 정보 */
    selected?: {
      /** 수신자 이름 */
      name?: string | null;
      /** 수신자 전화번호 */
      phone?: string | null;
      /** 수신자 주소 */
      address?: string | null;
    };
  };
  /** 상품 정보 배열 */
  products?: Array<{
    /** 선택된 상품 정보 */
    selected?: {
      /** 상품명 */
      name?: string;
      /** 상품 수량 */
      quantity?: number | null;
      /** 상품 옵션 (단일) */
      option?: string;
      /** 상품 옵션 (복수) */
      options?: string[];
      /** 요청 메시지 배열: can be simple strings or RequestWithType objects from product resolvers */
      requests?: Array<string | { text: string; requestType?: string }>;
    };
  }>;
  /** 전체 수량 */
  quantity?: number | null;
  /** 옵션 정보 */
  option?: {
    /** 선택된 옵션 값 */
    selected?: string;
  };
}

/**
 * 엔진 결과 객체를 InternalOrderFormat 1행으로 변환하는 순수 함수
 * 
 * @param engineResult - 엔진 처리 결과 객체 (EngineResultInput)
 * @returns InternalOrderFormat 객체 (값이 없으면 null)
 */
export function mapEngineResultToInternalOrder(
  engineResult: EngineResultInput
): InternalOrderFormat {
  // 기본 값: 29개 기준헤더 모두 빈 문자열로 초기화
  const base: InternalOrderFormat = {
    주문번호: '',
    보내는사람: '',
    보내는사람전화1: '',
    보내는사람전화2: '',
    보내는사람우편번호: '',
    보내는사람주소1: '',
    보내는사람주소2: '',
    받는사람: '',
    받는사람전화1: '',
    받는사람전화2: '',
    받는사람우편번호: '',
    받는사람주소1: '',
    받는사람주소2: '',
    주문자: '',
    주문자연락처: '',
    주문일시: '',
    결제금액: '',
    상품명: '',
    추가상품: '',
    상품옵션: '',
    상품옵션1: '',
    수량: '',
    배송메시지: '',
    운임구분: '',
    운임: '',
    운송장번호: '',
    창고메모: '',
    내부메모: '',
    출고번호: '',
  };

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
