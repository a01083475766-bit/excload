/**
 * MaskRanges utility functions
 * Global rules for excluding tokens that overlap with name/phone/address/quantity entity maskRanges
 */

/**
 * Dead-State 처리된 엔티티 타입
 * Product/Option/Request 단계에서 value·token·pattern·score 접근을 전면 차단하고,
 * 엔티티 타입과 range 메타정보만 유지
 */
export type DeadStateEntityType = 'PHONE' | 'ADDRESS' | 'NAME';

/**
 * Entity type for mask ranges
 * Includes both DeadState entities and PRODUCT entity
 */
export type EntityType = DeadStateEntityType | 'PRODUCT';

/**
 * MaskRange type definition
 * Represents a range of text indices to be masked (excluded from processing)
 * Dead-State 처리된 영역은 엔티티 타입과 range 메타정보만 유지
 */
export type MaskRange = {
  startIndex: number;
  endIndex: number;
  entityType: EntityType;
};

/**
 * 통합된 maskRanges 생성
 * name/phone/address/quantity 엔티티의 모든 maskRanges를 통합하여 반환
 * Dead-State 처리된 영역은 엔티티 타입과 range 메타정보만 유지
 * 
 * @param nameMaskRanges - Name entity mask ranges
 * @param phoneMaskRanges - Phone entity mask ranges
 * @param addressMaskRanges - Address entity mask ranges
 * @param quantityMaskRanges - Quantity entity mask ranges (optional, for future extension)
 * @returns 통합된 maskRanges 배열 (entityType 포함)
 */
export function mergeMaskRanges(
  nameMaskRanges?: MaskRange[],
  phoneMaskRanges?: MaskRange[],
  addressMaskRanges?: MaskRange[],
  quantityMaskRanges?: MaskRange[]
): MaskRange[] {
  const allMaskRanges: MaskRange[] = [];
  
  if (nameMaskRanges) {
    allMaskRanges.push(...nameMaskRanges);
  }
  
  if (phoneMaskRanges) {
    allMaskRanges.push(...phoneMaskRanges);
  }
  
  if (addressMaskRanges) {
    allMaskRanges.push(...addressMaskRanges);
  }
  
  if (quantityMaskRanges) {
    allMaskRanges.push(...quantityMaskRanges);
  }
  
  return allMaskRanges;
}

/**
 * 토큰이 maskRanges와 부분적으로라도 겹치는지 확인
 * 부분 겹침 조건: 
 * - 토큰의 시작점이 maskRange 내부에 있음
 * - 토큰의 끝점이 maskRange 내부에 있음
 * - 토큰이 maskRange를 완전히 포함함
 * - maskRange가 토큰을 완전히 포함함
 * 
 * @param tokenStartIndex - 토큰의 시작 인덱스
 * @param tokenEndIndex - 토큰의 종료 인덱스 (exclusive)
 * @param maskRanges - 제외할 범위들의 배열
 * @returns 겹치면 true, 그렇지 않으면 false
 */
export function isTokenOverlappingWithMaskRanges(
  tokenStartIndex: number,
  tokenEndIndex: number,
  maskRanges: MaskRange[]
): boolean {
  for (const maskRange of maskRanges) {
    // 부분적으로라도 겹치는지 확인
    // 겹침 조건: 토큰과 maskRange가 완전히 분리되어 있지 않으면 겹침
    if (!(tokenEndIndex <= maskRange.startIndex || tokenStartIndex >= maskRange.endIndex)) {
      return true;
    }
  }
  return false;
}

/**
 * Dead-State 접근 오류 클래스
 * Dead-State 영역의 value 또는 token 접근 시 발생하는 오류
 * (read/use 지점에서만 사용)
 */
export class DeadStateAccessError extends Error {
  entityType: DeadStateEntityType;
  range?: MaskRange;

