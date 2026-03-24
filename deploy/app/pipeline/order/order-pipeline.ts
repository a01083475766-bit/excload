/**
 * EXCLOAD Order Pipeline - 메인 파이프라인
 * 
 * ⚠️ CONSTITUTION.md v4.1 준수
 * Stage2 Order Pipeline 전용
 * 
 * 목적: 모든 주문 입력을 기준헤더로 통일
 * 출력: OrderStandardFile (기준헤더 통일)
 * 
 * 금지사항:
 * - 택배사 구조 참조 금지
 * - FixedInput 참조 금지
 * - TemplatePipeline 참조 금지
 * - Stage 3 참조 금지
 * - 값 정제 AI 호출 금지 (헤더 매핑 AI는 허용)
 */

import { BASE_HEADERS } from '../base/base-headers';
import { ALIAS_DICTIONARY } from '../base/alias-dictionary';
import type { CleanInputFile } from '../preprocess/types';
import { validateCleanInputFile, validateOrderStandardFile, logValidationResult, throwIfInvalid } from '../utils/validation';
import { mapTemplateToBase } from '../template/map-template-to-base';

/**
 * 기준헤더 배열 (고정)
 * 내부 표준 컬럼 집합으로, 모든 입력의 1차 통일 구조입니다.
 */
export const BASE_HEADERS_ARRAY = [...BASE_HEADERS] as const;

/**
 * OrderStandardFile 구조
 * 
 * 기준헤더로 통일된 주문 데이터 파일
 */
export interface OrderStandardFile {
  /** 기준헤더 배열 (고정) */
  baseHeaders: readonly string[];
  
  /** 기준헤더 순서대로 변환된 행 데이터 */
  rows: Record<string, string>[];
  
  /** 매핑 실패한 헤더 배열 */
  unknownHeaders: string[];
}

/**
 * 헤더 정규화 함수
 * 
 * @param header - 원본 헤더
 * @returns 정규화된 헤더
 */
function normalizeHeader(header: string): string {
  return header
    .replace(/\s/g, '')          // 공백 제거
    .replace(/\(.*?\)/g, '')     // 괄호 제거
    .replace(/[.·]/g, '')        // 점 제거
    .replace(/[^가-힣0-9]/g, '')  // 한글/숫자 외 제거
    .trim();
}

/**
 * Order Pipeline을 실행합니다.
 * 
 * 1. headerMap 생성 (aliasDictionary 사용)
 * 2. unknownHeaders 배열 생성
 * 3. rows 변환 (기준헤더 순서대로)
 * 4. OrderStandardFile 반환
 * 
 * @param cleanInputFile - 전처리된 입력 파일
 * @param fileSessionId - 파일 세션 ID (AI 호출 제한용)
 * @returns OrderStandardFile
 * 
 * @example
 * ```typescript
 * const result = run(cleanInputFile);
 * // result.baseHeaders: 기준헤더 배열
 * // result.rows: 기준헤더 순서대로 변환된 행 데이터
 * // result.unknownHeaders: 매핑 실패한 헤더 배열
 * ```
 */
