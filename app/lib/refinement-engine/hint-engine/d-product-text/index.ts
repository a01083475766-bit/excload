/**
 * D Product Text pipeline module
 * Handles product text processing and refinement operations
 */

/**
 * D Product Text result type
 * Represents the result of product text pipeline processing
 */
export type DProductTextResult = {
  /**
   * Product text (pass-through)
   * The original cleanedText passed through without modification
   */
  productText: string;
  
  /**
   * Option text (pass-through)
   * The original cleanedText passed through without modification
   */
  optionText: string;
  
  /**
   * Request text (pass-through)
   * The original cleanedText passed through without modification
   */
  requestText: string;
  
  /**
   * Quantity hint (pass-through)
   * The original cleanedText passed through without modification
   */
  quantityHint: string;
};

/**
 * D Product Text pipeline function signature
 * Processes cleanedText to extract product text information
 * 
 * @param cleanedText - Cleaned text string to process
 * @returns DProductTextResult with product/option/request/quantity information
 */
export function runDProductTextPipeline(cleanedText: string): DProductTextResult {
  // 분리 기준: ',', '와', '과', '및', '/', 줄바꿈
  const separators = /[,와과및\/\n\r]+/;
  
  // 텍스트를 분리 기준으로 분할
  const parts = cleanedText.split(separators)
    .map(part => part.trim())
    .filter(part => part.length > 0);
  
  // 분리 결과가 1개 이하이거나 비정상이면 모든 필드는 cleanedText 그대로 유지
  if (parts.length <= 1) {
    return {
      productText: cleanedText,
      optionText: cleanedText,
      requestText: cleanedText,
      quantityHint: cleanedText,
    };
  }
  
  // 분리 성공 시: 첫 번째는 productText, 두 번째는 optionText, 나머지는 requestText
  let productText = parts[0] || cleanedText;
  let optionText = parts[1] || '';
  let requestText = parts.slice(2).join(' ') || '';
  
  // 의미 키워드 기반 request/option 재분류
  try {
    // request 관련 키워드 정규화 매핑 (같은 의미의 다양한 표현을 통합)
    const requestKeywordMapping: Array<{
      patterns: RegExp[];
      representative: string; // 대표 키워드
    }> = [
      { patterns: [/부탁드립니다/g, /부탁합니다/g, /부탁해/g, /부탁/g], representative: '부탁' },
      { patterns: [/해주세요/g, /해주시길/g, /해주시기/g, /해주시면/g, /해주시고/g], representative: '해주세요' },
      { patterns: [/원합니다/g, /원함/g, /원해/g], representative: '원해' },
      { patterns: [/주문합니다/g, /주문해/g, /주문/g], representative: '주문' },
      { patterns: [/배송해주세요/g, /배송해주시길/g, /배송해/g, /배송/g], representative: '배송' },
      { patterns: [/요청합니다/g, /요청해/g, /요청/g], representative: '요청' },
      { patterns: [/요구/g], representative: '요구' },
    ];
    
    // option 관련 키워드 정규화 매핑 (같은 의미의 다양한 표현을 통합)
    const optionKeywordMapping: Array<{
      patterns: RegExp[];
      representative: string; // 대표 키워드
    }> = [
      { patterns: [/색상/g, /색/g], representative: '색상' },
      { patterns: [/크기/g, /사이즈/g], representative: '크기' },
      { patterns: [/옵션/g], representative: '옵션' },
      { patterns: [/종류/g], representative: '종류' },
      { patterns: [/타입/g], representative: '타입' },
      { patterns: [/모델/g], representative: '모델' },
      { patterns: [/버전/g], representative: '버전' },
      { patterns: [/스펙/g, /사양/g], representative: '스펙' },
      { patterns: [/규격/g], representative: '규격' },
      { patterns: [/형태/g], representative: '형태' },
      { patterns: [/디자인/g], representative: '디자인' },
      { patterns: [/스타일/g], representative: '스타일' },
    ];
    
    // 정규화 함수: 텍스트에서 모든 변형을 대표 키워드로 정규화
    const normalizeText = (text: string, mapping: Array<{ patterns: RegExp[]; representative: string }>): string => {
      let normalized = text;
      for (const group of mapping) {
        for (const pattern of group.patterns) {
          normalized = normalized.replace(pattern, group.representative);
        }
      }
      return normalized;
    };
    
    // 모든 변형 키워드를 하나의 패턴으로 통합
    const requestKeywords: string[] = [];
    for (const group of requestKeywordMapping) {
      for (const pattern of group.patterns) {
        // 정규식 패턴에서 실제 키워드 문자열 추출
        const keyword = pattern.source.replace(/^\/|\/[gimuy]*$/g, '');
        requestKeywords.push(keyword);
      }
    }
    
    const optionKeywords: string[] = [];
    for (const group of optionKeywordMapping) {
      for (const pattern of group.patterns) {
        const keyword = pattern.source.replace(/^\/|\/[gimuy]*$/g, '');
        optionKeywords.push(keyword);
      }
    }
    
    // request 관련 키워드 패턴 (모든 변형 포함)
    const requestKeywordPattern = new RegExp(requestKeywords.join('|'), 'i');
    
    // option 관련 키워드 패턴 (모든 변형 포함)
    const optionKeywordPattern = new RegExp(optionKeywords.join('|'), 'i');
    
    // parts[1]부터 끝까지 각 부분을 분석하여 재분류
    const requestParts: string[] = [];
    const optionParts: string[] = [];
    const neutralParts: string[] = [];
    
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      
      // request 키워드가 포함된 경우
      if (requestKeywordPattern.test(part)) {
        requestParts.push(part);
      }
      // option 키워드가 포함된 경우
      else if (optionKeywordPattern.test(part)) {
        optionParts.push(part);
      }
      // 키워드가 없는 경우 (중립)
      else {
        neutralParts.push(part);
      }
    }
    
    // 재분류 결과가 있는 경우에만 적용 (키워드가 하나라도 발견된 경우)
    if (requestParts.length > 0 || optionParts.length > 0) {
      // optionText: option 키워드가 있는 부분 + 중립 부분 중 앞쪽
      // requestText: request 키워드가 있는 부분 + 중립 부분 중 뒤쪽
      if (optionParts.length > 0) {
        const neutralForOption = neutralParts.slice(0, Math.ceil(neutralParts.length / 2));
        const neutralForRequest = neutralParts.slice(Math.ceil(neutralParts.length / 2));
        optionText = [...optionParts, ...neutralForOption].filter(t => t.length > 0).join(' ');
        requestText = [...neutralForRequest, ...requestParts].filter(t => t.length > 0).join(' ');
      } else {
        // option 키워드가 없고 request 키워드만 있는 경우
        // 중립 부분은 모두 optionText로, request 키워드 부분은 requestText로
        optionText = neutralParts.join(' ');
        requestText = requestParts.join(' ');
      }
    }
    // 재분류 실패 시 (키워드가 없는 경우) 기존 결과 유지 (아무것도 하지 않음)
  } catch (error) {
    // 재분류 실패 시 기존 분리 결과 유지 (아무것도 하지 않음)
    // productText, optionText, requestText는 이미 설정된 값 그대로 사용
  }
  
  // 수량 힌트 추출: 숫자+단위(개/대/장/세트) 패턴만 추출
  const quantityMatch = cleanedText.match(/\d+[개대장세트]/);
  const quantityHint = quantityMatch ? quantityMatch[0] : '';
  
  return {
    productText,
    optionText,
    requestText,
    quantityHint,
  };
}

