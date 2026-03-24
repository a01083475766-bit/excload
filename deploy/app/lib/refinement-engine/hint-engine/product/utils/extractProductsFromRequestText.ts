/**
 * Extract products from request text
 * 
 * Extracts ProductCandidate from requestSourceText when both product name and quantity pattern exist.
 * Ignores sentences that only have quantity or only have request keywords.
 * Returns all products found in the text.
 */

import type { ProductCandidate } from '@/app/lib/refinement-engine/hint-engine/f-product-resolver';
import { isRequestSentence } from '../F-0-pre-gate';

/**
 * 수량 패턴 정의
 * 다양한 한국어 수량 표현 지원
 */
const QUANTITY_PATTERNS = [
  /(\d+)\s*(개|대|장|박스|세트|묶음|팩|통|병|봉|줄|마리|벌|켤레|자루|송이|포기|단|근|그램|킬로|리터|ml|mL|ML|L|l|kg|KG|Kg|g|G|cm|CM|Cm|m|M|mm|MM|Mm|inch|INCH|Inch|ft|FT|Ft|EA|ea|EA\.|ea\.|SET|set|SET\.|set\.|케이스|CASE|case|CASE\.|case\.)/i,
  /(\d+)[개대장세트]/,
  /각\s*(\d+)\s*개/,
  /각각\s*(\d+)\s*개/,
  /(\d+)\s*개씩/,
];

/**
 * 프로모션 패턴 정의
 * 2+1, 1+1, x2, *3 등의 프로모션 표기 지원
 */
const PROMOTION_PATTERNS = [
  // 2+1, 1+1, 3+1 등 (총 수량 = 첫 번째 + 두 번째)
  /(\d+)\s*\+\s*(\d+)(?:\s*(?:개|대|장|박스|세트|묶음|팩|통|병|봉|줄|마리|벌|켤레|자루|송이|포기|단|근|그램|킬로|리터|ml|mL|ML|L|l|kg|KG|Kg|g|G|cm|CM|Cm|m|M|mm|MM|Mm|inch|INCH|Inch|ft|FT|Ft|EA|ea|EA\.|ea\.|SET|set|SET\.|set\.|케이스|CASE|case|CASE\.|case\.))?/i,
  // x2, x3, X2 등 (배수 표기, 앞에 기본 수량이 있어야 함)
  /(\d+)\s*(?:개|대|장|박스|세트|묶음|팩|통|병|봉|줄|마리|벌|켤레|자루|송이|포기|단|근|그램|킬로|리터|ml|mL|ML|L|l|kg|KG|Kg|g|G|cm|CM|Cm|m|M|mm|MM|Mm|inch|INCH|Inch|ft|FT|Ft|EA|ea|EA\.|ea\.|SET|set|SET\.|set\.|케이스|CASE|case|CASE\.|case\.)?\s*[xX]\s*(\d+)/i,
  // *2, *3 등 (배수 표기, 앞에 기본 수량이 있어야 함)
  /(\d+)\s*(?:개|대|장|박스|세트|묶음|팩|통|병|봉|줄|마리|벌|켤레|자루|송이|포기|단|근|그램|킬로|리터|ml|mL|ML|L|l|kg|KG|Kg|g|G|cm|CM|Cm|m|M|mm|MM|Mm|inch|INCH|Inch|ft|FT|Ft|EA|ea|EA\.|ea\.|SET|set|SET\.|set\.|케이스|CASE|case|CASE\.|case\.)?\s*\*\s*(\d+)/i,
];

/**
 * 상품명 패턴 정의
 * 한글, 영문, 숫자가 혼합된 패턴 또는 한글/영문만으로 구성된 명사 형태
 */
const PRODUCT_NAME_PATTERNS = [
  // 한글 + 숫자 (예: "노트북2", "마우스3")
  /[가-힣]+[0-9]+/,
  // 영문 + 숫자 (예: "iPhone14", "MacBook2")
  /[a-zA-Z]+[0-9]+/i,
  // 숫자 + 한글 (예: "2노트북", "3마우스")
  /[0-9]+[가-힣]+/,
  // 숫자 + 영문 (예: "2iPhone", "3MacBook")
  /[0-9]+[a-zA-Z]+/i,
  // 한글 + 영문 (예: "노트북Mac", "마우스Mouse")
  /[가-힣]+[a-zA-Z]+/i,
  // 영문 + 한글 (예: "iPhone노트북", "MacBook마우스")
  /[a-zA-Z]+[가-힣]+/i,
  // 한글만 (2자 이상, 명사 형태)
  /[가-힣]{2,}/,
  // 영문만 (2자 이상, 명사 형태)
  /[a-zA-Z]{2,}/i,
];

