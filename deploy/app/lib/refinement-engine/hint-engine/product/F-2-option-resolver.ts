/**
 * F-2: Option Resolver
 * 
 * 옵션 후보 생성, 상품 연결(포함/원문 5자 이내), 공통 옵션 처리, 옵션 confidence/status 계산을 담당
 * 
 * ⚠️ 중요 규칙:
 * - product/quantity/request 로직은 절대 수정하지 않음
 * - 옵션 실패 시에도 후보 삭제는 하지 않음
 */

import type { ProductCandidate } from '@/app/lib/refinement-engine/hint-engine/f-product-resolver';

/**
 * Option Type enumeration
 * Represents the classification of option types
 */
export enum OptionType {
  /** 상품 변형 옵션 (색상, 사이즈 등) */
  VARIANT = 'VARIANT',
  /** 묶음 상품 옵션 */
  BUNDLE = 'BUNDLE',
  /** 상태 옵션 (신품, 중고 등) */
  STATE = 'STATE',
  /** 배송 옵션 */
  DELIVERY = 'DELIVERY',
  /** 기타 옵션 */
  ETC = 'ETC',
}

/**
 * Request Type enumeration
 * Represents the classification of request types
 */
export enum RequestType {
  /** 배송 관련 요청 */
  DELIVERY = 'DELIVERY',
  /** 연락 관련 요청 */
  CONTACT = 'CONTACT',
  /** 포장 관련 요청 */
  PACKING = 'PACKING',
  /** 기타 요청 */
  ETC = 'ETC',
}

import type { RequestWithType } from '@/app/lib/refinement-engine/types/RequestWithType';

/**
 * 요청사항 타입 분류
 * 
 * @param requestText - 요청 텍스트
 * @returns RequestType classification
 */