  constructor(entityType: DeadStateEntityType, property: 'value' | 'token', range?: MaskRange) {
    super(
      `INVALID: Dead-State 영역(${entityType})의 ${property} 속성에 접근할 수 없습니다. ` +
      `Dead-State 처리된 영역은 엔티티 타입과 range 메타정보(startIndex/endIndex/entityType)만 접근 가능합니다.`
    );
    this.name = 'DeadStateAccessError';
    this.entityType = entityType;
    this.range = range;
  }
}

/**
 * Dead-State 엔티티인지 확인
 * maskRanges에 Dead-State entityType이 포함되어 있는지 확인
 * 
 * @param maskRanges - 확인할 maskRanges 배열
 * @returns Dead-State 엔티티이면 true, 그렇지 않으면 false
 */
export function isDeadStateEntity(maskRanges?: MaskRange[]): boolean {
  if (!maskRanges || maskRanges.length === 0) {
    return false;
  }
  return maskRanges.some(range => 
    range.entityType === 'PHONE' || 
    range.entityType === 'ADDRESS' || 
    range.entityType === 'NAME'
  );
}

/**
 * CONFIRMED 상태의 name/phone/address EntityResult에서 maskRanges 추출
 * 차단 대상 entityType: NAME, PHONE, ADDRESS
 * 차단 대상 status: CONFIRMED (WARNING 제외)
 * 
 * ============================================================================
 * 명시적 규칙: name/phone/address 값 절대 참조 금지
 * ============================================================================
 * 규칙 1: nameResult.value, phoneResult.value, addressResult.value를 절대 참조하지 않음
 * 규칙 2: nameResult.candidates, phoneResult.candidates, addressResult.candidates를 절대 참조하지 않음
 * 규칙 3: nameResult.selected, phoneResult.selected, addressResult.selected를 절대 참조하지 않음
 * 규칙 4: 오직 hints.status와 hints.maskRanges만 접근함
 * 규칙 5: name/phone/address 값은 힌트(hint) 계산이나 점수 보정(score correction)에 절대 사용하지 않음
 * ============================================================================
 * 
 * @param nameResult - Name entity result (optional, hints.status와 hints.maskRanges만 접근)
 * @param phoneResult - Phone entity result (optional, hints.status와 hints.maskRanges만 접근)
 * @param addressResult - Address entity result (optional, hints.status와 hints.maskRanges만 접근)
 * @returns CONFIRMED 상태인 엔티티의 maskRanges 배열
 */
export function getConfirmedMaskRanges(
  nameResult?: { hints?: { status?: string; maskRanges?: MaskRange[] } },
  phoneResult?: { hints?: { status?: string; maskRanges?: MaskRange[] } },
  addressResult?: { hints?: { status?: string; maskRanges?: MaskRange[] } }
): MaskRange[] {
  const confirmedMaskRanges: MaskRange[] = [];
  
  // Collect from name entity if status is CONFIRMED
  if (nameResult?.hints?.status === 'CONFIRMED' && nameResult.hints.maskRanges) {
    confirmedMaskRanges.push(...nameResult.hints.maskRanges);
  }
  
  // Collect from phone entity if status is CONFIRMED
  if (phoneResult?.hints?.status === 'CONFIRMED' && phoneResult.hints.maskRanges) {
    confirmedMaskRanges.push(...phoneResult.hints.maskRanges);
  }
  
  // Collect from address entity if status is CONFIRMED
  if (addressResult?.hints?.status === 'CONFIRMED' && addressResult.hints.maskRanges) {
    confirmedMaskRanges.push(...addressResult.hints.maskRanges);
  }
  
  return confirmedMaskRanges;
}

/**
 * consumedText의 token이 원본 텍스트에서 NAME | PHONE | ADDRESS maskRanges와 겹치는지 확인
 * 
 * 원본 텍스트에서 token을 찾고, 그 위치가 NAME | PHONE | ADDRESS maskRanges와 겹치면 true 반환
 * 
 * @param token - 확인할 token 문자열
 * @param originalText - 원본 텍스트
 * @param maskRanges - NAME | PHONE | ADDRESS maskRanges 배열
 * @returns 겹치면 true, 그렇지 않으면 false
 */
