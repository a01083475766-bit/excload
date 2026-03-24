/**
 * E' AI Pipeline module
 * Uses AI to extract product, quantity, option, and request from remainingText
 */

import type { EntityHint } from '@/app/lib/refinement-engine/types/EntityHint';
import { NORMALIZATION_SYSTEM_PROMPT } from '@/app/lib/refinement-engine/ai/normalizationPrompt';

// Re-export for backward compatibility
export { NORMALIZATION_SYSTEM_PROMPT };

export const createNormalizationUserPrompt = (
  originalText: string,
  engineHint: any
): string => `
다음은 주문 원문과 엔진 힌트입니다.

[원문 텍스트]
${originalText}

[엔진 힌트 - 참고용]
${JSON.stringify(engineHint, null, 2)}

원문을 1차 기준으로 분석하여
기준헤더 29개 구조에 맞는 JSON을 완성하십시오.
`;

export type EPrimeAIResult = {
  status: 'OK' | 'ERROR';
  product?: string;
  quantity?: number | null;
  option?: string;
  request?: string;
  errorType?: 'AMBIGUOUS' | 'EMPTY' | 'FORMAT';
};

/**
 * Internal extraction result type
 */
type ExtractionResult = {
  product?: string;
  quantity?: number | null;
  option?: string;
  request?: string;
  confident: boolean;
  errorType?: 'AMBIGUOUS' | 'EMPTY' | 'FORMAT';
};

/**
 * E' AI Pipeline function
 * Processes remainingText using AI to extract product, quantity, option, and request
 * 
 * @param remainingText - Remaining text after entity extraction
 * @returns EPrimeAIResult with extracted information or ERROR status
 */
export async function runEPrimeAIPipeline(
  remainingText: string
): Promise<EPrimeAIResult> {
  // Trim and check if remainingText is empty
  const trimmedText = remainingText.trim();
  
  if (!trimmedText) {
    return {
      status: 'ERROR',
      errorType: 'EMPTY',
    };
  }

  try {
    // Extract data from AI (single API call)
    const extractionResult = await extractDataFromAI(
      trimmedText, // originalText (using remainingText as fallback)
      trimmedText, // remainingText
      false, // engineConfirmed (default)
      {} // hints (default)
    );
    
    // API 호출 실패 또는 응답이 없는 경우 (FORMAT 에러)
    if (!extractionResult) {
      return {
        status: 'ERROR',
        errorType: 'FORMAT',
      };
    }
    
    // Check confidence using the same extraction result
    // (callAIForExtraction is available as a standalone function that returns only OK/ERROR)
    if (extractionResult.confident) {
      return {
        status: 'OK',
        product: extractionResult.product,
        quantity: extractionResult.quantity,
        option: extractionResult.option,
        request: extractionResult.request,
      };
    }
    
    // AI가 확신하지 못한 경우 (AMBIGUOUS)
    // API 응답에서 errorType을 받아오거나, 없으면 기본값으로 AMBIGUOUS 사용
    return {
      status: 'ERROR',
      errorType: extractionResult.errorType || 'AMBIGUOUS',
    };
  } catch (error) {
    console.error('[EPrimeAIPipeline] Error:', error);
    // 파싱 실패, 타임아웃, 네트워크 에러 등은 FORMAT 에러로 분류
    return {
      status: 'ERROR',
      errorType: 'FORMAT',
    };
  }
}

/**
 * Internal helper to call AI API and get raw response
 */
async function callAIAPI(
  originalText: string,
  remainingText: string,
  engineConfirmed: boolean,
  hints: EntityHint
): Promise<{ confident: boolean; result?: any; errorType?: 'AMBIGUOUS' | 'EMPTY' | 'FORMAT' } | null> {
  const TIMEOUT_MS = 5000; // 5초 타임아웃 고정
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    try {
      // 🔄 AI 호출 경로 통합: 구버전 /api/ai-extract → /api/ai-gateway
      // - 헌법 및 AI 구조 통합 원칙에 따라, AI 관련 fetch는 /api/ai-gateway 단일 통로만 사용
      const response = await fetch('/api/ai-gateway', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Gateway 요청 타입: 상품/옵션/수량/요청 텍스트 추출
          type: 'extract',
          originalText,
          remainingText,
          engineConfirmed,
          hints,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return null;
      }
      
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('[callAIAPI] JSON parse error:', parseError);
        return null;
      }
      
      return {
        confident: data.confident === true,
        result: data.result,
        errorType: data.errorType as 'AMBIGUOUS' | 'EMPTY' | 'FORMAT' | undefined,
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error('[callAIAPI] Timeout after 5 seconds');
      } else {
        console.error('[callAIAPI] Fetch error:', fetchError);
      }
      return null;
    }
  } catch (error) {
    console.error('[callAIAPI] Error:', error);
    return null;
  }
}

