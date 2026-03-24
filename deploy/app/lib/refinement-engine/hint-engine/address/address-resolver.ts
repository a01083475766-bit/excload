/**
 * Address resolver
 * Calculates address score and determines status based on simplified scoring logic
 * 
 * 규칙:
 * ① 최고행정구역(anchor) 존재 필수
 * ② anchor 뒤에 시/군/구·동/읍/면·로/길·번지 중 하나라도 이어지는 주소 흐름이 있으면 주소 후보 유지
 * ③ END(번지/도로명 숫자) 존재 시 score=100, 없으면 score=0
 * ④ anchor 존재 + score>=100인 경우만 CONFIRMED, 그 외는 WARNING로 유지하며 가산점은 점수 계산에 절대 반영하지 말 것
 */

export interface AddressResolverInput {
  /** 최고 행정구역(anchor) 존재 여부 */
  hasAnchor: boolean;
  /** anchor 뒤에 주소 흐름(시/군/구·동/읍/면·로/길·번지) 존재 여부 */
  hasAddressFlow: boolean;
  /** END(번지/도로명 숫자) 존재 여부 */
  hasEnd: boolean;
}

export interface AddressResolverResult {
  /** 최종 점수 */
  finalScore: number;
  /** 상태 (CONFIRMED 또는 WARNING) */
  status: 'CONFIRMED' | 'WARNING';
  /** 실패 이유 (WARNING인 경우) */
  failureReason?: 'ADDRESS_NOT_CONFIRMED_CONDITION_FAILED';
}

/**
 * 주소 점수를 계산하고 status를 결정합니다.
 * 
 * @param input - AddressResolverInput
 * @returns AddressResolverResult
 */
export function resolveAddressScore(input: AddressResolverInput): AddressResolverResult {
  // ① 최고행정구역(anchor) 존재 필수
  if (!input.hasAnchor) {
    return {
      finalScore: 0,
      status: 'WARNING',
      failureReason: 'ADDRESS_NOT_CONFIRMED_CONDITION_FAILED',
    };
  }

  // ② anchor 뒤에 시/군/구·동/읍/면·로/길·번지 중 하나라도 이어지는 주소 흐름이 있으면 주소 후보 유지
  // 주소 흐름이 없으면 후보 유지하지 않음 (WARNING)
  if (!input.hasAddressFlow) {
    return {
      finalScore: 0,
      status: 'WARNING',
      failureReason: 'ADDRESS_NOT_CONFIRMED_CONDITION_FAILED',
    };
  }

  // ③ END(번지/도로명 숫자) 존재 시 score=100, 없으면 score=0
  // 가산점은 점수 계산에 절대 반영하지 않음
  const finalScore = input.hasEnd ? 100 : 0;

  // ④ anchor 존재 + score>=100인 경우만 CONFIRMED, 그 외는 WARNING로 유지
  let status: 'CONFIRMED' | 'WARNING' = 'WARNING';
  let failureReason: 'ADDRESS_NOT_CONFIRMED_CONDITION_FAILED' | undefined = undefined;

  if (input.hasAnchor && finalScore >= 100) {
    status = 'CONFIRMED';
  } else {
    status = 'WARNING';
    failureReason = 'ADDRESS_NOT_CONFIRMED_CONDITION_FAILED';
  }

  return {
    finalScore,
    status,
    failureReason,
  };
}

