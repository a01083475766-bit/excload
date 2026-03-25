/**
 * F Product Resolver pipeline module
 * Handles product candidate generation and single/multiple product resolution
 */

import type { ProductInterpretationResult } from '@/app/lib/refinement-engine/hint-engine/e-product-interpreter';
import type { DProductTextResult } from '@/app/lib/refinement-engine/hint-engine/d-product-text';
import { resolveOptions as resolveOptionsF2 } from '@/app/lib/refinement-engine/hint-engine/product/F-2-option-resolver';
import { mergeCommonOptions } from '@/app/lib/refinement-engine/hint-engine/product/F-3-common-option-merge';
import type { RequestWithType } from '@/app/lib/refinement-engine/types/RequestWithType';
import { RequestType } from '@/app/lib/refinement-engine/hint-engine/product/F-2-option-resolver';
import { createProductCandidates } from '@/app/lib/refinement-engine/hint-engine/product/F-1-product-candidate';
import { extractProductsFromRequestText } from '@/app/lib/refinement-engine/hint-engine/product/utils/extractProductsFromRequestText';

/**
 * F Pipeline Input type
 * Represents the input to F pipeline (E pipeline output + requestText + productSourceText)
 */
export type FProductResolverInput = {
  /**
   * Product tokens from E pipeline
   */
  productTokens: string[];
  
  /**
   * Option tokens from E pipeline
   */
  optionTokens: string[];
  
  /**
   * Quantity hint from E pipeline
   */
  quantityHint: string;
  
  /**
   * Request text from D pipeline
   */
  requestText: string;
  
  /**
   * Product source text (original text excluding NAME/PHONE/ADDRESS/REQUEST)
   * Used for ProductCandidate creation instead of remainingText/requestText
   */
  productSourceText: string;
};

/**
 * ProductCandidate type
 * Represents a candidate product with its associated information
 */
export type ProductCandidate = {
  /**
   * Product name
   */
  name: string;
  
  /**
   * Product quantity (if available)
   */
  quantity: number | null;
  
  /**
   * Product option (single option)
   */
  option?: string;
  
  /**
   * Product options (multiple options)
   */
  options?: string[];
  
  /**
   * Product requests
   */
  requests?: Array<string | RequestWithType>;
  
  /**
   * Confidence score for this candidate
   */
  confidence: number;
  
  /**
   * Status of this candidate (CONFIRMED, WARNING, or INVALID)
   */
  status?: 'CONFIRMED' | 'WARNING' | 'INVALID';
  
  /**
   * Reasons for the status determination
   */
  statusReason?: string[];
  
  /**
   * Internal metadata: Reason for quantity assignment
   */
  quantityReason?: string;
  
  /**
   * Internal metadata: Reason for option/options assignment
   */
  optionReason?: string;
  
  /**
   * Internal metadata: Reason for requests assignment
   */
  requestReason?: string;
};

/**
 * Product Resolution Result type
 * Represents the result of product resolution (single or multiple)
 */
export type ProductResolutionResult = {
  /**
   * Product candidates generated from input
   */
  candidates: ProductCandidate[];
  
  /**
   * Whether the resolution is for a single product or multiple products
   * true: single product, false: multiple products
   */
  isSingle: boolean;
  
  /**
   * Confidence score for the resolution
   */
  confidence: number;
};

/**
 * Quantity Resolution Result type
 * Represents the result of quantity resolution for product candidates
 */
export type QuantityResolution = {
  /**
   * Product candidates with resolved quantities
   */
  candidates: ProductCandidate[];
  
  /**
   * Confidence score for the quantity resolution
   */
  confidence: number;
};

/**
 * 위치 기반 인접성 규칙 적용
 * 
 * 옵션 텍스트와 RequestType=ETC 요청을 가장 가까운 ProductCandidate에만 귀속
 * 다상품일 경우 교차 귀속은 금지 (한 옵션/요청은 하나의 상품에만 귀속)
 * 
 * @param candidates - Product candidates
 * @param optionTokens - Option tokens
 * @param originalText - Original text for proximity checking
 * @returns Product candidates with proximity-based attribution applied
 */