/**
 * 요청 키워드 목록
 * 요청어만 있는 문장을 필터링하기 위해 사용
 */
const REQUEST_KEYWORDS = [
  '주문', '배송', '부탁', '요청', '해주세요', '부탁드립니다', '바랍니다',
  '문의', '확인', '연락', '전화', '택배', '발송', '수령', '수신',
];

/**
 * 프로모션 패턴에서 총 수량 계산
 * 
 * @param match - 프로모션 패턴 매칭 결과
 * @param patternIndex - 사용된 패턴 인덱스
 * @returns 총 수량, 계산 불가능하면 null
 */
function calculatePromotionQuantity(match: RegExpMatchArray, patternIndex: number): number | null {
  if (patternIndex === 0) {
    // 2+1 형식: 첫 번째 숫자 + 두 번째 숫자
    const first = parseInt(match[1], 10);
    const second = parseInt(match[2], 10);
    if (!isNaN(first) && !isNaN(second) && first > 0 && second > 0) {
      return first + second;
    }
  } else if (patternIndex === 1 || patternIndex === 2) {
    // x2, *3 형식: 첫 번째 숫자 * 두 번째 숫자
    const base = parseInt(match[1], 10);
    const multiplier = parseInt(match[2], 10);
    if (!isNaN(base) && !isNaN(multiplier) && base > 0 && multiplier > 0) {
      return base * multiplier;
    }
  }
  return null;
}

/**
 * 문장에서 수량 패턴 추출
 * 프로모션 패턴(2+1, x2, *3 등)을 우선 처리하고, 없으면 일반 수량 패턴 처리
 * 
 * @param sentence - 분석할 문장
 * @returns 추출된 수량 값과 매칭된 전체 텍스트, 없으면 null
 */
function extractQuantity(sentence: string): { quantity: number; match: string } | null {
  // 프로모션 패턴 우선 체크
  for (let i = 0; i < PROMOTION_PATTERNS.length; i++) {
    const pattern = PROMOTION_PATTERNS[i];
    const match = sentence.match(pattern);
    if (match) {
      const totalQuantity = calculatePromotionQuantity(match, i);
      if (totalQuantity !== null && totalQuantity > 0) {
        return {
          quantity: totalQuantity,
          match: match[0],
        };
      }
    }
  }
  
  // 일반 수량 패턴 처리
  for (const pattern of QUANTITY_PATTERNS) {
    const match = sentence.match(pattern);
    if (match) {
      const quantityStr = match[1] || match[0].replace(/[^0-9]/g, '');
      const quantity = parseInt(quantityStr, 10);
      if (!isNaN(quantity) && quantity > 0) {
        return {
          quantity,
          match: match[0],
        };
      }
    }
  }
  return null;
}

/**
 * 문장에서 상품명 추출
 * 
 * @param sentence - 분석할 문장
 * @returns 추출된 상품명 배열
 */
function extractProductNames(sentence: string): string[] {
  const productNames: string[] = [];
  
  for (const pattern of PRODUCT_NAME_PATTERNS) {
    const matches = sentence.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      if (match[0]) {
        const productName = match[0].trim();
        // 최소 길이 2자 이상
        if (productName.length >= 2) {
          // 수량 패턴이 포함된 경우 제외 (예: "2개", "10EA" 등)
          const isQuantityPattern = QUANTITY_PATTERNS.some(qp => {
            const qpMatch = productName.match(qp);
            return qpMatch && qpMatch[0] === productName;
          });
          
          if (!isQuantityPattern) {
            // 요청 키워드만으로 구성된 경우 제외
            const isOnlyRequestKeyword = REQUEST_KEYWORDS.some(keyword => 
              productName === keyword || productName.startsWith(keyword) && productName.length === keyword.length
            );
            
            if (!isOnlyRequestKeyword) {
              productNames.push(productName);
            }
          }
        }
      }
    }
  }
  
  // 중복 제거 및 정렬 (긴 것부터)
  return Array.from(new Set(productNames))
    .sort((a, b) => b.length - a.length);
}

