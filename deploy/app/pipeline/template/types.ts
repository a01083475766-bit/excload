/**
 * EXCLOAD Template Pipeline 타입 정의
 * 
 * ⚠️ CONSTITUTION.md v4.0 준수
 * Stage1 Template Pipeline 전용 타입
 */

/**
 * TemplateBridgeFile 구조
 * 
 * Row1: BaseHeader (기준헤더 배열)
 * Row2: CourierHeader (택배사 헤더 배열)
 * 
 * courierHeaders 순서를 유지하며 mappedBaseHeaders 배열 생성
 */
export interface TemplateBridgeFile {
  /** 기준헤더 배열 (Row1) - 한글 컬럼 기준 */
  baseHeaders: string[];
  
  /** 택배사 헤더 배열 (Row2) */
  courierHeaders: string[];
  
  /** 매핑된 기준헤더 배열 (courierHeaders 순서 유지) - 한글 컬럼 기준 */
  mappedBaseHeaders: (string | null)[];
  
  /** 매핑 실패한 헤더 배열 */
  unknownHeaders: string[];
}

/**
 * Template Pipeline 실행 결과
 */
export interface TemplatePipelineResult {
  bridgeFile: TemplateBridgeFile;
}