function applyProximityBasedAttribution(
  candidates: ProductCandidate[],
  optionTokens: string[],
  originalText: string
): ProductCandidate[] {
  const resultCandidates: ProductCandidate[] = candidates.map(candidate => ({
    ...candidate,
    option: candidate.option ? candidate.option : undefined,
    options: candidate.options ? [...candidate.options] : undefined,
    requests: candidate.requests ? [...candidate.requests] : undefined,
  }));
  
  // 원문에서 토큰 위치 추출 헬퍼 함수
  const getTokenPositions = (text: string, token: string): number[] => {
    if (!text || !token) return [];
    const positions: number[] = [];
    let index = text.indexOf(token);
    while (index >= 0) {
      positions.push(index);
      index = text.indexOf(token, index + 1);
    }
    return positions;
  };
  
  // 원문에서 상품명 위치 추출
  const productPositions = new Map<number, number[]>();
  resultCandidates.forEach((candidate, index) => {
    const positions = getTokenPositions(originalText, candidate.name);
    productPositions.set(index, positions);
  });
  
  // 두 위치 사이의 최소 거리 계산
  const calculateMinDistance = (positions1: number[], positions2: number[], token1Length: number, token2Length: number): number => {
    if (positions1.length === 0 || positions2.length === 0) return Infinity;
    
    let minDistance = Infinity;
    for (const pos1 of positions1) {
      const end1 = pos1 + token1Length;
      for (const pos2 of positions2) {
        const end2 = pos2 + token2Length;
        const distance = Math.min(
          Math.abs(pos1 - end2),
          Math.abs(pos2 - end1),
          Math.abs(pos1 - pos2),
          Math.abs(end1 - end2)
        );
        minDistance = Math.min(minDistance, distance);
      }
    }
    return minDistance;
  };
  
  // 옵션 토큰을 가장 가까운 상품에 귀속
  const optionToProductMap = new Map<string, number>();
  
  for (const optionToken of optionTokens) {
    const optionPositions = getTokenPositions(originalText, optionToken);
    if (optionPositions.length === 0) continue;
    
    let closestProductIndex: number | null = null;
    let minDistance = Infinity;
    
    // 각 상품과의 거리 계산
    for (let i = 0; i < resultCandidates.length; i++) {
      const productName = resultCandidates[i].name;
      const productPos = productPositions.get(i) || [];
      
      if (productPos.length === 0) continue;
      
      const distance = calculateMinDistance(
        optionPositions,
        productPos,
        optionToken.length,
        productName.length
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        closestProductIndex = i;
      }
    }
    
    // 가장 가까운 상품에 귀속 (교차 귀속 금지)
    if (closestProductIndex !== null) {
      optionToProductMap.set(optionToken, closestProductIndex);
    }
  }
  
  // 모든 상품의 옵션 초기화
  resultCandidates.forEach(candidate => {
    candidate.option = undefined;
    candidate.options = undefined;
    candidate.optionReason = undefined;
  });
  
  // 옵션을 해당 상품에만 할당
  for (const [optionToken, productIndex] of optionToProductMap.entries()) {
    const candidate = resultCandidates[productIndex];
    if (!candidate.options) {
      candidate.options = [];
    }
    candidate.options.push(optionToken);
    if (candidate.optionReason) {
      candidate.optionReason += `, 위치 기반 귀속: ${optionToken}`;
    } else {
      candidate.optionReason = `위치 기반 귀속: ${optionToken}`;
    }
  }
  
  // 단일 옵션인 경우 option 필드로 변환
  resultCandidates.forEach(candidate => {
    if (candidate.options && candidate.options.length === 1) {
      candidate.option = candidate.options[0];
      candidate.options = undefined;
    }
  });
  
  // RequestType=ETC 요청을 가장 가까운 상품에만 귀속
  resultCandidates.forEach((candidate, candidateIndex) => {
    if (!candidate.requests || candidate.requests.length === 0) return;
    
    const etcRequests: Array<string | RequestWithType> = [];
    const otherRequests: Array<string | RequestWithType> = [];
    
    // ETC 요청과 기타 요청 분리
    candidate.requests.forEach(req => {
      if (typeof req === 'string') {
        // 문자열인 경우 타입 분류 필요
        const requestType = classifyRequestTypeForETC(req);
        if (requestType === 'ETC') {
          etcRequests.push(req);
        } else {
          otherRequests.push(req);
        }
      } else if (req.requestType === RequestType.ETC) {
        etcRequests.push(req);
      } else {
        otherRequests.push(req);
      }
    });
    
    // ETC 요청이 없으면 다음 후보로
    if (etcRequests.length === 0) {
      candidate.requests = otherRequests.length > 0 ? otherRequests : undefined;
      return;
    }
    
    // ETC 요청을 위치 기반으로 재귀속
    const etcRequestToProductMap = new Map<number, number>();
    
    etcRequests.forEach((req, reqIndex) => {
      const reqText = typeof req === 'string' ? req : req.text;
      const reqPositions = getTokenPositions(originalText, reqText);
      
      if (reqPositions.length === 0) {
        // 위치를 찾을 수 없으면 원래 상품에 유지
        etcRequestToProductMap.set(reqIndex, candidateIndex);
        return;
      }
      
      let closestProductIndex: number | null = null;
      let minDistance = Infinity;
      
      // 각 상품과의 거리 계산
      for (let i = 0; i < resultCandidates.length; i++) {
        const productName = resultCandidates[i].name;
        const productPos = productPositions.get(i) || [];
        
        if (productPos.length === 0) continue;
        
        const distance = calculateMinDistance(
          reqPositions,
          productPos,
          reqText.length,
          productName.length
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          closestProductIndex = i;
        }
      }
      
      // 가장 가까운 상품에 귀속 (교차 귀속 금지)
      if (closestProductIndex !== null) {
        etcRequestToProductMap.set(reqIndex, closestProductIndex);
      } else {
        // 찾을 수 없으면 원래 상품에 유지
        etcRequestToProductMap.set(reqIndex, candidateIndex);
      }
    });
    
    // 현재 상품의 ETC 요청 초기화
    candidate.requests = otherRequests.length > 0 ? otherRequests : undefined;
    
    // ETC 요청을 해당 상품에만 할당
    etcRequestToProductMap.forEach((productIndex, reqIndex) => {
      const targetCandidate = resultCandidates[productIndex];
      if (!targetCandidate.requests) {
        targetCandidate.requests = [];
      }
      
      // 기존 requests에 이미 포함되어 있는지 확인 (중복 방지)
      const reqToAdd = etcRequests[reqIndex];
      const reqText = typeof reqToAdd === 'string' ? reqToAdd : reqToAdd.text;
      const alreadyExists = targetCandidate.requests.some(existingReq => {
        const existingText = typeof existingReq === 'string' ? existingReq : existingReq.text;
        return existingText === reqText;
      });
      
      if (!alreadyExists) {
        targetCandidate.requests.push(reqToAdd);
        if (targetCandidate.requestReason) {
          targetCandidate.requestReason += `, 위치 기반 ETC 요청 귀속: ${reqText}`;
        } else {
          targetCandidate.requestReason = `위치 기반 ETC 요청 귀속: ${reqText}`;
        }
      }
    });
  });
  
  // requests가 비어있는 candidate는 requests 필드를 undefined로 설정
  resultCandidates.forEach(candidate => {
    if (candidate.requests && candidate.requests.length === 0) {
      candidate.requests = undefined;
    }
  });
  
  return resultCandidates;
}

