/**
 * EXCLOAD Merge Pipeline 타입 정의
 * 
 * ⚠️ CONSTITUTION.md v4.1 준수
 * Stage3 Merge Pipeline 전용 타입
 */

/**
 * FixedInput 구조
 * 
 * 고정 입력값 (택배사 헤더 기준)
 * sender/receiver 구분 없이 전 필드 허용
 */
export interface FixedInput {
  [courierHeader: string]: string;
}

/**
 * PreviewRow 구조
 * 
 * 미리보기 행 데이터 (택배사 헤더 기준)
 * 택배사 업로드 파일의 전체 컬럼 구조를 보여줌
 */
export interface PreviewRow {
  [courierHeader: string]: string;
}

/**
 * MergePipelineResult 구조
 * 
 * Stage3 병합 결과
 */
export interface MergePipelineResult {
  /** 택배사 헤더 배열 (순서 유지) */
  courierHeaders: string[];
  
  /** 미리보기 행 데이터 배열 */
  previewRows: PreviewRow[];
}
