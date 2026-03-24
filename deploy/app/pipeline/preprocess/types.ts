/**
 * EXCLOAD Preprocess Pipeline 타입 정의
 * 
 * ⚠️ CONSTITUTION.md v4.0 준수
 * Stage 0 Preprocess Pipeline 전용 타입
 */

export interface CleanInputFile {
  headers: string[]
  rows: string[][]
  sourceType: 'excel'
}