export function isTokenOverlappingWithDeadStateRanges(
  token: string,
  originalText: string,
  maskRanges: MaskRange[]
): boolean {
  // NAME | PHONE | ADDRESS maskRanges만 필터링
  const deadStateRanges = maskRanges.filter(
    range => range.entityType === 'NAME' || range.entityType === 'PHONE' || range.entityType === 'ADDRESS'
  );
  
  if (deadStateRanges.length === 0) {
    return false;
  }
  
  // 원본 텍스트에서 token의 모든 위치 찾기
  let searchIndex = 0;
  while (true) {
    const tokenIndex = originalText.indexOf(token, searchIndex);
    if (tokenIndex === -1) {
      break;
    }
    
    const tokenEndIndex = tokenIndex + token.length;
    
    // 이 위치가 deadStateRanges와 겹치는지 확인
    if (isTokenOverlappingWithMaskRanges(tokenIndex, tokenEndIndex, deadStateRanges)) {
      return true;
    }
    
    searchIndex = tokenIndex + 1;
  }
  
  return false;
}

/**
 * FilteredText 생성 함수
 * 원본 텍스트에서 NAME/PHONE/ADDRESS maskRanges 범위를 동일 길이 공백으로 masking
 * 
 * Product 파이프 진입 직전에 사용되며, 이후 모든 Product 관련 파이프라인(C, D, E, F)은
 * 반드시 이 filteredText만 사용해야 함
 * 
 * @param originalText - 원본 텍스트
 * @param nameMaskRanges - Name entity mask ranges (optional)
 * @param phoneMaskRanges - Phone entity mask ranges (optional)
 * @param addressMaskRanges - Address entity mask ranges (optional)
 * @returns NAME/PHONE/ADDRESS 범위가 공백으로 masking된 filteredText
 */
export function createFilteredText(
  originalText: string,
  nameMaskRanges?: MaskRange[],
  phoneMaskRanges?: MaskRange[],
  addressMaskRanges?: MaskRange[]
): string {
  // masking할 범위 수집
  const maskRanges: Array<{ startIndex: number; endIndex: number }> = [];
  
  // NAME 범위 추가
  if (nameMaskRanges) {
    maskRanges.push(...nameMaskRanges.map(range => ({
      startIndex: range.startIndex,
      endIndex: range.endIndex,
    })));
  }
  
  // PHONE 범위 추가
  if (phoneMaskRanges) {
    maskRanges.push(...phoneMaskRanges.map(range => ({
      startIndex: range.startIndex,
      endIndex: range.endIndex,
    })));
  }
  
  // ADDRESS 범위 추가
  if (addressMaskRanges) {
    maskRanges.push(...addressMaskRanges.map(range => ({
      startIndex: range.startIndex,
      endIndex: range.endIndex,
    })));
  }
  
  // 범위가 없으면 원문 그대로 반환
  if (maskRanges.length === 0) {
    return originalText;
  }
  
  // 범위를 startIndex 기준으로 정렬
  maskRanges.sort((a, b) => a.startIndex - b.startIndex);
  
  // 겹치는 범위 병합
  const mergedRanges: Array<{ startIndex: number; endIndex: number }> = [];
  for (const range of maskRanges) {
    if (mergedRanges.length === 0) {
      mergedRanges.push({ ...range });
    } else {
      const lastRange = mergedRanges[mergedRanges.length - 1];
      // 겹치거나 인접한 경우 병합
      if (range.startIndex <= lastRange.endIndex) {
        lastRange.endIndex = Math.max(lastRange.endIndex, range.endIndex);
      } else {
        mergedRanges.push({ ...range });
      }
    }
  }
  
  // 원본 텍스트를 배열로 변환 (문자 단위)
  const textArray = originalText.split('');
  
  // 각 범위를 공백으로 masking
  for (const range of mergedRanges) {
    for (let i = range.startIndex; i < range.endIndex && i < textArray.length; i++) {
      textArray[i] = ' ';
    }
  }
  
  return textArray.join('');
}