/**
 * 요청 텍스트의 RequestType 분류 (ETC 여부만 확인)
 * 
 * @param requestText - 요청 텍스트
 * @returns 'ETC' 또는 'OTHER'
 */
function classifyRequestTypeForETC(requestText: string): 'ETC' | 'OTHER' {
  const trimmed = requestText.trim().toLowerCase();
  
  // DELIVERY 타입 키워드
  const deliveryKeywords = ['배송', '문앞', '빠르게', '택배', '발송'];
  if (deliveryKeywords.some(keyword => trimmed.includes(keyword))) {
    return 'OTHER';
  }
  
  // CONTACT 타입 키워드
  const contactKeywords = ['연락', '전화', '문자', '카톡'];
  if (contactKeywords.some(keyword => trimmed.includes(keyword))) {
    return 'OTHER';
  }
  
  // PACKING 타입 키워드
  const packingKeywords = ['포장', '동봉', '제외', '빼고'];
  if (packingKeywords.some(keyword => trimmed.includes(keyword))) {
    return 'OTHER';
  }
  
  // 기본값: ETC
  return 'ETC';
}

/**
 * F Product Resolver pipeline function
 * 
 * F-1: ProductCandidate 생성
 * - productTokens, optionTokens, quantityHint, requestText를 기반으로 ProductCandidate 생성
 * 
 * F-2: 단일/다중 판단
 * - 생성된 ProductCandidate들을 분석하여 단일 상품인지 다중 상품인지 판단
 * 
 * F-3: 수량 해석
 * - resolveQuantity 함수 호출
 * 
 * F-4: 옵션 해석
 * - resolveOptions 함수 호출
 * 
 * @param input - FProductResolverInput containing productTokens, optionTokens, quantityHint, requestText
 * @returns ProductResolutionResult with generated candidates and single/multiple resolution
 */
/**
 * Product Gate: ProductCandidate 생성 전 필터링
 * 
 * 다음 조건에 해당하는 productTokens는 즉시 제외:
 * 1. 숫자/수량 패턴 (^\d+$, ^\d+개$)
 * 2. 배송·주문·요청 계열 명사
 * 3. quantityTokens에 포함된 토큰
 * 4. requestTokens에 포함된 토큰
 * 5. linkScore>=0.7 optionTokens에 포함된 토큰
 * 
 * @param productTokens - 원본 product tokens
 * @param optionTokens - Option tokens
 * @param quantityHint - Quantity hint
 * @returns 필터링된 product tokens
 */
function applyProductGate(
  productTokens: string[],
  optionTokens: string[],
  quantityHint: string
): string[] {
  // 1. quantityTokens 추출 (quantityHint에서)
  const quantityTokens: string[] = [];
  if (quantityHint && quantityHint.trim().length > 0) {
    const trimmedHint = quantityHint.trim();
    // 숫자 패턴 추출
    const quantityPatterns = [
      /(\d+)\s*개/g,
      /(\d+)\s*대/g,
      /(\d+)\s*장/g,
      /(\d+)\s*박스/g,
      /(\d+)\s*세트/g,
      /(\d+)\s*병/g,
      /(\d+)\s*팩/g,
      /(\d+)/g,
    ];
    
    for (const pattern of quantityPatterns) {
      const matches = [...trimmedHint.matchAll(pattern)];
      for (const match of matches) {
        if (match[1]) {
          // 숫자만 추출
          quantityTokens.push(match[1]);
          // 전체 매칭 (예: "2개", "3대" 등)
          if (match[0]) {
            quantityTokens.push(match[0].trim());
          }
        }
      }
    }
    
    // 중복 제거 및 공백 제거
    const uniqueQuantityTokens = Array.from(new Set(quantityTokens.map(t => t.trim()))).filter(t => t.length > 0);
    quantityTokens.length = 0;
    quantityTokens.push(...uniqueQuantityTokens);
  }
  
  // 2. requestTokens 추출 (optionTokens에서 - F-2와 동일한 로직)
  const requestTokens: string[] = [];
  if (optionTokens && optionTokens.length > 0) {
    const requestPatterns = /(해주세요|주문|배송|으로|해주세요\.)/;
    
    for (const token of optionTokens) {
      const trimmedToken = token.trim();
      if (requestPatterns.test(trimmedToken)) {
        requestTokens.push(trimmedToken);
      }
    }
  }
  
  // 3. linkScore>=0.7 optionTokens 추출
  // linkScore는 product name과의 관계로 계산되지만, 옵션 패턴을 가진 토큰은
  // 일반적으로 높은 linkScore를 가질 가능성이 높으므로 필터링
  // 옵션 패턴: '색상/용량/규격/구성/사이즈/모델' 포함 (F-2와 동일한 로직)
  const optionPatterns = /(색상|용량|규격|구성|사이즈|모델)/;
  const highLinkScoreOptionTokens: string[] = [];
  
  if (optionTokens && optionTokens.length > 0) {
    for (const token of optionTokens) {
      const trimmedToken = token.trim();
      // 옵션 패턴이 포함된 토큰만 필터링 (이들은 일반적으로 높은 linkScore를 가짐)
      if (optionPatterns.test(trimmedToken)) {
        highLinkScoreOptionTokens.push(trimmedToken);
      }
    }
  }
  
  const highLinkScoreOptionTokensSet = new Set(highLinkScoreOptionTokens.map(t => t.trim()));
  
  // 4. 배송·주문·요청 계열 명사 목록
  const requestRelatedNouns = [
    '배송', '주문', '요청', '부탁', '문의', '확인', '연락', '전화',
    '택배', '발송', '수령', '수신', '수취', '인수', '인수자',
    '주문자', '수신자', '배송지', '주소', '요청사항', '요구사항'
  ];
  
  // 5. 필터링 실행
  const filteredTokens = productTokens.filter(token => {
    const trimmedToken = token.trim();
    
    // 숫자/수량 패턴 체크
    if (/^\d+$/.test(trimmedToken) || /^\d+개$/.test(trimmedToken)) {
      return false;
    }
    
    // 배송·주문·요청 계열 명사 체크
    if (requestRelatedNouns.some(noun => trimmedToken.includes(noun) || noun.includes(trimmedToken))) {
      return false;
    }
    
    // quantityTokens 체크
    if (quantityTokens.some(qt => trimmedToken === qt || trimmedToken.includes(qt) || qt.includes(trimmedToken))) {
      return false;
    }
    
    // requestTokens 체크
    if (requestTokens.some(rt => trimmedToken === rt || trimmedToken.includes(rt) || rt.includes(trimmedToken))) {
      return false;
    }
    
    // optionTokens 체크 (linkScore>=0.7로 간주)
    if (highLinkScoreOptionTokensSet.has(trimmedToken)) {
      return false;
    }
    
    return true;
  });
  
  return filteredTokens;
}

