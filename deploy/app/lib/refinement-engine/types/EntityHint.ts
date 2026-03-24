/**
 * EntityHint type definition
 * Represents hints or metadata about entities being processed through the refinement pipeline
 */

import type { MaskRange } from '@/app/lib/refinement-engine/utils/maskRanges';

export type EntityHint = {
  // Dead-State 처리된 영역: 이 범위에 포함된 요소들은 다른 파이프라인이나 엔티티 판단에 재사용하지 않음
  // Product/Option/Request 단계에서 value·token·pattern·score 접근을 전면 차단하고,
  // 엔티티 타입과 range 메타정보만 유지
  maskRanges?: MaskRange[];
  suppressPatterns?: unknown;
  contextSignals?: unknown;
  status?: 'STRONG_PHONE_CONTEXT' | 'WARNING_NO_PHONE_CONTEXT' | 'CONFIRMED' | 'WARNING' | 'WARNING_PRODUCT_UNCONFIRMED' | 'NOT_FOUND_PRODUCT' | 'SKIPPED';
  failureReason?: 'PRODUCT_STAGE_NOT_CONFIRMED' | 'NO_PRODUCT_CANDIDATE' | 'ADDRESS_NOT_CONFIRMED_CONDITION_FAILED';
  phoneNearby?: boolean;
  // 이름 파이프라인 힌트 정보: 주소 연관성 (HOLD일 때 힌트로만 사용, 점수 계산에는 영향 없음)
  addressNearby?: boolean;
  // 주소 파이프라인 힌트 정보 (각 항목당 +30점 가중치)
  // 주의: START와 END는 이후 단계에서 점수 경쟁이 아닌 힌트 정보로만 작용
  addressHints?: {
    startLinkage?: boolean; // START 연계 여부
    endProximity?: boolean; // END 근접 여부
    roadToBuilding?: boolean; // 도로명→건물 연결 여부
    adminOrder?: boolean; // 행정 순서 정상 여부
  };
  // 디버그용: 후보 생성 단계에서 탈락된 이유들
  debugReasons?: Array<'ADDRESS_MASKED' | 'NUMBER_ONLY' | 'KEYWORD_BLOCKED' | 'PATTERN_MISMATCH' | 'NO_PARENT_PRODUCT' | 'OUT_OF_WINDOW' | 'KEYWORD_MISMATCH' | 'UNIT_MISSING' | 'NO_PARENT_CONTEXT'>;
  // 상품 정규화 단계에서 제거된 옵션 성격 키워드들
  strippedOptions?: string[];
  // 상품 힌트 카테고리 (최종 선택된 후보에 대해서만 기록)
  productHintCategory?: string;
  // 주소 파이프라인 디버그 정보: 각 candidate별 점수 및 판단 근거
  addressCandidateDebug?: Array<{
    candidate: string;
    startScore: number;
    flowScore: number;
    endScore: number;
    totalScore: number;
    hasEnd: boolean;
    isOverlappingMaskRange: boolean;
  }>;
};