/**
 * productSourceText 추출 함수
 * 원본 텍스트에서 NAME/PHONE/ADDRESS/REQUEST 범위를 제외한 텍스트를 반환
 * 
 * @param originalText - 원본 텍스트
 * @param nameMaskRanges - Name entity mask ranges (optional)
 * @param phoneMaskRanges - Phone entity mask ranges (optional)
 * @param addressMaskRanges - Address entity mask ranges (optional)
 * @param requestText - Request text (optional, 이 텍스트의 원문 위치를 제외)
 * @returns NAME/PHONE/ADDRESS/REQUEST가 제외된 productSourceText
 */
export function extractProductSourceText(
  originalText: string,
  nameMaskRanges?: MaskRange[],
  phoneMaskRanges?: MaskRange[],
  addressMaskRanges?: MaskRange[],
  requestText?: string
): string {
  // 제외할 범위 수집
  const excludeRanges: Array<{ startIndex: number; endIndex: number }> = [];
  
  // NAME 범위 추가
  if (nameMaskRanges) {
    excludeRanges.push(...nameMaskRanges.map(range => ({
      startIndex: range.startIndex,
      endIndex: range.endIndex,
    })));
  }
  
  // PHONE 범위 추가
  if (phoneMaskRanges) {
    excludeRanges.push(...phoneMaskRanges.map(range => ({
      startIndex: range.startIndex,
      endIndex: range.endIndex,
    })));
  }
  
  // ADDRESS 범위 추가
  if (addressMaskRanges) {
    excludeRanges.push(...addressMaskRanges.map(range => ({
      startIndex: range.startIndex,
      endIndex: range.endIndex,
    })));
  }
  
  // REQUEST 텍스트의 원문 위치 찾아서 제외
  if (requestText && requestText.trim().length > 0) {
    const trimmedRequestText = requestText.trim();
    let searchIndex = 0;
    while (true) {
      const index = originalText.indexOf(trimmedRequestText, searchIndex);
      if (index === -1) break;
      excludeRanges.push({
        startIndex: index,
        endIndex: index + trimmedRequestText.length,
      });
      searchIndex = index + 1;
    }
  }
  
  // 범위가 없으면 원문 그대로 반환
  if (excludeRanges.length === 0) {
    return originalText;
  }
  
  // 범위를 startIndex 기준으로 정렬
  excludeRanges.sort((a, b) => a.startIndex - b.startIndex);
  
  // 겹치는 범위 병합
  const mergedRanges: Array<{ startIndex: number; endIndex: number }> = [];
  for (const range of excludeRanges) {
    if (mergedRanges.length === 0) {
      mergedRanges.push({ ...range });
    } else {
      const lastRange = mergedRanges[mergedRanges.length - 1];
      // 겹치거나 인접한 경우 병합
      if (range.startIndex <= lastRange.endIndex) {
        lastRange.endIndex = Math.max(lastRange.endIndex, range.endIndex);
      } else {
        mergedRanges.push({ ...range });
      }
    }
  }
  
  // 제외 범위를 제거한 텍스트 생성
  let productSourceText = '';
  let lastIndex = 0;
  
  for (const range of mergedRanges) {
    // 범위 이전의 텍스트 추가
    if (range.startIndex > lastIndex) {
      productSourceText += originalText.substring(lastIndex, range.startIndex);
    }
    // 범위는 제외 (텍스트 제거)
    lastIndex = range.endIndex;
  }
  
  // 마지막 범위 이후의 텍스트 추가
  if (lastIndex < originalText.length) {
    productSourceText += originalText.substring(lastIndex);
  }
  
  return productSourceText;
}

