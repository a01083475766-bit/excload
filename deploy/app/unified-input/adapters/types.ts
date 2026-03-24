/**
 * UnifiedInput 어댑터 계층 타입 정의
 * 
 * ⚠️ CONSTITUTION.md v4.0 준수
 * ⚠️ 기존 Stage0/1/2/3 파일 절대 수정 금지
 * 
 * 이 파일은 unified-input 어댑터 계층에서만 사용되는 타입을 정의합니다.
 * 기존 타입은 재사용하고, 필요한 경우에만 확장합니다.
 */

import type { InternalOrderFormat } from '@/app/lib/export/internalOrderFormat';
import type { CleanInputFile } from '@/app/pipeline/preprocess/types';

/**
 * InternalOrderFormat 재사용
 * 텍스트/이미지 입력이 AI 정제 후 변환되는 내부 주문 포맷
 */
export type { InternalOrderFormat };

/**
 * CleanInputFile 확장 타입
 * 텍스트/이미지 입력도 CleanInputFile로 변환되므로 sourceType 확장
 */
export type ExtendedCleanInputFile = Omit<CleanInputFile, 'sourceType'> & {
  sourceType: 'excel' | 'text' | 'image';
};

/**
 * 텍스트 입력 어댑터 결과
 */
export interface TextToCleanInputResult {
  cleanInputFile: ExtendedCleanInputFile;
  internalOrder?: InternalOrderFormat; // 변환 과정에서 생성된 내부 주문 포맷 (확인 모달용)
}

/**
 * 이미지 입력 어댑터 결과
 */
export interface ImageToTextResult {
  text: string; // OCR로 추출된 텍스트
  internalOrder?: InternalOrderFormat; // OCR 후 정제된 내부 주문 포맷 (확인 모달용)
}