export function runFProductResolverPipeline(
  input: FProductResolverInput
): ProductResolutionResult {
  // ============================================================================
  // Product Gate: ProductCandidate 생성 전 필터링
  // ============================================================================
  const filteredProductTokens = applyProductGate(
    input.productTokens,
    input.optionTokens,
    input.quantityHint
  );
  
  // ============================================================================
  // F-1: ProductCandidate 생성 (Pre-Gate 적용)
  // ============================================================================
  const candidates: ProductCandidate[] = createProductCandidates(
    filteredProductTokens,
    input.productSourceText || ''
  );
  
  // requestText 처리 로직
  if (input.requestText && input.requestText.trim().length > 0) {
    try {
      // 1) requestText를 문장 단위로 분리해 배열로 만든다.
      const sentences = input.requestText
        .trim()
        .split(/[.!?。！？]\s*|[\n\r]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      // 문장이 없는 경우 기존 방식 유지
      if (sentences.length === 0) {
        candidates.forEach(candidate => {
          candidate.requests = [input.requestText.trim()];
          candidate.requestReason = `문장 분리 실패, 전체 요청 텍스트 연결: ${input.requestText.trim()}`;
        });
      } else {
        // 각 candidate의 requests 초기화
        candidates.forEach(candidate => {
          candidate.requests = [];
          candidate.requestReason = undefined;
        });
        
        // 지시어 패턴
        const demonstrativePattern = /(이\s*상품|그\s*상품|해당\s*상품|이것만|그것만|이거만|그거만)/;
        
        // 각 요청 문장에 대해 처리
        let lastProductIndex: number | null = null;
        
        for (const sentence of sentences) {
          let linked = false;
          let targetCandidateIndex: number | null = null;
          
          // 2-1) 문장에 productCandidate.name이 포함되어 있으면
          //      해당 상품의 requests에만 연결 (confidence 1.0)
          for (let i = 0; i < candidates.length; i++) {
            if (sentence.includes(candidates[i].name)) {
              targetCandidateIndex = i;
              linked = true;
              break;
            }
          }
          
          // 2-2) 지시어가 있고 직전에 등장한 상품 candidate가 있으면
          //      그 상품에 연결 (confidence 0.9)
          if (!linked && demonstrativePattern.test(sentence) && lastProductIndex !== null) {
            targetCandidateIndex = lastProductIndex;
            linked = true;
          }
          
          // 2-3) 특정 상품에 연결된 경우
          if (linked && targetCandidateIndex !== null) {
            const candidate = candidates[targetCandidateIndex];
            if (!candidate.requests) {
              candidate.requests = [];
            }
            candidate.requests.push(sentence);
            const linkReason = candidates[targetCandidateIndex].name.includes(sentence) 
              ? `상품명 포함으로 연결: ${sentence}`
              : `지시어 패턴으로 연결: ${sentence}`;
            if (candidate.requestReason) {
              candidate.requestReason += `, ${linkReason}`;
            } else {
              candidate.requestReason = linkReason;
            }
            lastProductIndex = targetCandidateIndex;
          } else {
            // 3) 전역 요청으로 분류: 모든 상품에 requests로 연결 (confidence 0.7)
            candidates.forEach(candidate => {
              if (!candidate.requests) {
                candidate.requests = [];
              }
              candidate.requests.push(sentence);
              if (candidate.requestReason) {
                candidate.requestReason += `, 전역 요청으로 연결: ${sentence}`;
              } else {
                candidate.requestReason = `전역 요청으로 연결: ${sentence}`;
              }
            });
          }
        }
        
        // requests가 비어있는 candidate는 requests 필드를 undefined로 설정
        candidates.forEach(candidate => {
          if (candidate.requests && candidate.requests.length === 0) {
            candidate.requests = undefined;
          }
        });
      }
    } catch (error) {
      // 4) 요청사항 연결 중 오류 발생 시
      //    기존 방식(모든 상품에 동일 requestText 복제)을 그대로 유지
      console.warn('[F-1] WARNING: requestText 처리 중 오류 발생, 기존 방식으로 복귀:', error);
      candidates.forEach(candidate => {
        candidate.requests = [input.requestText.trim()];
        candidate.requestReason = `오류 복귀 로직: 전체 요청 텍스트 복제: ${input.requestText.trim()}`;
      });
    }
  }
  
  // ============================================================================
  // F-1 후처리: Confidence 재계산
  // ============================================================================
  candidates.forEach(candidate => {
    let confidence = candidate.confidence;
    
    // baseScore 계산
    if (candidate.name.length >= 4) {
      confidence += 0.4;
    } else if (candidate.name.length >= 3) {
      confidence += 0.3;
    } else if (candidate.name.length >= 2) {
      confidence += 0.2;
    }
    
    // nounScore 계산
    const nounPattern = /(기|기기|용품|세트|박스|팩|병|개|대|장)/;
    if (nounPattern.test(candidate.name)) {
      confidence += 0.3;
    }
    
    // quantityBonus 계산
    if (candidate.quantity !== null) {
      confidence += 0.2;
    }
    
    // penalty 계산
    if (candidate.name.length === 1) {
      confidence -= 0.2;
    }
    
    // 숫자만으로 구성된 name인지 확인
    if (/^\d+$/.test(candidate.name)) {
      confidence -= 0.3;
    }
    
    // 0.0 ~ 1.0 범위로 clamp
    candidate.confidence = Math.max(0.0, Math.min(1.0, confidence));
  });
  
  // 원문 정보는 productSourceText를 사용 (상품과 옵션의 위치를 찾기 위해)
  const originalText = input.productSourceText || input.requestText || '';
  
  // ============================================================================
  // F-2: OptionResolver 호출
  // ============================================================================
  const f2OptionResolution = resolveOptionsF2(candidates, input.optionTokens, originalText);
  let candidatesAfterF2 = f2OptionResolution.candidates;
  
  // ============================================================================
  // 위치 기반 인접성 규칙: 옵션 텍스트와 RequestType=ETC 요청을 가장 가까운 ProductCandidate에만 귀속
  // ============================================================================
  if (candidatesAfterF2.length > 1 && originalText) {
    // 다상품일 경우에만 위치 기반 귀속 적용
    candidatesAfterF2 = applyProximityBasedAttribution(
      candidatesAfterF2,
      input.optionTokens,
      originalText
    );
  }
  
  // ============================================================================
  // F-3: Common Option Merge
  // ============================================================================
  // 동일 옵션 문자열(정규화 기준)인 경우에만 옵션을 병합하고,
  // 상품별 quantity/option/request는 절대 수정하지 않은 채 공통옵션만 분리·계산
  const f3CommonOptionMerge = mergeCommonOptions(candidatesAfterF2);
  let candidatesAfterF3 = f3CommonOptionMerge.candidates;
  // commonOptions는 분리되어 계산되었지만, candidates는 원본 그대로 유지됨
  
  // ============================================================================
  // F-2: 단일/다중 판단
  // ============================================================================
  const isSingle: boolean = candidatesAfterF3.length === 1;
  
  // ============================================================================
  // F-3: 수량 해석
  // ============================================================================
  const quantityResolution = resolveQuantity(candidatesAfterF3, input.quantityHint);
  let resolvedCandidates = quantityResolution.candidates;
  
  // ============================================================================
  // F-4: 옵션 해석
  // ============================================================================
  const optionResolution = resolveOptions(resolvedCandidates, input.optionTokens, originalText);
  resolvedCandidates = optionResolution.candidates;
  
  // F-2 판단을 다시 수행 (수량/옵션 해석 후)
  const finalIsSingle = resolvedCandidates.length === 1;
  
  // confidence 계산: quantity와 option resolution의 confidence를 평균
  const confidence = ((quantityResolution.confidence ?? 0) + (optionResolution.confidence ?? 0)) / 2;
  
  // ============================================================================
  // Status 판단 로직
  // ============================================================================
  resolvedCandidates.forEach(candidate => {
    const statusReasons: string[] = [];
    let confirmedCount = 0;
    
    // 조건 1: confidence >= 0.7
    if (candidate.confidence >= 0.7) {
      confirmedCount++;
      statusReasons.push('confidence >= 0.7');
    }
    
    // 조건 2: quantity !== null
    if (candidate.quantity !== null) {
      confirmedCount++;
      statusReasons.push('quantity exists');
    }
    
    // 조건 3: option 또는 options 존재
    if (candidate.option !== undefined || (candidate.options !== undefined && candidate.options.length > 0)) {
      confirmedCount++;
      statusReasons.push('option/options exist');
    }
    
    // 조건 4: requests 중 상품별로 연결된 요청 존재
    if (candidate.requests !== undefined && candidate.requests.length > 0) {
      confirmedCount++;
      statusReasons.push('requests exist');
    }
    
    // Status 결정
    if (confirmedCount >= 2) {
      candidate.status = 'CONFIRMED';
    } else if (candidate.confidence >= 0.4) {
      candidate.status = 'WARNING';
    } else {
      candidate.status = 'INVALID';
    }
    
    // statusReason 설정
    candidate.statusReason = statusReasons;
  });
  
  // ============================================================================
  // 행위/요청 차단 Gate 로직
  // ============================================================================
  const actionRequestKeywords = [
    '배송', '보내', '발송', '전화', '연락', '문의', '요청', '부탁', '주문', '확인',
    '해주세요', '부탁드립니다', '바랍니다', '가능하면', '하세요'
  ];
  
  resolvedCandidates.forEach(candidate => {
    // candidate.name 또는 연결된 request 문장에서 키워드 검사
    let hasActionRequestKeyword = false;
    
    // candidate.name에서 키워드 검사
    if (candidate.name) {
      for (const keyword of actionRequestKeywords) {
        if (candidate.name.includes(keyword)) {
          hasActionRequestKeyword = true;
          break;
        }
      }
    }
    
    // candidate.requests에서 키워드 검사
    if (!hasActionRequestKeyword && candidate.requests) {
      const allRequests = candidate.requests.join(' ');
      for (const keyword of actionRequestKeywords) {
        if (allRequests.includes(keyword)) {
          hasActionRequestKeyword = true;
          break;
        }
      }
    }
    
    // 키워드가 발견된 경우 처리
    if (hasActionRequestKeyword) {
      // 1) status가 CONFIRMED면 WARNING으로 하향
      if (candidate.status === 'CONFIRMED') {
        candidate.status = 'WARNING';
      }
      
      // 2) confidence < 0.4면 INVALID로 설정
      if (candidate.confidence < 0.4) {
        candidate.status = 'INVALID';
      }
      
      // 3) statusReason에 "action_or_request_detected" 추가 (기존 배열 유지하며 append)
      if (!candidate.statusReason) {
        candidate.statusReason = [];
      }
      candidate.statusReason.push('action_or_request_detected');
    }
  });
  
  // ============================================================================
  // extractProductsFromRequestText 결과 병합 및 중복 제거
  // ============================================================================
  const requestTextCandidates = extractProductsFromRequestText(input.requestText || '');
  
  // 중복 제거: productName과 quantity가 동일한 경우 기존 후보(resolvedCandidates)를 우선 유지
  const mergedCandidates: ProductCandidate[] = [...resolvedCandidates];
  const existingKeys = new Set<string>();
  
  // 기존 후보들의 키 생성 (productName + quantity)
  resolvedCandidates.forEach(candidate => {
    const key = `${candidate.name}|${candidate.quantity ?? 'null'}`;
    existingKeys.add(key);
  });
  
  // requestText에서 추출된 후보 중 중복이 아닌 것만 추가
  requestTextCandidates.forEach(candidate => {
    const key = `${candidate.name}|${candidate.quantity ?? 'null'}`;
    if (!existingKeys.has(key)) {
      mergedCandidates.push(candidate);
      existingKeys.add(key);
    }
  });
  
  // 병합된 후보 기준으로 isSingle 재계산
  const mergedIsSingle = mergedCandidates.length === 1;
  
  return {
    candidates: mergedCandidates,
    isSingle: mergedIsSingle,
    confidence,
  };
}

/**
 * F-3: Quantity Resolution function
 * 
 * Resolves quantities for product candidates based on quantity hint
 * 
 * @param candidates - Product candidates to resolve quantities for
 * @param quantityHint - Quantity hint string from E pipeline
 * @returns QuantityResolution with candidates having resolved quantities
 */
export function resolveQuantity(
  candidates: ProductCandidate[],
  quantityHint: string
): QuantityResolution {
  // ============================================================================
  // F-3: 수량 해석
  // ============================================================================
  // quantityHint 우선 적용, 불명확 시 null+WARNING 처리
  
  const resolvedCandidates: ProductCandidate[] = candidates.map(candidate => ({
    ...candidate,
  }));
  
  // quantityHint가 null 또는 undefined인 경우 빈 문자열로 정규화
  const safeQuantityHint = quantityHint ?? '';
  
  // safeQuantityHint가 비어있거나 공백만 있는 경우
  if (safeQuantityHint.trim().length === 0) {
    // 모든 candidate의 quantity를 null로 설정하고 confidence를 낮춤
    resolvedCandidates.forEach(candidate => {
      candidate.quantity = null;
      candidate.quantityReason = 'quantityHint가 비어있음';
    });
    console.warn('[F-3] WARNING: quantityHint가 비어있어 수량을 확정할 수 없습니다.');
    return {
      candidates: resolvedCandidates,
      confidence: 0,
    };
  }
  
  const trimmedHint = safeQuantityHint.trim();
  
  // 숫자 추출 패턴: 다양한 한국어 수량 표현 지원
  // 예: "2개", "3개씩", "각 1개", "1대", "2박스", "5장", "10개", "각각 2개" 등
  const quantityPatterns = [
    /각\s*(\d+)\s*개/g,           // "각 1개", "각2개"
    /각각\s*(\d+)\s*개/g,         // "각각 2개"
    /(\d+)\s*개씩/g,              // "3개씩"
    /(\d+)\s*개/g,                // "2개", "10개"
    /(\d+)\s*대/g,                // "1대", "2대"
    /(\d+)\s*박스/g,              // "2박스", "3박스"
    /(\d+)\s*장/g,                // "5장", "10장"
    /(\d+)\s*병/g,                // "1병", "2병"
    /(\d+)\s*팩/g,                // "1팩", "2팩"
    /(\d+)\s*세트/g,              // "1세트", "2세트"
    /(\d+)\s*벌/g,                // "1벌", "2벌"
    /(\d+)\s*케이스/g,            // "1케이스", "2케이스"
    /(\d+)/g,                     // 단순 숫자
  ];
  
  const extractedQuantities: number[] = [];
  
  // 각 패턴으로 수량 추출 시도
  for (const pattern of quantityPatterns) {
    const matches = [...trimmedHint.matchAll(pattern)];
    if (matches.length > 0) {
      for (const match of matches) {
        const quantity = parseInt(match[1], 10);
        if (!isNaN(quantity) && quantity > 0) {
          extractedQuantities.push(quantity);
        }
      }
      // 첫 번째 성공한 패턴에서 추출한 수량만 사용
      break;
    }
  }
  
  // 수량을 추출하지 못한 경우
  if (extractedQuantities.length === 0) {
    // 모든 candidate의 quantity를 null로 설정하고 confidence를 낮춤
    resolvedCandidates.forEach(candidate => {
      candidate.quantity = null;
      candidate.quantityReason = `quantityHint "${safeQuantityHint}"에서 수량 추출 실패`;
    });
    console.warn(`[F-3] WARNING: quantityHint "${safeQuantityHint}"에서 수량을 추출할 수 없습니다.`);
    return {
      candidates: resolvedCandidates,
      confidence: 0,
    };
  }
  
  // "각" 또는 "각각" 키워드가 있는 경우: 모든 candidate에 동일한 수량 할당
  if (/각|각각/.test(trimmedHint)) {
    const quantity = extractedQuantities[0];
    resolvedCandidates.forEach(candidate => {
      candidate.quantity = quantity;
      candidate.quantityReason = `"각/각각" 키워드로 모든 후보에 동일 수량 할당: ${quantity}`;
    });
    return {
      candidates: resolvedCandidates,
      confidence: 1.0,
    };
  }
  
  // candidates 개수와 추출된 수량 개수 비교
  if (extractedQuantities.length === resolvedCandidates.length) {
    // 1:1 매칭 가능한 경우
    resolvedCandidates.forEach((candidate, index) => {
      candidate.quantity = extractedQuantities[index];
      candidate.quantityReason = `1:1 매칭으로 할당: ${extractedQuantities[index]}`;
    });
    return {
      candidates: resolvedCandidates,
      confidence: 1.0,
    };
  } else if (extractedQuantities.length === 1 && resolvedCandidates.length > 1) {
    // 단일 수량이 여러 candidate에 적용되는 경우 (예: "2개"가 여러 상품에 적용)
    // 모든 candidate에 동일한 수량 할당
    const quantity = extractedQuantities[0];
    resolvedCandidates.forEach(candidate => {
      candidate.quantity = quantity;
      candidate.quantityReason = `단일 수량을 모든 후보에 할당: ${quantity}`;
    });
    return {
      candidates: resolvedCandidates,
      confidence: 0.7, // 다소 불확실하지만 합리적인 추론
    };
  } else if (extractedQuantities.length > resolvedCandidates.length) {
    // 추출된 수량이 candidate보다 많은 경우: 앞의 수량만 사용
    resolvedCandidates.forEach((candidate, index) => {
      candidate.quantity = extractedQuantities[index];
      candidate.quantityReason = `추출 수량이 후보보다 많아 앞의 수량만 사용: ${extractedQuantities[index]}`;
    });
    console.warn(`[F-3] WARNING: quantityHint "${safeQuantityHint}"에서 추출된 수량(${extractedQuantities.length}개)이 candidate(${resolvedCandidates.length}개)보다 많습니다. 앞의 수량만 사용합니다.`);
    return {
      candidates: resolvedCandidates,
      confidence: 0.6,
    };
  } else {
    // 추출된 수량이 candidate보다 적은 경우: 불명확
    // 모든 candidate의 quantity를 null로 설정하고 confidence를 낮춤
    resolvedCandidates.forEach(candidate => {
      candidate.quantity = null;
      candidate.quantityReason = `추출 수량(${extractedQuantities.length}개)이 후보(${resolvedCandidates.length}개)보다 적어 수량 확정 불가`;
    });
    console.warn(`[F-3] WARNING: quantityHint "${safeQuantityHint}"에서 추출된 수량(${extractedQuantities.length}개)이 candidate(${resolvedCandidates.length}개)보다 적어 수량을 확정할 수 없습니다.`);
    return {
      candidates: resolvedCandidates,
      confidence: 0,
    };
  }
}

/**
 * Option Resolution Result type
 * Represents the result of option resolution for product candidates
 */
export type OptionResolution = {
  /**
   * Product candidates with resolved options
   */
  candidates: ProductCandidate[];
  
  /**
   * Confidence score for the option resolution
   */
  confidence: number;
};

/**
 * F-4: Option Resolution function
 * 
 * Resolves options for product candidates based on option tokens
 * 
 * @param candidates - Product candidates to resolve options for
 * @param optionTokens - Option tokens from E pipeline
 * @param originalText - Original text for proximity checking (optional)
 * @returns OptionResolution with candidates having resolved options
 */
export function resolveOptions(
  candidates: ProductCandidate[],
  optionTokens: string[],
  originalText?: string
): OptionResolution {
  // ============================================================================
  // F-4: 옵션 해석
  // ============================================================================
  // optionTokens를 분석하여 각 candidate에 대한 옵션을 연결하는 로직
  // - 단일 상품: optionTokens를 그대로 연결
  // - 다중 상품: 각 candidate에 optionTokens를 복제 연결 (추론 없이)
  
  const resolvedCandidates: ProductCandidate[] = candidates.map(candidate => ({
    ...candidate,
  }));
  
  // optionTokens가 비어있는 경우
  if (!optionTokens || optionTokens.length === 0) {
    return {
      candidates: resolvedCandidates,
      confidence: 1.0,
    };
  }
  
  // 단일 상품인 경우: optionTokens를 그대로 연결 (기존 로직 유지)
  if (candidates.length === 1) {
    const candidate = resolvedCandidates[0];
    
    if (optionTokens.length === 1) {
      // 단일 옵션: option 필드 사용
      candidate.option = optionTokens[0];
      candidate.optionReason = `단일 상품에 단일 옵션 연결: ${optionTokens[0]}`;
    } else {
      // 다중 옵션: options 필드 사용
      candidate.options = [...optionTokens];
      candidate.optionReason = `단일 상품에 다중 옵션 연결: ${optionTokens.join(', ')}`;
    }
    
    return {
      candidates: resolvedCandidates,
      confidence: 1.0,
    };
  }
  
  // 다중 상품인 경우: 새로운 로직 적용
  try {
    // 각 optionToken에 대해 연결할 상품을 찾기
    const optionToProductMap = new Map<string, number>(); // optionToken -> candidate index
    const unlinkedOptions: string[] = []; // 어떤 상품과도 연결되지 않은 옵션들
    
    // 원문에서 위치 정보 추출 (원문이 있는 경우)
    const getTokenPositions = (text: string, token: string): number[] => {
      if (!text || !token) return [];
      const positions: number[] = [];
      let index = text.indexOf(token);
      while (index >= 0) {
        positions.push(index);
        index = text.indexOf(token, index + 1);
      }
      return positions;
    };
    
    const getProductPositions = (text: string, productName: string): number[] => {
      if (!text || !productName) return [];
      const positions: number[] = [];
      let index = text.indexOf(productName);
      while (index >= 0) {
        positions.push(index);
        index = text.indexOf(productName, index + 1);
      }
      return positions;
    };
    
    // 원문 기준 5자 이내 인접 확인
    const isNearbyInText = (text: string, token1: string, token2: string): boolean => {
      if (!text || !token1 || !token2) return false;
      
      const token1Positions = getTokenPositions(text, token1);
      const token2Positions = getTokenPositions(text, token2);
      
      // 각 위치 쌍에 대해 거리 확인
      for (const pos1 of token1Positions) {
        const token1End = pos1 + token1.length;
        for (const pos2 of token2Positions) {
          const token2End = pos2 + token2.length;
          
          // 두 토큰 사이의 최소 거리 계산
          const distance = Math.min(
            Math.abs(pos1 - token2End),
            Math.abs(pos2 - token1End),
            Math.abs(pos1 - pos2),
            Math.abs(token1End - token2End)
          );
          
          if (distance <= 5) {
            return true;
          }
        }
      }
      
      return false;
    };
    
    // 각 optionToken을 순회하면서 연결할 상품 찾기
    for (const optionToken of optionTokens) {
      let linked = false;
      
      // 각 candidate와 비교
      for (let i = 0; i < resolvedCandidates.length; i++) {
        const candidate = resolvedCandidates[i];
        const productName = candidate.name;
        
        // 조건 1: 문자열 포함 관계 확인
        const isIncluded = productName.includes(optionToken) || optionToken.includes(productName);
        
        // 조건 2: 원문 기준 5자 이내 인접 확인 (원문이 있는 경우)
        const isNearby = originalText ? isNearbyInText(originalText, optionToken, productName) : false;
        
        // 포함 관계이거나 인접한 경우 해당 상품에 연결
        if (isIncluded || isNearby) {
          optionToProductMap.set(optionToken, i);
          linked = true;
          break; // 첫 번째 매칭되는 상품에 연결
        }
      }
      
      // 어떤 상품과도 연결되지 않은 경우
      if (!linked) {
        unlinkedOptions.push(optionToken);
      }
    }
    
    // 각 candidate의 옵션 초기화
    resolvedCandidates.forEach(candidate => {
      candidate.option = undefined;
      candidate.options = undefined;
      candidate.optionReason = undefined;
    });
    
    // 연결된 옵션을 해당 상품에만 할당 (confidence 1.0)
    for (const [optionToken, candidateIndex] of optionToProductMap.entries()) {
      const candidate = resolvedCandidates[candidateIndex];
      
      if (!candidate.options) {
        candidate.options = [];
      }
      candidate.options.push(optionToken);
      if (candidate.optionReason) {
        candidate.optionReason += `, 포함/인접 관계로 연결: ${optionToken}`;
      } else {
        candidate.optionReason = `포함/인접 관계로 연결: ${optionToken}`;
      }
    }
    
    // 공통 옵션을 모든 상품에 복제 (confidence 0.6)
    if (unlinkedOptions.length > 0) {
      resolvedCandidates.forEach(candidate => {
        if (!candidate.options) {
          candidate.options = [];
        }
        candidate.options.push(...unlinkedOptions);
        if (candidate.optionReason) {
          candidate.optionReason += `, 공통 옵션으로 복제: ${unlinkedOptions.join(', ')}`;
        } else {
          candidate.optionReason = `공통 옵션으로 복제: ${unlinkedOptions.join(', ')}`;
        }
      });
    }
    
    // 단일 옵션인 경우 option 필드로 변환
    resolvedCandidates.forEach(candidate => {
      if (candidate.options && candidate.options.length === 1) {
        candidate.option = candidate.options[0];
        candidate.options = undefined;
      }
    });
    
    // confidence 계산: 연결된 옵션이 있으면 1.0, 공통 옵션만 있으면 0.6
    const hasLinkedOptions = optionToProductMap.size > 0;
    const hasCommonOptions = unlinkedOptions.length > 0;
    
    let confidence = 1.0;
    if (hasCommonOptions && !hasLinkedOptions) {
      confidence = 0.6;
    } else if (hasCommonOptions && hasLinkedOptions) {
      // 연결된 옵션과 공통 옵션이 모두 있는 경우 가중 평균
      const linkedRatio = optionToProductMap.size / optionTokens.length;
      const commonRatio = unlinkedOptions.length / optionTokens.length;
      confidence = linkedRatio * 1.0 + commonRatio * 0.6;
    }
    
    return {
      candidates: resolvedCandidates,
      confidence,
    };
  } catch (error) {
    // 오류 발생 시 기존 로직 결과 반환
    console.warn('[F-4] WARNING: 다중 상품 옵션 해석 중 오류 발생, 기존 로직으로 복귀:', error);
    
    // 기존 로직: 각 candidate에 optionTokens를 복제 연결
    resolvedCandidates.forEach(candidate => {
      if (optionTokens.length === 1) {
        candidate.option = optionTokens[0];
        candidate.optionReason = `오류 복귀 로직: 단일 옵션 복제 연결: ${optionTokens[0]}`;
      } else {
        candidate.options = [...optionTokens];
        candidate.optionReason = `오류 복귀 로직: 다중 옵션 복제 연결: ${optionTokens.join(', ')}`;
      }
    });
    
    return {
      candidates: resolvedCandidates,
      confidence: 1.0,
    };
  }
}