/**
 * 문장이 요청어만 있는지 확인
 * 
 * @param sentence - 확인할 문장
 * @returns 요청어만 있으면 true
 */
function isOnlyRequestKeywords(sentence: string): boolean {
  const trimmed = sentence.trim();
  
  // isRequestSentence로 요청 문장인지 확인
  if (isRequestSentence(trimmed)) {
    // 상품명이나 수량 패턴이 없는 경우에만 true
    const hasProductName = extractProductNames(trimmed).length > 0;
    const hasQuantity = extractQuantity(trimmed) !== null;
    
    return !hasProductName && !hasQuantity;
  }
  
  return false;
}

/**
 * 다상품 구분자로 문장을 분리
 * 쉼표(,), 및/와/과, 슬래시(/)로 연결된 다상품 문장을 분리
 * 
 * @param text - 분리할 텍스트
 * @returns 분리된 텍스트 배열
 */
function splitByMultiProductDelimiters(text: string): string[] {
  // 다상품 구분자 패턴: 쉼표, "및", "와", "과", 슬래시
  // 구분자 앞뒤 공백을 고려하여 분리
  // 비캡처 그룹 사용하여 구분자 텍스트가 결과에 포함되지 않도록 함
  const parts = text
    .split(/,|\s*(?:및|와|과)\s*|\//)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  return parts;
}

/**
 * 단일 텍스트 단위에서 (상품명 + 수량 패턴) 추출
 * 인접성 규칙 적용: 각 수량 패턴은 가장 가까운 상품명에만 귀속
 * 
 * @param text - 분석할 텍스트 단위
 * @returns ProductCandidate 배열 (0개 이상)
 */
function extractFromSingleUnit(text: string): ProductCandidate[] {
  const candidates: ProductCandidate[] = [];
  
  // 요청어만 있는 경우는 무시
  if (isOnlyRequestKeywords(text)) {
    return candidates;
  }
  
  // 상품명 추출 (위치 정보 포함)
  const productNames = extractProductNames(text);
  
  // 상품명이 없으면 무시
  if (productNames.length === 0) {
    return candidates;
  }
  
  // 모든 수량 패턴 추출 (위치 정보 포함)
  // 프로모션 패턴을 우선 처리
  const quantities: Array<{ quantity: number; match: string; index: number; isPromotion: boolean }> = [];
  
  // 프로모션 패턴 먼저 체크
  for (let i = 0; i < PROMOTION_PATTERNS.length; i++) {
    const pattern = PROMOTION_PATTERNS[i];
    const matches = text.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      if (match.index !== undefined && match[0]) {
        const totalQuantity = calculatePromotionQuantity(match, i);
        if (totalQuantity !== null && totalQuantity > 0) {
          quantities.push({
            quantity: totalQuantity,
            match: match[0],
            index: match.index,
            isPromotion: true,
          });
        }
      }
    }
  }
  
  // 일반 수량 패턴 처리 (프로모션 패턴과 겹치지 않는 경우만)
  for (const pattern of QUANTITY_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      if (match.index !== undefined && match[0]) {
        // 프로모션 패턴과 겹치는지 확인
        const isOverlapping = quantities.some(qty => {
          const matchStart = match.index!;
          const matchEnd = matchStart + match[0].length;
          const qtyStart = qty.index;
          const qtyEnd = qtyStart + qty.match.length;
          // 겹치는 경우 (교집합이 있는 경우)
          return !(matchEnd <= qtyStart || matchStart >= qtyEnd);
        });
        
        if (!isOverlapping) {
          const quantityStr = match[1] || match[0].replace(/[^0-9]/g, '');
          const quantity = parseInt(quantityStr, 10);
          if (!isNaN(quantity) && quantity > 0) {
            quantities.push({
              quantity,
              match: match[0],
              index: match.index,
              isPromotion: false,
            });
          }
        }
      }
    }
  }
  
  // 수량 패턴이 없으면 무시 (상품명 + 수량 패턴이 동시에 존재해야 함)
  if (quantities.length === 0) {
    return candidates;
  }
  
  // 수량만 있고 상품명이 없는 경우는 무시
  if (productNames.length === 0) {
    return candidates;
  }
  
  // 인접성 규칙 적용: 각 수량 패턴을 가장 가까운 상품명에 매칭
  for (const qty of quantities) {
    let nearestProductName: string | null = null;
    let minDistance = Infinity;
    
    // 각 상품명의 위치를 찾아서 가장 가까운 것 선택
    for (const productName of productNames) {
      // 상품명이 텍스트에서 나타나는 모든 위치 확인
      let searchIndex = 0;
      while (true) {
        const productIndex = text.indexOf(productName, searchIndex);
        if (productIndex === -1) break;
        
        // 수량 패턴의 중심 위치와 상품명의 중심 위치 간 거리 계산
        const qtyCenter = qty.index + qty.match.length / 2;
        const productCenter = productIndex + productName.length / 2;
        const distance = Math.abs(qtyCenter - productCenter);
        
        if (distance < minDistance) {
          minDistance = distance;
          nearestProductName = productName;
        }
        
        searchIndex = productIndex + 1;
      }
    }
    
    // 가장 가까운 상품명에 수량 패턴 귀속
    if (nearestProductName) {
      // 중복 체크: 같은 상품명과 수량 조합이 이미 있는지 확인
      const isDuplicate = candidates.some(
        c => c.name === nearestProductName && c.quantity === qty.quantity
      );
      
      if (!isDuplicate) {
        // quantityReason 구성
        const reasons: string[] = [];
        if (qty.isPromotion) {
          reasons.push(`프로모션 수량 계산: ${qty.match} → ${qty.quantity}`);
        }
        if (productNames.length > 1) {
          reasons.push(`인접성 매칭: "${nearestProductName}"에 귀속`);
        }
        const quantityReason = reasons.length > 0 ? reasons.join(', ') : undefined;
        
        candidates.push({
          name: nearestProductName,
          quantity: qty.quantity,
          confidence: 0.8, // 상품명과 수량이 동시에 존재하므로 높은 신뢰도
          quantityReason,
        });
      }
    }
  }
  
  return candidates;
}