/**
 * Internal helper to extract data from AI API
 */
async function extractDataFromAI(
  originalText: string,
  remainingText: string,
  engineConfirmed: boolean,
  hints: EntityHint
): Promise<ExtractionResult | null> {
  const apiResult = await callAIAPI(originalText, remainingText, engineConfirmed, hints);
  
  if (!apiResult || !apiResult.result) {
    // API 응답이 없거나 result가 없는 경우, errorType이 있으면 반환
    if (apiResult?.errorType) {
      return {
        confident: false,
        errorType: apiResult.errorType,
      };
    }
    return null;
  }
  
  return {
    product: apiResult.result.product,
    quantity: apiResult.result.quantity ?? null,
    option: apiResult.result.option,
    request: apiResult.result.request,
    confident: apiResult.confident,
    errorType: apiResult.errorType,
  };
}

/**
 * AI extraction function
 * Calls AI service to extract product information from text
 * 
 * 입력: originalText, remainingText, engineConfirmed, hints만 사용
 * 출력: OK/ERROR 중 하나만 반환
 * 확신 없을 경우 반드시 ERROR 반환
 * 타임아웃 5초, 재시도 0회로 고정
 * 
 * @param originalText - Original full text input
 * @param remainingText - Remaining text after entity extraction
 * @param engineConfirmed - Whether engine has confirmed entities
 * @param hints - Entity hints from previous pipeline stages
 * @returns 'OK' if extraction is confident, 'ERROR' otherwise
 */
async function callAIForExtraction(
  originalText: string,
  remainingText: string,
  engineConfirmed: boolean,
  hints: EntityHint
): Promise<'OK' | 'ERROR'> {
  // 재시도 0회 고정 (타임아웃 5초와 함께 callAIAPI에서 처리됨)
  const apiResult = await callAIAPI(originalText, remainingText, engineConfirmed, hints);
  
  // 확신 없을 경우 반드시 ERROR 반환
  if (!apiResult || !apiResult.confident || !apiResult.result) {
    return 'ERROR';
  }
  
  return 'OK';
}

/**
 * Normalization result type
 * Represents the normalized result with all entity fields
 */
export type NormalizationResult = {
  "주문번호": string;
  "보내는사람": string;
  "보내는사람전화1": string;
  "보내는사람전화2": string;
  "보내는사람우편번호": string;
  "보내는사람주소1": string;
  "보내는사람주소2": string;
  "받는사람": string;
  "받는사람전화1": string;
  "받는사람전화2": string;
  "받는사람우편번호": string;
  "받는사람주소1": string;
  "받는사람주소2": string;
  "주문자": string;
  "주문자연락처": string;
  "주문일시": string;
  "결제금액": string;
  "상품명": string;
  "추가상품": string;
  "상품옵션": string;
  "상품옵션1": string;
  "수량": string;
  "배송메시지": string;
  "운임구분": string;
  "운임": string;
  "운송장번호": string;
  "창고메모": string;
  "내부메모": string;
  "출고번호": string;
};

/**
 * Base header keys for normalization result validation
 */
const BASE_HEADER_KEYS = [
  "주문번호",
  "보내는사람",
  "보내는사람전화1",
  "보내는사람전화2",
  "보내는사람우편번호",
  "보내는사람주소1",
  "보내는사람주소2",
  "받는사람",
  "받는사람전화1",
  "받는사람전화2",
  "받는사람우편번호",
  "받는사람주소1",
  "받는사람주소2",
  "주문자",
  "주문자연락처",
  "주문일시",
  "결제금액",
  "상품명",
  "추가상품",
  "상품옵션",
  "상품옵션1",
  "수량",
  "배송메시지",
  "운임구분",
  "운임",
  "운송장번호",
  "창고메모",
  "내부메모",
  "출고번호",
] as const;

