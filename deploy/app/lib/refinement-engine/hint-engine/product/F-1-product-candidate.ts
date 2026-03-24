/**
 * F-1 ProductCandidate 생성
 * 
 * productTokens를 기반으로 ProductCandidate를 생성하되,
 * Pre-Gate를 통해 요청/명령 문장은 ProductCandidate 생성에서 제외
 */

import type { ProductCandidate } from '@/app/lib/refinement-engine/hint-engine/f-product-resolver';
import { isRequestSentence } from './F-0-pre-gate';

/**
 * ProductCandidate 생성 함수
 * 
 * productTokens를 기반으로 ProductCandidate를 생성하되,
 * productSourceText를 문장 단위로 분리하여 각 문장이 요청/명령 문장인지 확인하고,
 * isRequestSentence가 true인 문장에 포함된 productTokens는 ProductCandidate 생성에서 제외
 * 
 * @param productTokens - 상품 토큰 배열
 * @param productSourceText - 상품 소스 텍스트 (NAME/PHONE/ADDRESS/REQUEST 제외된 원문, 문장 단위 필터링에 사용)
 * @returns ProductCandidate 배열
 */
export function createProductCandidates(
  productTokens: string[],
  productSourceText: string
): ProductCandidate[] {
  // productSourceText를 문장 단위로 분리
  const sentences: string[] = [];
  if (productSourceText && productSourceText.trim().length > 0) {
    const splitSentences = productSourceText
      .trim()
      .split(/[.!?。！？]\s*|[\n\r]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    sentences.push(...splitSentences);
  }
  
  // productTokens 중에서 요청/명령 문장에 포함된 토큰 필터링
  // isRequestSentence가 true인 문장에 포함된 토큰은 제외
  const filteredProductTokens = productTokens.filter(token => {
    // 각 문장에 대해 확인
    for (const sentence of sentences) {
      // 문장이 요청/명령 문장인지 확인
      if (isRequestSentence(sentence)) {
        // 요청/명령 문장에 토큰이 포함되어 있으면 제외
        if (sentence.includes(token)) {
          return false;
        }
      }
    }
    // 토큰 자체가 요청/명령 문장인지도 확인
    if (isRequestSentence(token)) {
      return false;
    }
    return true;
  });
  
  // Product Token Gate: ProductCandidate 생성 직전 필터링
  const gatedProductTokens = filteredProductTokens.filter(token => {
    const trimmedToken = token.trim();
    
    // 1. 기호만 있는 토큰 제외 (알파벳, 숫자, 한글이 하나도 없는 경우)
    if (!/[\w가-힣]/.test(trimmedToken)) {
      return false;
    }
    
    // 2. 길이 1 토큰 제외
    if (trimmedToken.length === 1) {
      return false;
    }
    
    // 3. 호칭/조사 제외 (님, 분, 씨, 에, 에게, 으로, 로, 만)
    const honorificsAndParticles = ['님', '분', '씨', '에', '에게', '으로', '로', '만'];
    if (honorificsAndParticles.includes(trimmedToken)) {
      return false;
    }
    
    // 4. 수량/단위 전용 토큰 제외 (숫자 + 단위 패턴)
    // 단위: 개, 대, 장, 박스, 세트, 묶음, 팩, 통, 병, 봉, 줄, 마리, 벌, 켤레, 자루, 송이, 포기, 단, 근, 그램, 킬로, 리터, ml, mL, L, kg, g, cm, m, mm 등
    const quantityUnitPattern = /^\d+\s*(개|대|장|박스|세트|묶음|팩|통|병|봉|줄|마리|벌|켤레|자루|송이|포기|단|근|그램|킬로|리터|ml|mL|ML|L|l|kg|KG|Kg|g|G|cm|CM|Cm|m|M|mm|MM|Mm|inch|INCH|Inch|ft|FT|Ft|EA|ea|EA\.|ea\.|SET|set|SET\.|set\.|케이스|CASE|case|CASE\.|case\.)$/i;
    if (quantityUnitPattern.test(trimmedToken)) {
      return false;
    }
    
    // 5. isRequestSentence로 판정된 문장에서 나온 토큰은 이미 위에서 필터링됨 (기존 로직 유지)
    
    return true;
  });
  
  // 필터링된 productTokens로 ProductCandidate 생성
  const candidates: ProductCandidate[] = gatedProductTokens.map(token => ({
    name: token,
    quantity: null,
    confidence: 1.0,
  }));
  
  return candidates;
}