/**
 * requestSourceText에서 (상품명 + 수량 패턴)이 동시에 존재하는 경우에만 ProductCandidate를 생성하는 보조 추출 함수
 * 
 * 규칙:
 * - 상품명과 수량 패턴이 동시에 존재하는 경우에만 ProductCandidate 생성
 * - 수량만 있는 문장은 무시
 * - 요청어만 있는 문장은 무시
 * - 여러 상품이 있으면 모두 반환
 * - 쉼표(,), 및/와/과, 슬래시(/)로 연결된 다상품 문장은 먼저 분리한 뒤 각 단위마다 독립적으로 추출
 * 
 * @param requestSourceText - 요청 소스 텍스트
 * @returns ProductCandidate 배열
 */
export function extractProductsFromRequestText(
  requestSourceText: string
): ProductCandidate[] {
  if (!requestSourceText || requestSourceText.trim().length === 0) {
    return [];
  }
  
  // 문장 단위로 분리
  const sentences = requestSourceText
    .trim()
    .split(/[.!?。！？]\s*|[\n\r]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  const candidates: ProductCandidate[] = [];
  
  // 각 문장에 대해 처리
  for (const sentence of sentences) {
    // 다상품 구분자가 있는지 확인 (쉼표, "및/와/과", 슬래시)
    const hasMultiProductDelimiter = /,|\s*(?:및|와|과)\s*|\//.test(sentence);
    
    if (hasMultiProductDelimiter) {
      // 다상품 문장: 구분자로 분리하여 각 단위마다 독립적으로 추출
      const splitUnits = splitByMultiProductDelimiters(sentence);
      
      for (const unit of splitUnits) {
        const unitCandidates = extractFromSingleUnit(unit);
        
        // 각 단위에서 추출한 후보들을 추가 (중복 체크 포함)
        for (const candidate of unitCandidates) {
          const isDuplicate = candidates.some(c => c.name === candidate.name && c.quantity === candidate.quantity);
          if (!isDuplicate) {
            candidates.push(candidate);
          }
        }
      }
    } else {
      // 단일 상품 문장: 기존 로직 유지
      const sentenceCandidates = extractFromSingleUnit(sentence);
      
      // 문장에서 추출한 후보들을 추가 (중복 체크 포함)
      for (const candidate of sentenceCandidates) {
        const isDuplicate = candidates.some(c => c.name === candidate.name && c.quantity === candidate.quantity);
        if (!isDuplicate) {
          candidates.push(candidate);
        }
      }
    }
  }
  
  return candidates;
}