/**
 * Validate AI normalization response structure
 */
const isValidNormalizationResult = (data: any): boolean => {
  if (!data || typeof data !== "object") return false;

  return BASE_HEADER_KEYS.every((key) =>
    Object.prototype.hasOwnProperty.call(data, key)
  );
};

/**
 * Helper: create an empty NormalizationResult with all base headers
 */
const createEmptyNormalizationResult = (): NormalizationResult => ({
  "주문번호": "",
  "보내는사람": "",
  "보내는사람전화1": "",
  "보내는사람전화2": "",
  "보내는사람우편번호": "",
  "보내는사람주소1": "",
  "보내는사람주소2": "",
  "받는사람": "",
  "받는사람전화1": "",
  "받는사람전화2": "",
  "받는사람우편번호": "",
  "받는사람주소1": "",
  "받는사람주소2": "",
  "주문자": "",
  "주문자연락처": "",
  "주문일시": "",
  "결제금액": "",
  "상품명": "",
  "추가상품": "",
  "상품옵션": "",
  "상품옵션1": "",
  "수량": "",
  "배송메시지": "",
  "운임구분": "",
  "운임": "",
  "운송장번호": "",
  "창고메모": "",
  "내부메모": "",
  "출고번호": "",
});

/**
 * Normalization input type
 */
export type NormalizationInput = {
  originalText: string;
  engineHint: EntityHint | Record<string, any>;
};

/**
 * Call AI once for normalization
 * Normalizes entities from original text using engine hints
 * 
 * @param input - Normalization input with originalText and engineHint
 * @param status - Status parameter to control return value ('ERROR' returns error status only)
 * @returns NormalizationResult with normalized entity fields
 */
export async function callAIOnceForNormalization(
  input: NormalizationInput,
  status?: 'OK' | 'ERROR'
): Promise<NormalizationResult> {
  // status가 'ERROR'인 경우: 모든 필드가 비어 있는 29개 기준헤더 구조 반환
  if (status === 'ERROR') {
    return createEmptyNormalizationResult();
  }

  const { originalText, engineHint } = input;

  // 입력 검증: originalText가 유효하지 않으면 빈 29 구조 반환
  if (!originalText || typeof originalText !== 'string' || originalText.trim() === '') {
    console.error('[callAIOnceForNormalization] originalText가 비어있거나 문자열이 아닙니다.');
    return createEmptyNormalizationResult();
  }

  const TIMEOUT_MS = 30000; // 30초 타임아웃
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch('/api/ai-gateway', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'normalize-29',
        originalText,
        engineHint,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[callAIOnceForNormalization] /api/ai-gateway normalize-29 호출 실패:', {
        status: response.status,
        errorText,
      });
      return createEmptyNormalizationResult();
    }

    // JSON.parse 실패 시 빈 29구조 반환
    let data: unknown;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error('[callAIOnceForNormalization] normalize-29 응답 JSON 파싱 실패:', parseError);
      return createEmptyNormalizationResult();
    }

    // 응답 정규화: 29개 키 모두 존재하도록 보정 + undefined/null → ""
    const normalized: NormalizationResult = createEmptyNormalizationResult();
    if (data && typeof data === 'object') {
      for (const key of BASE_HEADER_KEYS) {
        const rawValue = (data as Record<string, unknown>)[key];
        if (rawValue === null || rawValue === undefined) {
          normalized[key] = '';
        } else if (typeof rawValue === 'string') {
          normalized[key] = rawValue;
        } else {
          // 숫자/boolean/객체 등은 문자열로 변환
          normalized[key] = String(rawValue);
        }
      }
    }

    return normalized;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[callAIOnceForNormalization] normalize-29 호출 타임아웃 (30초)');
    } else {
      console.error('[callAIOnceForNormalization] normalize-29 호출 중 오류:', error);
    }
    return createEmptyNormalizationResult();
  }
}

