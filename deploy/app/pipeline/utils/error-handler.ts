/**
 * EXCLOAD 파이프라인 에러 처리 유틸리티
 * 
 * ⚠️ CONSTITUTION.md v4.1 준수
 * 
 * 목적: 사용자에게 친화적인 에러 메시지 제공
 */

import { ValidationError } from './validation';

/**
 * 에러 타입 분류
 */
export type ErrorCategory = 
  | 'VALIDATION_ERROR'      // 검증 오류
  | 'MAPPING_ERROR'         // 매핑 오류
  | 'DATA_INCONSISTENCY'    // 데이터 일관성 오류
  | 'TYPE_ERROR'            // 타입 오류
  | 'UNKNOWN_ERROR';        // 알 수 없는 오류

/**
 * 사용자 친화적 에러 정보
 */
export interface UserFriendlyError {
  /** 에러 카테고리 */
  category: ErrorCategory;
  /** 사용자에게 표시할 메시지 */
  message: string;
  /** 기술적 상세 정보 (개발자용) */
  technicalDetails?: string;
  /** 복구 가이드 */
  recoverySteps: string[];
  /** 에러가 발생한 단계 */
  stage?: 'Stage0' | 'Stage1' | 'Stage2' | 'Stage3';
}

/**
 * 에러를 사용자 친화적인 형태로 변환
 */
export function toUserFriendlyError(error: unknown, stage?: 'Stage0' | 'Stage1' | 'Stage2' | 'Stage3'): UserFriendlyError {
  // ValidationError인 경우
  if (error instanceof ValidationError) {
    return {
      category: 'VALIDATION_ERROR',
      message: '데이터 검증에 실패했습니다.',
      technicalDetails: error.message,
      recoverySteps: error.recoveryGuide || [
        '입력 데이터를 확인하고 다시 시도해주세요.',
        '문제가 계속되면 관리자에게 문의해주세요.',
      ],
      stage,
    };
  }

  // 일반 Error인 경우
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // 매핑 관련 오류
    if (message.includes('mapping') || message.includes('매핑')) {
      return {
        category: 'MAPPING_ERROR',
        message: '데이터 매핑 중 오류가 발생했습니다.',
        technicalDetails: error.message,
        recoverySteps: [
          '헤더 매핑이 올바른지 확인하세요.',
          '입력 파일의 헤더 형식이 올바른지 확인하세요.',
          '문제가 계속되면 다른 파일로 시도해보세요.',
        ],
        stage,
      };
    }

    // 타입 관련 오류
    if (message.includes('type') || message.includes('타입')) {
      return {
        category: 'TYPE_ERROR',
        message: '데이터 형식이 올바르지 않습니다.',
        technicalDetails: error.message,
        recoverySteps: [
          '입력 파일의 형식이 올바른지 확인하세요.',
          '필요한 컬럼이 모두 있는지 확인하세요.',
          '데이터 타입이 올바른지 확인하세요.',
        ],
        stage,
      };
    }

    // 길이 불일치 오류
    if (message.includes('length') || message.includes('길이')) {
      return {
        category: 'DATA_INCONSISTENCY',
        message: '데이터 구조가 일치하지 않습니다.',
        technicalDetails: error.message,
        recoverySteps: [
          '입력 파일의 컬럼 수가 일치하는지 확인하세요.',
          '빈 셀이 있는지 확인하세요.',
          '헤더 행과 데이터 행의 구조가 일치하는지 확인하세요.',
        ],
        stage,
      };
    }

    // 일반 오류
    return {
      category: 'UNKNOWN_ERROR',
      message: '처리 중 오류가 발생했습니다.',
      technicalDetails: error.message,
      recoverySteps: [
        '입력 데이터를 확인하고 다시 시도해주세요.',
        '문제가 계속되면 관리자에게 문의해주세요.',
      ],
      stage,
    };
  }

  // 알 수 없는 오류
  return {
    category: 'UNKNOWN_ERROR',
    message: '알 수 없는 오류가 발생했습니다.',
    technicalDetails: String(error),
    recoverySteps: [
      '페이지를 새로고침하고 다시 시도해주세요.',
      '문제가 계속되면 관리자에게 문의해주세요.',
    ],
    stage,
  };
}

/**
 * 에러를 안전하게 처리하고 사용자 친화적 메시지 반환
 */
export function handlePipelineError(
  error: unknown,
  stage?: 'Stage0' | 'Stage1' | 'Stage2' | 'Stage3'
): UserFriendlyError {
  try {
    return toUserFriendlyError(error, stage);
  } catch {
    // 변환 실패 시 기본 에러 반환
    return {
      category: 'UNKNOWN_ERROR',
      message: '오류 처리 중 문제가 발생했습니다.',
      technicalDetails: String(error),
      recoverySteps: [
        '페이지를 새로고침하고 다시 시도해주세요.',
        '문제가 계속되면 관리자에게 문의해주세요.',
      ],
      stage,
    };
  }
}

/**
 * 에러 메시지를 콘솔에 출력 (개발자용)
 */
export function logError(error: UserFriendlyError): void {
  const prefix = error.stage ? `[${error.stage}] ` : '';
  console.error(`${prefix}❌ ${error.category}: ${error.message}`);
  if (error.technicalDetails) {
    console.error(`${prefix}기술적 상세:`, error.technicalDetails);
  }
  if (error.recoverySteps.length > 0) {
    console.info(`${prefix}💡 복구 단계:`, error.recoverySteps);
  }
}