export async function run(cleanInputFile: CleanInputFile, fileSessionId?: string): Promise<OrderStandardFile> {
  // 0. 입력 검증 체크포인트
  const inputValidation = validateCleanInputFile(cleanInputFile);
  logValidationResult(inputValidation, 'Stage2 Order Pipeline - Input');
  throwIfInvalid(inputValidation, 'Stage2 Order Pipeline - Input');
  
  const { headers, rows } = cleanInputFile;
  
  // 1. Stage1 헤더 매핑 로직 사용 (AI Header Mapping 포함)
  console.log('[Stage1] Starting Header Mapping for Order File');
  const mappingResult = await mapTemplateToBase(headers, undefined, fileSessionId);
  
  // mappingResult를 headerMap으로 변환
  // Record<원본헤더인덱스, 기준헤더> 형태
  const headerMap: Record<number, string> = {};
  for (let i = 0; i < headers.length; i++) {
    const mappedBaseHeader = mappingResult.mappedBaseHeaders[i];
    if (mappedBaseHeader) {
      headerMap[i] = mappedBaseHeader;
    }
  }
  
  const unknownHeaders = mappingResult.unknownHeaders;
  
  console.log('[Stage2] Header Map:', headerMap);
  console.log('[Stage2] Unknown Headers:', unknownHeaders);
  
  // 2. rows 변환 (기준헤더 순서대로)
  const transformedRows: Record<string, string>[] = rows.map((row, rowIndex) => {
    const transformedRow: Record<string, string> = {};
    
    // 기준헤더 순서대로 값 매핑
    for (const baseHeader of BASE_HEADERS) {
      // 같은 기준헤더로 매핑된 모든 원본 헤더 인덱스 찾기
      const sourceIndices = Object.keys(headerMap)
        .map(Number)
        .filter((idx) => headerMap[idx] === baseHeader);
      
      if (sourceIndices.length > 0) {
        // 여러 원본 헤더가 같은 기준헤더로 매핑된 경우
        // 1. 비어있지 않은 값을 우선 선택
        // 2. 여러 값이 모두 비어있지 않으면, 원본 헤더 이름의 우선순위에 따라 선택
        let selectedValue = '';
        let selectedIndex: number | undefined = undefined;
        
        // 먼저 비어있지 않은 값 찾기
        for (const idx of sourceIndices) {
          const value = String(row[idx] || '').trim();
          if (value) {
            // 원본 헤더 이름 확인 (우선순위: "상품명" > "상품명1" > "상품명2" 등)
            const originalHeader = headers[idx];
            const normalizedHeader = normalizeHeader(originalHeader);
            
            // 현재 선택된 값이 없거나, 더 우선순위가 높은 헤더인 경우
            if (!selectedValue) {
              selectedValue = value;
              selectedIndex = idx;
            } else {
              // 우선순위 비교: 숫자가 없는 헤더가 숫자가 있는 헤더보다 우선
              const currentNormalized = normalizeHeader(headers[selectedIndex!]);
              const hasNumber = (h: string) => /\d/.test(h);
              
              if (!hasNumber(normalizedHeader) && hasNumber(currentNormalized)) {
                // 숫자 없는 헤더가 더 우선
                selectedValue = value;
                selectedIndex = idx;
              } else if (hasNumber(normalizedHeader) && !hasNumber(currentNormalized)) {
                // 현재 선택된 값이 더 우선 (변경하지 않음)
                // selectedValue와 selectedIndex 유지
              } else {
                // 둘 다 숫자가 있거나 없으면, 숫자가 작은 것이 우선 (상품명1 < 상품명2)
                const currentNum = currentNormalized.match(/\d+/)?.[0];
                const newNum = normalizedHeader.match(/\d+/)?.[0];
                if (newNum && (!currentNum || Number(newNum) < Number(currentNum))) {
                  selectedValue = value;
                  selectedIndex = idx;
                }
              }
            }
          }
        }
        
        // 선택된 값이 있으면 사용, 없으면 첫 번째 인덱스의 값 사용 (빈 값일 수 있음)
        if (selectedValue) {
          transformedRow[baseHeader] = selectedValue;
        } else {
          const value = row[sourceIndices[0]] || '';
          transformedRow[baseHeader] = String(value);
        }
      } else {
        // 매핑되지 않은 기준헤더는 빈 문자열
        transformedRow[baseHeader] = '';
      }
    }
    
    // 상품 보조 매핑 처리
    if (
      transformedRow['상품명'] &&
      transformedRow['상품명'].trim() !== '' &&
      transformedRow['추가상품'] &&
      transformedRow['추가상품'].trim() !== ''
    ) {
      // 둘 다 값 있으면 그대로 유지 (덮어쓰기 금지)
    } else if (
      !transformedRow['상품명'] &&
      transformedRow['추가상품']
    ) {
      // 상품명이 비어있고 추가상품에 값이 있으면
      transformedRow['상품명'] = transformedRow['추가상품'];
      transformedRow['추가상품'] = '';
    }
    
    return transformedRow;
  });
  
  // 3. OrderStandardFile 생성
  const orderStandardFile: OrderStandardFile = {
    baseHeaders: BASE_HEADERS_ARRAY,
    rows: transformedRows,
    unknownHeaders: unknownHeaders,
  };
  
  // 4. 출력 검증 체크포인트
  const outputValidation = validateOrderStandardFile(orderStandardFile);
  logValidationResult(outputValidation, 'Stage2 Order Pipeline - Output');
  throwIfInvalid(outputValidation, 'Stage2 Order Pipeline - Output');
  
  return orderStandardFile;
}
