/**
 * F-3: Common Option Merge
 * 
 * 동일 옵션 문자열(정규화 기준)인 경우에만 옵션을 병합하고,
 * 상품별 quantity/option/request는 절대 수정하지 않은 채
 * 공통옵션만 분리·계산하는 모듈
 * 
 * ⚠️ 중요 규칙:
 * - product/quantity/option/request 로직은 절대 수정하지 않음
 * - 공통 옵션만 분리하여 계산
 * - 동일 정규화된 옵션 문자열인 경우에만 병합
 */

import type { ProductCandidate } from '@/app/lib/refinement-engine/hint-engine/f-product-resolver';

/**
 * Common Option Merge Result type
 * Represents the result of common option merging
 */
export type CommonOptionMergeResult = {
  /**
   * Product candidates with separated common options
   * (원본 quantity/option/request는 수정하지 않음)
   */
  candidates: ProductCandidate[];
  
  /**
   * Common options that were separated from all products
   * (정규화된 옵션 문자열 배열)
   */
  commonOptions: string[];
  
  /**
   * Confidence score for the common option merge
   */
  confidence: number;
};

/**
 * 옵션 문자열 정규화 함수
 * 
 * @param option - 정규화할 옵션 문자열
 * @returns 정규화된 옵션 문자열
 */
function normalizeOption(option: string): string {
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
 * 상품 후보에서 옵션 배열 추출
 * 
 * @param candidate - Product candidate
 * @returns 옵션 문자열 배열 (option 또는 options 필드에서 추출)
 */
function extractOptions(candidate: ProductCandidate): string[] {
  const options: string[] = [];
  
  // option 필드가 있으면 추가
  if (candidate.option !== undefined && candidate.option !== null && candidate.option.trim().length > 0) {
    options.push(candidate.option);
  }
  
  // options 필드가 있으면 추가
  if (candidate.options !== undefined && candidate.options !== null && candidate.options.length > 0) {
    options.push(...candidate.options);
  }
  
  return options;
}

/**
 * F-3: Common Option Merge function
 * 
 * 동일 옵션 문자열(정규화 기준)인 경우에만 옵션을 병합하고,
 * 상품별 quantity/option/request는 절대 수정하지 않은 채
 * 공통옵션만 분리·계산
 * 
 * @param candidates - Product candidates to process
 * @returns CommonOptionMergeResult with separated common options
 */
export function mergeCommonOptions(
  candidates: ProductCandidate[]
): CommonOptionMergeResult {
  // candidates 복사 (원본 수정 방지)
  const processedCandidates: ProductCandidate[] = candidates.map(candidate => ({
    ...candidate,
  }));
  
  // 단일 상품인 경우 공통 옵션 병합 불필요
  if (processedCandidates.length <= 1) {
    return {
      candidates: processedCandidates,
      commonOptions: [],
      confidence: 1.0,
    };
  }
  
  // 모든 상품에서 옵션 추출
  const allOptions: Array<{ original: string; normalized: string; productIndex: number }> = [];
  
  processedCandidates.forEach((candidate, index) => {
    const options = extractOptions(candidate);
    options.forEach(option => {
      const normalized = normalizeOption(option);
      if (normalized.length > 0) {
        allOptions.push({
          original: option,
          normalized: normalized,
          productIndex: index,
        });
      }
    });
  });
  
  // 옵션이 없는 경우
  if (allOptions.length === 0) {
    return {
      candidates: processedCandidates,
      commonOptions: [],
      confidence: 1.0,
    };
  }
  
  // 정규화된 옵션별로 그룹화
  const normalizedOptionGroups = new Map<string, Array<{ original: string; productIndex: number }>>();
  
  allOptions.forEach(({ original, normalized, productIndex }) => {
    if (!normalizedOptionGroups.has(normalized)) {
      normalizedOptionGroups.set(normalized, []);
    }
    normalizedOptionGroups.get(normalized)!.push({ original, productIndex });
  });
  
  // 공통 옵션 찾기: 모든 상품에 동일한 정규화된 옵션이 있는 경우
  const commonOptions: string[] = [];
  const productCount = processedCandidates.length;
  
  normalizedOptionGroups.forEach((group, normalizedOption) => {
    // 이 정규화된 옵션이 나타난 상품 인덱스 집합
    const productIndices = new Set(group.map(item => item.productIndex));
    
    // 모든 상품에 이 옵션이 있는지 확인
    if (productIndices.size === productCount) {
      // 모든 상품에 동일한 정규화된 옵션이 있음
      // 원본 옵션 중 가장 많이 나타난 것을 대표로 선택
      const originalCounts = new Map<string, number>();
      group.forEach(item => {
        originalCounts.set(item.original, (originalCounts.get(item.original) || 0) + 1);
      });
      
      // 가장 많이 나타난 원본 옵션 선택
      let maxCount = 0;
      let representativeOption = '';
      originalCounts.forEach((count, original) => {
        if (count > maxCount) {
          maxCount = count;
          representativeOption = original;
        }
      });
      
      if (representativeOption.length > 0) {
        commonOptions.push(representativeOption);
      }
    }
  });
  
  // 공통 옵션이 없는 경우
  if (commonOptions.length === 0) {
    return {
      candidates: processedCandidates,
      commonOptions: [],
      confidence: 1.0,
    };
  }
  
  // 공통 옵션을 정규화하여 중복 제거
  const normalizedCommonOptions = new Set(commonOptions.map(opt => normalizeOption(opt)));
  const uniqueCommonOptions: string[] = [];
  const seenNormalized = new Set<string>();
  
  commonOptions.forEach(opt => {
    const normalized = normalizeOption(opt);
    if (!seenNormalized.has(normalized)) {
      seenNormalized.add(normalized);
      uniqueCommonOptions.push(opt);
    }
  });
  
  // confidence 계산: 공통 옵션이 발견된 비율
  const totalNormalizedOptions = normalizedOptionGroups.size;
  const commonNormalizedOptions = normalizedCommonOptions.size;
  const confidence = totalNormalizedOptions > 0 
    ? Math.min(1.0, commonNormalizedOptions / totalNormalizedOptions)
    : 1.0;
  
  // ⚠️ 중요: 상품별 quantity/option/request는 절대 수정하지 않음
  // 공통 옵션만 분리하여 반환
  
  return {
    candidates: processedCandidates, // 원본 그대로 유지
    commonOptions: uniqueCommonOptions,
    confidence,
  };
}