function classifyRequestType(requestText: string): RequestType {
  const trimmed = requestText.trim().toLowerCase();
  
  // DELIVERY 타입 키워드: 배송/문앞/빠르게/택배/발송
  const deliveryKeywords = ['배송', '문앞', '빠르게', '택배', '발송'];
  if (deliveryKeywords.some(keyword => trimmed.includes(keyword))) {
    return RequestType.DELIVERY;
  }
  
  // CONTACT 타입 키워드: 연락/전화/문자/카톡
  const contactKeywords = ['연락', '전화', '문자', '카톡'];
  if (contactKeywords.some(keyword => trimmed.includes(keyword))) {
    return RequestType.CONTACT;
  }
  
  // PACKING 타입 키워드: 포장/동봉/제외/빼고
  const packingKeywords = ['포장', '동봉', '제외', '빼고'];
  if (packingKeywords.some(keyword => trimmed.includes(keyword))) {
    return RequestType.PACKING;
  }
  
  // 기본값: ETC
  return RequestType.ETC;
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
 * Option Candidate type
 * Represents an option candidate with its connection information
 */
interface OptionCandidate {
  /**
   * Option token value
   */
  token: string;
  
  /**
   * Option type classification
   */
  optionType: OptionType;
  
  /**
   * Connected product candidate index (if linked)
   */
  productIndex: number | null;
  
  /**
   * Whether this option is linked to a specific product
   */
  isLinked: boolean;
  
  /**
   * Connection confidence (1.0 for linked, 0.6 for common)
   */
  connectionConfidence: number;
  
  /**
   * Link score for conflict resolution (optional)
   */
  linkScore?: number;
}

/**
 * 수량 패턴 감지 및 추출
 * 
 * 옵션 텍스트에서 수량 패턴(숫자 + 단위)을 감지하고 숫자 값을 추출
 * 
 * @param text - 수량 패턴을 검사할 텍스트
 * @returns 수량 값과 패턴이 감지되었는지 여부를 포함한 객체
 */
function extractQuantityFromText(text: string): { quantity: number | null; matched: boolean } {
  if (!text || text.trim().length === 0) {
    return { quantity: null, matched: false };
  }
  
  const trimmed = text.trim();
  
  // 수량 패턴: 숫자 + 단위 (개/EA/세트/대/장/박스/묶음/팩/통/병/봉/단/벌/케이스/CASE 등)
  // 패턴 예시: "5개", "3EA", "2세트", "10EA.", "1개" 등
  const quantityPattern = /(\d+)\s*(개|EA|ea|EA\.|ea\.|세트|SET|set|SET\.|set\.|대|장|박스|팩|통|병|봉|묶음|단|벌|케이스|CASE|case|CASE\.|case\.)/i;
  
  const match = trimmed.match(quantityPattern);
  if (match && match[1]) {
    const quantity = parseInt(match[1], 10);
    if (!isNaN(quantity) && quantity > 0) {
      return { quantity, matched: true };
    }
  }
  
  return { quantity: null, matched: false };
}

/**
 * F-2: Option Resolver function
 * 
 * 옵션 후보 생성, 상품 연결(포함/원문 5자 이내), 공통 옵션 처리, 옵션 confidence/status 계산
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
  // 0. 옵션 토큰 필터링
  // ============================================================================
  const { validOptionTokens, requestTokens } = filterOptionTokens(optionTokens);
  
  // 제외된 옵션들을 requests에 추가
  if (requestTokens.length > 0) {
    candidates.forEach(candidate => {
      if (!candidate.requests) {
        candidate.requests = [];
      }
      const requestsWithType = requestTokens.map(token => ({
        text: token,
        requestType: classifyRequestType(token),
      }));
      candidate.requests.push(...requestsWithType);
    });
  }
  
  // ============================================================================
  // 0.5. 숫자만/단위만 옵션 제외
  // ============================================================================
  const filteredOptionTokens = filterInvalidOptions(validOptionTokens);
  
  // ============================================================================
  // 1. 옵션 후보 생성 및 타입 분류
  // ============================================================================
  const optionCandidates: OptionCandidate[] = generateOptionCandidates(filteredOptionTokens);
  
  // optionTokens가 비어있는 경우
  if (optionCandidates.length === 0) {
    const resolvedCandidates: ProductCandidate[] = candidates.map(candidate => ({
      ...candidate,
    }));
    return {
      candidates: resolvedCandidates,
      confidence: 1.0,
    };
  }
  
  // 단일 상품인 경우: filteredOptionTokens를 그대로 연결
  if (candidates.length === 1) {
    const filteredTokens = optionCandidates.map(opt => opt.token);
    return handleSingleProduct(candidates, filteredTokens);
  }
  
  // 다중 상품인 경우: 상품 연결 및 공통 옵션 처리
  return handleMultipleProducts(candidates, optionCandidates, originalText);
}

/**
 * 옵션 토큰 필터링
 * 
 * 옵션 토큰 중 '색상/용량/규격/구성/사이즈/모델' 패턴만 option 후보로 인정하고,
 * '해주세요/주문/배송/으로/해주세요.'가 포함된 문장은 option 후보에서 제외하여 request로 분류
 * 
 * @param optionTokens - Option tokens from E pipeline
 * @returns Object with validOptionTokens and requestTokens
 */
function filterOptionTokens(optionTokens: string[]): {
  validOptionTokens: string[];
  requestTokens: string[];
} {
  if (!optionTokens || optionTokens.length === 0) {
    return { validOptionTokens: [], requestTokens: [] };
  }
  
  // 옵션 패턴: '색상/용량/규격/구성/사이즈/모델' 포함 여부 확인
  const optionPatterns = /(색상|용량|규격|구성|사이즈|모델)/;
  
  // request 패턴: '해주세요/주문/배송/으로/해주세요.' 포함 여부 확인
  const requestPatterns = /(해주세요|주문|배송|으로|해주세요\.)/;
  
  const validOptionTokens: string[] = [];
  const requestTokens: string[] = [];
  
  for (const token of optionTokens) {
    const trimmedToken = token.trim();
    
    // request 패턴이 포함된 경우 request로 분류
    if (requestPatterns.test(trimmedToken)) {
      requestTokens.push(trimmedToken);
      continue;
    }
    
    // 옵션 패턴이 포함된 경우만 option 후보로 인정
    if (optionPatterns.test(trimmedToken)) {
      validOptionTokens.push(trimmedToken);
    } else {
      // 패턴에 맞지 않는 경우 request로 분류
      requestTokens.push(trimmedToken);
    }
  }
  
  return { validOptionTokens, requestTokens };
}

/**
 * 숫자만/단위만 옵션 필터링
 * 
 * 숫자만 또는 단위만으로 구성된 옵션은 후보에서 제외
 * 
 * @param optionTokens - Option tokens to filter
 * @returns Filtered option tokens
 */
function filterInvalidOptions(optionTokens: string[]): string[] {
  if (!optionTokens || optionTokens.length === 0) {
    return [];
  }
  
  // 숫자만 패턴
  const numberOnlyPattern = /^[0-9]+$/;
  
  // 단위만 패턴 (일반적인 단위 키워드)
  const unitOnlyPattern = /^(개|장|세트|EA|ea|EA\.|ea\.|SET|set|SET\.|set\.|박스|팩|통|병|봉|묶음|단|벌|케이스|CASE|case|ml|mL|ML|L|l|kg|KG|Kg|g|G|cm|CM|Cm|m|M|mm|MM|Mm|inch|INCH|Inch|ft|FT|Ft)$/;
  
  return optionTokens.filter(token => {
    const trimmed = token.trim();
    if (!trimmed) return false;
    
    // 숫자만인 경우 제외
    if (numberOnlyPattern.test(trimmed)) {
      return false;
    }
    
    // 단위만인 경우 제외
    if (unitOnlyPattern.test(trimmed)) {
      return false;
    }
    
    return true;
  });
}

/**
 * 요청성 문장 패턴 감지
 * 
 * 옵션 문자열에 요청성 문구("해주세요/부탁/요청/동사형")가 포함되어 있는지 확인
 * 
 * @param option - 옵션 문자열
 * @returns 요청성 문구가 포함되어 있으면 true
 */
function isRequestPattern(option: string): boolean {
  if (!option || option.trim().length === 0) {
    return false;
  }
  
  const trimmed = option.trim();
  
  // 요청 키워드 포함 패턴: 문자열 어디에서든 요청 키워드가 포함되면 감지
  const requestKeywordsPattern = /(해주세요|해주시길|해주시기|해주시면|해주시고|해줘|해주셔|해주시|부탁드립니다|부탁합니다|부탁해|부탁|요청합니다|요청해|요청|주문해주세요|주문해|주문|배송해주세요|배송해|원합니다|원해|원함)/;
  
  // 동사형 패턴: 문자열 끝에 요청 동사 어미가 있는지 확인
  // 주의: 너무 일반적인 패턴은 피하고, 명확한 요청 동사 어미만 포함
  const verbEndingsPattern = /(해주세요|해주시길|해주시기|해주시면|해주시고|해줘|해주셔|드립니다|합니다|해요|요|주세요|주시길|주시기|주시면|주시고)$/;
  
  return requestKeywordsPattern.test(trimmed) || verbEndingsPattern.test(trimmed);
}

/**
 * 옵션 타입 분류
 * 
 * @param token - Option token to classify
 * @returns OptionType classification
 */
function classifyOptionType(token: string): OptionType {
  const trimmed = token.trim().toLowerCase();
  
  // DELIVERY 타입 키워드
  const deliveryKeywords = ['배송', '택배', '직배송', '당일배송', '익일배송', '무료배송', '착불', '선불', 'delivery', 'shipping'];
  if (deliveryKeywords.some(keyword => trimmed.includes(keyword))) {
    return OptionType.DELIVERY;
  }
  
  // STATE 타입 키워드
  const stateKeywords = ['신품', '중고', '새제품', '사용', '미개봉', '개봉', 'new', 'used', 'refurbished'];
  if (stateKeywords.some(keyword => trimmed.includes(keyword))) {
    return OptionType.STATE;
  }
  
  // BUNDLE 타입 키워드
  const bundleKeywords = ['묶음', '세트', '패키지', '번들', 'bundle', 'set', 'package', 'pack'];
  if (bundleKeywords.some(keyword => trimmed.includes(keyword))) {
    return OptionType.BUNDLE;
  }
  
  // VARIANT 타입 키워드 (색상, 사이즈 등)
  const variantKeywords = ['색상', '색', '사이즈', '크기', '용량', '규격', '모델', '스타일', 'color', 'size', 'model', 'variant'];
  if (variantKeywords.some(keyword => trimmed.includes(keyword))) {
    return OptionType.VARIANT;
  }
  
  // 기본값: ETC
  return OptionType.ETC;
}

/**
 * 옵션 후보 생성 및 타입 분류
 * 
 * @param optionTokens - Filtered option tokens
 * @returns Array of OptionCandidate objects with type classification
 */
function generateOptionCandidates(optionTokens: string[]): OptionCandidate[] {
  if (!optionTokens || optionTokens.length === 0) {
    return [];
  }
  
  return optionTokens.map(token => {
    const trimmed = token.trim();
    return {
      token: trimmed,
      optionType: classifyOptionType(trimmed),
      productIndex: null,
      isLinked: false,
      connectionConfidence: 0.6, // 기본값: 공통 옵션 confidence
    };
  });
}

/**
 * 단일 상품 옵션 처리
 * 
 * @param candidates - Product candidates (should be length 1)
 * @param optionTokens - Option tokens
 * @returns OptionResolution
 */
function handleSingleProduct(
  candidates: ProductCandidate[],
  optionTokens: string[]
): OptionResolution {
  const resolvedCandidates: ProductCandidate[] = candidates.map(candidate => ({
    ...candidate,
  }));
  
  const candidate = resolvedCandidates[0];
  
  if (optionTokens.length === 1) {
    // 단일 옵션: option 필드 사용
    candidate.option = optionTokens[0];
  } else {
    // 다중 옵션: options 필드 사용
    candidate.options = [...optionTokens];
  }
  
  // ============================================================================
  // 옵션에서 수량 패턴 감지 및 정리 (product.options → quantity)
  // ============================================================================
  // option 필드에서 수량 패턴 감지 및 추출
  if (candidate.option) {
    const quantityResult = extractQuantityFromText(candidate.option);
    if (quantityResult.quantity !== null) {
      // quantity가 null이 아니고 후보의 quantity가 null인 경우에만 설정
      if (candidate.quantity === null) {
        candidate.quantity = quantityResult.quantity;
      }
      // 수량 패턴이 포함된 옵션 제거
      candidate.option = undefined;
    }
  }
  
  // options 배열에서 수량 패턴 감지 및 추출
  if (candidate.options && candidate.options.length > 0) {
    const validOptions: string[] = [];
    let extractedQuantity: number | null = null;
    
    candidate.options.forEach(opt => {
      const quantityResult = extractQuantityFromText(opt);
      if (quantityResult.quantity !== null) {
        // quantity 추출 (null이 아니고 아직 추출된 quantity가 없는 경우에만)
        if (extractedQuantity === null && candidate.quantity === null) {
          extractedQuantity = quantityResult.quantity;
        }
        // 수량 패턴이 포함된 옵션은 제거 (validOptions에 추가하지 않음)
      } else {
        // 수량 패턴이 없는 옵션만 유지
        validOptions.push(opt);
      }
    });
    
    // 추출된 quantity가 있으면 설정
    if (extractedQuantity !== null && candidate.quantity === null) {
      candidate.quantity = extractedQuantity;
    }
    
    // 유효한 옵션으로 업데이트
    if (validOptions.length === 0) {
      candidate.options = undefined;
    } else if (validOptions.length === 1) {
      candidate.option = validOptions[0];
      candidate.options = undefined;
    } else {
      candidate.options = validOptions;
    }
  }
  
  // requests에 이미 포함된 토큰을 options에서 중복 제거
  if (candidate.requests && candidate.requests.length > 0) {
    // requests의 텍스트 추출 (RequestWithType 또는 string)
    const requestTexts = new Set(
      candidate.requests.map(req => 
        typeof req === 'string' ? req : req.text
      ).map(text => text.trim().toLowerCase())
    );
    
    // option 필드 체크 및 중복 제거
    if (candidate.option) {
      const optionLower = candidate.option.trim().toLowerCase();
      if (requestTexts.has(optionLower)) {
        candidate.option = undefined;
      }
    }
    
    // options 배열 체크 및 중복 제거
    if (candidate.options && candidate.options.length > 0) {
      const filteredOptions = candidate.options.filter(opt => {
        const optLower = opt.trim().toLowerCase();
        return !requestTexts.has(optLower);
      });
      
      if (filteredOptions.length === 0) {
        candidate.options = undefined;
      } else if (filteredOptions.length === 1) {
        candidate.option = filteredOptions[0];
        candidate.options = undefined;
      } else {
        candidate.options = filteredOptions;
      }
    }
  }
  
  return {
    candidates: resolvedCandidates,
    confidence: 1.0,
  };
}

/**
 * 다중 상품 옵션 처리
 * 
 * @param candidates - Product candidates
 * @param optionCandidates - Option candidates
 * @param originalText - Original text for proximity checking
 * @returns OptionResolution
 */
function handleMultipleProducts(
  candidates: ProductCandidate[],
  optionCandidates: OptionCandidate[],
  originalText?: string
): OptionResolution {
  const resolvedCandidates: ProductCandidate[] = candidates.map(candidate => ({
    ...candidate,
  }));
  
  try {
    // ============================================================================
    // 1.5. 동의어 옵션 병합 (정규화 후 병합, confidence는 max 유지)
    // ============================================================================
    const mergedOptions = mergeSynonymOptions(optionCandidates);
    
    // ============================================================================
    // 2. 상품 연결 (포함/원문 5자 이내)
    // ============================================================================
    const linkedOptions = connectOptionsToProducts(
      mergedOptions,
      resolvedCandidates,
      originalText
    );
    
    // ============================================================================
    // 2.5. 충돌 정리: 동일한 normalizedOptionText+optionType을 가진 옵션 중 linkScore가 가장 높은 것만 유지
    // ============================================================================
    const cleanedOptions = resolveOptionConflicts(linkedOptions);
    
    // ============================================================================
    // 3. 공통 옵션 처리
    // ============================================================================
    // 각 candidate의 옵션 초기화
    resolvedCandidates.forEach(candidate => {
      candidate.option = undefined;
      candidate.options = undefined;
    });
    
    // 연결된 옵션을 해당 상품에만 할당
    cleanedOptions
      .filter(opt => opt.isLinked && opt.productIndex !== null)
      .forEach(opt => {
        const candidate = resolvedCandidates[opt.productIndex!];
        if (!candidate.options) {
          candidate.options = [];
        }
        candidate.options.push(opt.token);
      });
    
    // 공통 옵션을 모든 상품에 복제
    const cleanedCommonOptions = cleanedOptions.filter(opt => !opt.isLinked);
    if (cleanedCommonOptions.length > 0) {
      const commonTokens = cleanedCommonOptions.map(opt => opt.token);
      resolvedCandidates.forEach(candidate => {
        if (!candidate.options) {
          candidate.options = [];
        }
        candidate.options.push(...commonTokens);
      });
    }
    
    // 단일 옵션인 경우 option 필드로 변환
    resolvedCandidates.forEach(candidate => {
      if (candidate.options && candidate.options.length === 1) {
        candidate.option = candidate.options[0];
        candidate.options = undefined;
      }
    });
    
    // ============================================================================
    // 3.5. 옵션에서 요청성 문장 감지 및 제거 (product.options → product.requests)
    // ============================================================================
    resolvedCandidates.forEach(candidate => {
      // option 필드 체크 및 처리
      if (candidate.option && isRequestPattern(candidate.option)) {
        if (!candidate.requests) {
          candidate.requests = [];
        }
        candidate.requests.push({
          text: candidate.option,
          requestType: classifyRequestType(candidate.option),
        });
        candidate.option = undefined;
      }
      
      // options 배열 체크 및 처리
      if (candidate.options && candidate.options.length > 0) {
        const requestOptions: string[] = [];
        const validOptions: string[] = [];
        
        candidate.options.forEach(opt => {
          if (isRequestPattern(opt)) {
            requestOptions.push(opt);
          } else {
            validOptions.push(opt);
          }
        });
        
        // 요청성 옵션을 requests로 이동
        if (requestOptions.length > 0) {
          if (!candidate.requests) {
            candidate.requests = [];
          }
          const requestsWithType = requestOptions.map(opt => ({
            text: opt,
            requestType: classifyRequestType(opt),
          }));
          candidate.requests.push(...requestsWithType);
        }
        
        // 유효한 옵션으로 업데이트
        if (validOptions.length === 0) {
          candidate.options = undefined;
        } else if (validOptions.length === 1) {
          candidate.option = validOptions[0];
          candidate.options = undefined;
        } else {
          candidate.options = validOptions;
        }
      }
    });
    
    // ============================================================================
    // 3.6. 옵션에서 수량 패턴 감지 및 정리 (product.options → quantity)
    // ============================================================================
    resolvedCandidates.forEach(candidate => {
      // option 필드에서 수량 패턴 감지 및 추출
      if (candidate.option) {
        const quantityResult = extractQuantityFromText(candidate.option);
        if (quantityResult.quantity !== null) {
          // quantity가 null이 아니고 후보의 quantity가 null인 경우에만 설정
          if (candidate.quantity === null) {
            candidate.quantity = quantityResult.quantity;
          }
          // 수량 패턴이 포함된 옵션 제거
          candidate.option = undefined;
        }
      }
      
      // options 배열에서 수량 패턴 감지 및 추출
      if (candidate.options && candidate.options.length > 0) {
        const validOptions: string[] = [];
        let extractedQuantity: number | null = null;
        
        candidate.options.forEach(opt => {
          const quantityResult = extractQuantityFromText(opt);
          if (quantityResult.quantity !== null) {
            // quantity 추출 (null이 아니고 아직 추출된 quantity가 없는 경우에만)
            if (extractedQuantity === null && candidate.quantity === null) {
              extractedQuantity = quantityResult.quantity;
            }
            // 수량 패턴이 포함된 옵션은 제거 (validOptions에 추가하지 않음)
          } else {
            // 수량 패턴이 없는 옵션만 유지
            validOptions.push(opt);
          }
        });
        
        // 추출된 quantity가 있으면 설정
        if (extractedQuantity !== null && candidate.quantity === null) {
          candidate.quantity = extractedQuantity;
        }
        
        // 유효한 옵션으로 업데이트
        if (validOptions.length === 0) {
          candidate.options = undefined;
        } else if (validOptions.length === 1) {
          candidate.option = validOptions[0];
          candidate.options = undefined;
        } else {
          candidate.options = validOptions;
        }
      }
      
      // requests에 이미 포함된 토큰을 options에서 중복 제거
      if (candidate.requests && candidate.requests.length > 0) {
        // requests의 텍스트 추출 (RequestWithType 또는 string)
        const requestTexts = new Set(
          candidate.requests.map(req => 
            typeof req === 'string' ? req : req.text
          ).map(text => text.trim().toLowerCase())
        );
        
        // option 필드 체크 및 중복 제거
        if (candidate.option) {
          const optionLower = candidate.option.trim().toLowerCase();
          if (requestTexts.has(optionLower)) {
            candidate.option = undefined;
          }
        }
        
        // options 배열 체크 및 중복 제거
        if (candidate.options && candidate.options.length > 0) {
          const filteredOptions = candidate.options.filter(opt => {
            const optLower = opt.trim().toLowerCase();
            return !requestTexts.has(optLower);
          });
          
          if (filteredOptions.length === 0) {
            candidate.options = undefined;
          } else if (filteredOptions.length === 1) {
            candidate.option = filteredOptions[0];
            candidate.options = undefined;
          } else {
            candidate.options = filteredOptions;
          }
        }
      }
    });
    
    // ============================================================================
    // 4. 옵션 confidence/status 계산
    // ============================================================================
    const confidence = calculateOptionConfidence(cleanedOptions, optionCandidates.length);
    updateCandidateConfidenceAndStatus(resolvedCandidates, cleanedOptions);
    
    return {
      candidates: resolvedCandidates,
      confidence,
    };
  } catch (error) {
    // 오류 발생 시 기존 로직 결과 반환 (후보 삭제하지 않음)
    console.warn('[F-2] WARNING: 다중 상품 옵션 해석 중 오류 발생, 기존 로직으로 복귀:', error);
    
    // 기존 로직: 각 candidate에 optionTokens를 복제 연결
    const optionTokens = optionCandidates.map(opt => opt.token);
    resolvedCandidates.forEach(candidate => {
      if (optionTokens.length === 1) {
        candidate.option = optionTokens[0];
      } else {
        candidate.options = [...optionTokens];
      }
    });
    
    return {
      candidates: resolvedCandidates,
      confidence: 1.0,
    };
  }
}

/**
 * 옵션 정규화 함수 (동의어 병합용)
 * 
 * @param option - 정규화할 옵션 문자열
 * @returns 정규화된 옵션 문자열
 */
function normalizeOptionForMerging(option: string): string {
  if (!option) return '';
  
  // 1. 앞뒤 공백 제거
  let normalized = option.trim();
  
  // 2. 중복 공백 제거
  normalized = normalized.replace(/\s+/g, ' ');
  
  // 3. 소문자 변환 (영문 옵션의 경우)
  normalized = normalized.toLowerCase();
  
  // 4. 특수문자 정규화 (공백, 하이픈, 언더스코어 등)
  normalized = normalized.replace(/[-_]/g, ' ');
  
  // 5. 다시 중복 공백 제거
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * 동의어 옵션 병합
 * 
 * 정규화 후 동일한 옵션은 병합하고, confidence는 max 유지
 * 
 * @param optionCandidates - Option candidates to merge
 * @returns Merged option candidates
 */
function mergeSynonymOptions(optionCandidates: OptionCandidate[]): OptionCandidate[] {
  if (!optionCandidates || optionCandidates.length === 0) {
    return [];
  }
  
  // 정규화된 옵션별로 그룹화
  const normalizedGroups = new Map<string, OptionCandidate[]>();
  
  optionCandidates.forEach(opt => {
    const normalized = normalizeOptionForMerging(opt.token);
    if (!normalizedGroups.has(normalized)) {
      normalizedGroups.set(normalized, []);
    }
    normalizedGroups.get(normalized)!.push(opt);
  });
  
  // 각 그룹에서 대표 옵션 선택 (confidence가 가장 높은 것, 동일하면 첫 번째)
  const merged: OptionCandidate[] = [];
  
  normalizedGroups.forEach(group => {
    if (group.length === 1) {
      // 단일 옵션인 경우 그대로 유지
      merged.push(group[0]);
    } else {
      // 여러 옵션이 정규화 후 동일한 경우 병합
      // confidence는 max 유지
      const maxConfidence = Math.max(...group.map(opt => opt.connectionConfidence));
      
      // 첫 번째 옵션을 대표로 선택 (token은 첫 번째 것 유지)
      const representative = { ...group[0] };
      representative.connectionConfidence = maxConfidence;
      
      merged.push(representative);
    }
  });
  
  return merged;
}

/**
 * linkScore 계산 결과 타입
 */
interface LinkScoreResult {
  score: number;
  charDistance: number;
  hasCoOccurrence: boolean;
  hasProductNameInclusion: boolean;
  optionTypeWeight: number;
}

/**
 * 문자 거리 기반 점수 계산
 * 
 * @param distance - 옵션과 상품 사이의 문자 거리
 * @returns 문자 거리 점수 (0~1)
 */
function calculateCharDistanceScore(distance: number): number {
  if (distance <= 0) return 1.0;
  if (distance <= 3) return 0.9;
  if (distance <= 5) return 0.7;
  if (distance <= 10) return 0.5;
  if (distance <= 20) return 0.3;
  return 0.1;
}

/**
 * 동시등장 점수 계산
 * 
 * @param hasCoOccurrence - 동시등장 여부
 * @returns 동시등장 점수
 */
function calculateCoOccurrenceScore(hasCoOccurrence: boolean): number {
  return hasCoOccurrence ? 0.3 : 0;
}

/**
 * 상품명 포함 점수 계산
 * 
 * @param hasInclusion - 상품명 포함 여부
 * @returns 상품명 포함 점수
 */
function calculateProductNameInclusionScore(hasInclusion: boolean): number {
  return hasInclusion ? 0.4 : 0;
}

/**
 * 옵션 타입 기반 가중치 계산
 * 
 * @param optionType - 옵션 타입
 * @returns 옵션 타입 가중치
 */
function calculateOptionTypeWeight(optionType: OptionType): number {
  // VARIANT: 상품 변형 옵션은 높은 가중치
  if (optionType === OptionType.VARIANT) return 1.0;
  // BUNDLE: 묶음 상품 옵션도 높은 가중치
  if (optionType === OptionType.BUNDLE) return 0.9;
  // STATE: 상태 옵션은 중간 가중치
  if (optionType === OptionType.STATE) return 0.7;
  // DELIVERY: 배송 옵션은 낮은 가중치 (전역 옵션 가능성 높음)
  if (optionType === OptionType.DELIVERY) return 0.5;
  // ETC: 기타 옵션은 중간 가중치
  return 0.6;
}

/**
 * linkScore 계산
 * 
 * @param optionToken - 옵션 토큰
 * @param productName - 상품명
 * @param optionType - 옵션 타입
 * @param originalText - 원문 텍스트
 * @returns linkScore 계산 결과
 */
function calculateLinkScore(
  optionToken: string,
  productName: string,
  optionType: OptionType,
  originalText?: string
): LinkScoreResult {
  // 1. 문자거리 계산
  let charDistance = Infinity;
  let hasCoOccurrence = false;
  
  if (originalText) {
    const optionPositions: number[] = [];
    const productPositions: number[] = [];
    
    let index = originalText.indexOf(optionToken);
    while (index >= 0) {
      optionPositions.push(index);
      index = originalText.indexOf(optionToken, index + 1);
    }
    
    index = originalText.indexOf(productName);
    while (index >= 0) {
      productPositions.push(index);
      index = originalText.indexOf(productName, index + 1);
    }
    
    // 동시등장 확인 (같은 텍스트에 둘 다 존재)
    hasCoOccurrence = optionPositions.length > 0 && productPositions.length > 0;
    
    // 최소 문자거리 계산
    if (hasCoOccurrence) {
      for (const optPos of optionPositions) {
        const optEnd = optPos + optionToken.length;
        for (const prodPos of productPositions) {
          const prodEnd = prodPos + productName.length;
          const distance = Math.min(
            Math.abs(optPos - prodEnd),
            Math.abs(prodPos - optEnd),
            Math.abs(optPos - prodPos),
            Math.abs(optEnd - prodEnd)
          );
          charDistance = Math.min(charDistance, distance);
        }
      }
    }
  }
  
  // 2. 상품명포함 확인
  const hasProductNameInclusion = productName.includes(optionToken) || optionToken.includes(productName);
  
  // 3. 옵션타입 가중치
  const optionTypeWeight = calculateOptionTypeWeight(optionType);
  
  // 4. 각 요소별 점수 계산
  const charDistanceScore = charDistance !== Infinity 
    ? calculateCharDistanceScore(charDistance) 
    : 0;
  const coOccurrenceScore = calculateCoOccurrenceScore(hasCoOccurrence);
  const inclusionScore = calculateProductNameInclusionScore(hasProductNameInclusion);
  
  // 5. 최종 linkScore 계산 (가중 합)
  const baseScore = (charDistanceScore * 0.4) + (coOccurrenceScore) + (inclusionScore * 0.3);
  const linkScore = baseScore * optionTypeWeight;
  
  return {
    score: linkScore,
    charDistance: charDistance !== Infinity ? charDistance : -1,
    hasCoOccurrence,
    hasProductNameInclusion,
    optionTypeWeight,
  };
}

/**
 * 상품 연결 (linkScore 기반)
 * 
 * - linkScore >= 0.7: 강귀속 (해당 상품에만 할당, confidence=1.0)
 * - linkScore >= 0.4: 약귀속 (해당 상품에 할당, confidence=0.8)
 * - linkScore < 0.4: 전역옵션 (모든 상품에 할당, confidence=0.6)
 * 
 * @param optionCandidates - Option candidates to connect
 * @param productCandidates - Product candidates
 * @param originalText - Original text for proximity checking
 * @returns Array of OptionCandidate with connection information
 */
function connectOptionsToProducts(
  optionCandidates: OptionCandidate[],
  productCandidates: ProductCandidate[],
  originalText?: string
): OptionCandidate[] {
  const connectedOptions: OptionCandidate[] = optionCandidates.map(opt => ({ ...opt }));
  
  // 각 optionCandidate를 순회하면서 연결할 상품 찾기
  for (const optionCandidate of connectedOptions) {
    const optionToken = optionCandidate.token;
    const optionType = optionCandidate.optionType;
    
    // 모든 상품에 대해 linkScore 계산
    const productScores: Array<{ index: number; score: LinkScoreResult }> = [];
    
    for (let i = 0; i < productCandidates.length; i++) {
      const productCandidate = productCandidates[i];
      const productName = productCandidate.name;
      
      const linkScore = calculateLinkScore(optionToken, productName, optionType, originalText);
      productScores.push({ index: i, score: linkScore });
    }
    
    // 상품이 없는 경우 전역 옵션으로 처리
    if (productScores.length === 0) {
      optionCandidate.productIndex = null;
      optionCandidate.isLinked = false;
      optionCandidate.connectionConfidence = 0.6;
      continue;
    }
    
    // 최고 linkScore 찾기
    const bestMatch = productScores.reduce((best, current) => 
      current.score.score > best.score.score ? current : best,
      productScores[0]
    );
    
    // linkScore 저장
    optionCandidate.linkScore = bestMatch.score.score;
    
    // linkScore 기준 분기 처리
    if (bestMatch.score.score >= 0.7) {
      // 강귀속: 해당 상품에만 할당
      optionCandidate.productIndex = bestMatch.index;
      optionCandidate.isLinked = true;
      optionCandidate.connectionConfidence = 1.0;
    } else if (bestMatch.score.score >= 0.4) {
      // 약귀속: 해당 상품에 할당 (낮은 confidence)
      optionCandidate.productIndex = bestMatch.index;
      optionCandidate.isLinked = true;
      optionCandidate.connectionConfidence = 0.8;
    } else {
      // 전역옵션: 모든 상품에 할당
      optionCandidate.productIndex = null;
      optionCandidate.isLinked = false;
      optionCandidate.connectionConfidence = 0.6;
    }
  }
  
  return connectedOptions;
}

/**
 * 옵션 충돌 정리
 * 
 * 상품에 연결된 옵션들 중 동일한 normalizedOptionText+optionType을 가진 경우
 * linkScore가 가장 높은 옵션 하나만 유지하고 나머지는 제거
 * DELIVERY/STATE 타입은 제외
 * 
 * @param linkedOptions - Linked option candidates
 * @returns Cleaned option candidates with conflicts resolved
 */
function resolveOptionConflicts(linkedOptions: OptionCandidate[]): OptionCandidate[] {
  // DELIVERY/STATE 타입은 제외하고 연결된 옵션만 필터링
  const linkedOptionsToProcess = linkedOptions.filter(
    opt => opt.isLinked && 
           opt.productIndex !== null && 
           opt.optionType !== OptionType.DELIVERY && 
           opt.optionType !== OptionType.STATE
  );
  
  // 전역 옵션과 DELIVERY/STATE 타입은 그대로 유지
  const globalAndExcludedOptions = linkedOptions.filter(
    opt => !opt.isLinked || 
           opt.productIndex === null || 
           opt.optionType === OptionType.DELIVERY || 
           opt.optionType === OptionType.STATE
  );
  
  // 상품별로 그룹화
  const optionsByProduct = new Map<number, OptionCandidate[]>();
  
  linkedOptionsToProcess.forEach(opt => {
    const productIndex = opt.productIndex!;
    if (!optionsByProduct.has(productIndex)) {
      optionsByProduct.set(productIndex, []);
    }
    optionsByProduct.get(productIndex)!.push(opt);
  });
  
  // 각 상품별로 충돌 정리
  const cleanedOptions: OptionCandidate[] = [...globalAndExcludedOptions];
  
  optionsByProduct.forEach((options, productIndex) => {
    // normalizedOptionText + optionType으로 그룹화
    const optionGroups = new Map<string, OptionCandidate[]>();
    
    options.forEach(opt => {
      const normalizedText = normalizeOptionForMerging(opt.token);
      const groupKey = `${normalizedText}|${opt.optionType}`;
      
      if (!optionGroups.has(groupKey)) {
        optionGroups.set(groupKey, []);
      }
      optionGroups.get(groupKey)!.push(opt);
    });
    
    // 각 그룹에서 linkScore가 가장 높은 옵션만 유지
    optionGroups.forEach(group => {
      if (group.length === 1) {
        // 단일 옵션인 경우 그대로 유지
        cleanedOptions.push(group[0]);
      } else {
        // 여러 옵션이 동일한 경우 linkScore가 가장 높은 것만 유지
        const bestOption = group.reduce((best, current) => {
          const bestScore = best.linkScore ?? 0;
          const currentScore = current.linkScore ?? 0;
          return currentScore > bestScore ? current : best;
        }, group[0]);
        
        cleanedOptions.push(bestOption);
      }
    });
  });
  
  return cleanedOptions;
}

/**
 * 옵션 confidence 계산
 * 
 * @param linkedOptions - Linked option candidates
 * @param totalOptionCount - Total number of option candidates
 * @returns Overall confidence score
 */
function calculateOptionConfidence(
  linkedOptions: OptionCandidate[],
  totalOptionCount: number
): number {
  if (totalOptionCount === 0) {
    return 1.0;
  }
  
  const linkedCount = linkedOptions.filter(opt => opt.isLinked).length;
  const commonCount = linkedOptions.filter(opt => !opt.isLinked).length;
  
  // 연결된 옵션이 있으면 1.0, 공통 옵션만 있으면 0.6
  if (linkedCount > 0 && commonCount === 0) {
    return 1.0;
  } else if (linkedCount === 0 && commonCount > 0) {
    return 0.6;
  } else if (linkedCount > 0 && commonCount > 0) {
    // 연결된 옵션과 공통 옵션이 모두 있는 경우 가중 평균
    const linkedRatio = linkedCount / totalOptionCount;
    const commonRatio = commonCount / totalOptionCount;
    return linkedRatio * 1.0 + commonRatio * 0.6;
  }
  
  return 1.0;
}

/**
 * 후보의 confidence와 status 업데이트
 * 
 * ⚠️ 주의: 옵션 실패 시에도 후보 삭제는 하지 않음
 * 
 * @param candidates - Product candidates to update
 * @param linkedOptions - Linked option candidates
 */
function updateCandidateConfidenceAndStatus(
  candidates: ProductCandidate[],
  linkedOptions: OptionCandidate[]
): void {
  candidates.forEach((candidate, index) => {
    // 옵션이 있는지 확인
    const hasOption = candidate.option !== undefined || 
                     (candidate.options !== undefined && candidate.options.length > 0);
    
    if (hasOption) {
      // 옵션이 연결된 경우 confidence 보정
      const linkedOptionsForProduct = linkedOptions.filter(
        opt => opt.isLinked && opt.productIndex === index
      );
      
      if (linkedOptionsForProduct.length > 0) {
        // 연결된 옵션이 있는 경우 confidence에 약간의 보너스 (최대 0.1)
        const optionBonus = Math.min(0.1, linkedOptionsForProduct.length * 0.05);
        candidate.confidence = Math.min(1.0, candidate.confidence + optionBonus);
      }
      
      // status는 기존 로직에 따라 결정되므로 여기서는 수정하지 않음
      // (기존 status 판단 로직이 이미 적용되어 있음)
    }
  });
}

