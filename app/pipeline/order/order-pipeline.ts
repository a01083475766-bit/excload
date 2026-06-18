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
import type { HeaderMappingDetail, MappingResult } from '../template/map-template-to-base';
import { mapTemplateToBase } from '../template/map-template-to-base';
import { coerceStage2CellValue } from '@/app/lib/excel/coerce-excel-phone';
import {
  buildHeaderMappingAuditEntries,
  type HeaderMappingAuditEntry,
} from '@/app/lib/header-mapping-audit/build-header-mapping-audit';
import {
  buildHeaderMappingAuditSummary,
  saveHeaderMappingAuditLog,
} from '@/app/lib/header-mapping-audit/save-header-mapping-audit';

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
export type StandardOrderRow = Record<string, string>;

export interface OrderStandardFile {
  /** 기준헤더 배열 (고정) */
  baseHeaders: readonly string[];
  
  /** 기준헤더 순서대로 변환된 행 데이터 */
  rows: StandardOrderRow[];
  
  /** 매핑 실패한 헤더 배열 */
  unknownHeaders: string[];
}

/** Stage2 API가 행 청크 후속 요청에 헤더 매핑을 재사용할 수 있게 내려주는 확장 필드 */
export type OrderPipelineStage2Response = OrderStandardFile & {
  _reuseHeaderMapping?: MappingResult;
};

export type OrderPipelineRunOptions = {
  /** 동일 파일의 이전 청크에서 받은 매핑(헤더 길이 일치 필수). 있으면 Stage1/AI를 건너뜁니다. */
  reuseHeaderMapping?: MappingResult;
};

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

function buildFallbackMappingDetails(
  headers: string[],
  mappedBaseHeaders: (string | null)[]
): HeaderMappingDetail[] {
  return headers.map((originalHeader, index) => {
    const baseHeader = mappedBaseHeaders[index] ?? null;
    return {
      originalHeader,
      baseHeader,
      status: baseHeader ? 'AUTO_MATCHED' : 'UNMAPPED',
      method: baseHeader ? 'BASE_HEADER' : 'UNMAPPED',
      confidenceReason: baseHeader
        ? '기존 재사용 매핑에 상세 정보가 없어 기준헤더 매핑 결과만 보존'
        : '기존 재사용 매핑에서 기준헤더가 없음',
    };
  });
}

function normalizeMappingDetails(
  headers: string[],
  mappingResult: Pick<MappingResult, 'mappedBaseHeaders' | 'mappingDetails'>
): HeaderMappingDetail[] {
  if (
    Array.isArray(mappingResult.mappingDetails) &&
    mappingResult.mappingDetails.length === headers.length
  ) {
    return mappingResult.mappingDetails;
  }

  return buildFallbackMappingDetails(headers, mappingResult.mappedBaseHeaders);
}

function isHeaderMappingAuditEnabled(): boolean {
  return process.env.HEADER_MAPPING_AUDIT_ENABLED === 'true';
}

function isNonProduction(): boolean {
  return process.env.NODE_ENV !== 'production';
}

async function buildHeaderMappingAuditSafely(
  headers: string[],
  rows: string[][],
  mappingDetails: HeaderMappingDetail[],
  source: string | null,
): Promise<void> {
  try {
    const auditEntries = buildHeaderMappingAuditEntries(headers, rows, mappingDetails);
    const summary = buildHeaderMappingAuditSummary(auditEntries);

    if (isNonProduction()) {
      console.info('[Stage2] Header Mapping Audit Summary:', summary);
    }

    if (!isHeaderMappingAuditEnabled()) {
      return;
    }

    const saveResult = await saveHeaderMappingAuditLog({
      entries: auditEntries,
      summary,
      userId: null,
      fileHash: null,
      source,
    });

    if (isNonProduction()) {
      console.info('[Stage2] Header Mapping Audit Save Summary:', {
        ok: saveResult.ok,
        entryCount: saveResult.ok ? saveResult.entryCount : 0,
        skipped: saveResult.ok ? false : saveResult.skipped,
      });
    }
  } catch {
    if (isNonProduction()) {
      console.warn('[Stage2] Header Mapping Audit 저장 준비 실패: 주문 변환은 계속 진행합니다.');
    }
  }
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
export async function run(
  cleanInputFile: CleanInputFile,
  fileSessionId?: string,
  options?: OrderPipelineRunOptions,
): Promise<OrderPipelineStage2Response> {
  // 0. 입력 검증 체크포인트
  const inputValidation = validateCleanInputFile(cleanInputFile);
  logValidationResult(inputValidation, 'Stage2 Order Pipeline - Input');
  throwIfInvalid(inputValidation, 'Stage2 Order Pipeline - Input');
  
  const { headers, rows } = cleanInputFile;
  const prompt = (cleanInputFile as { prompt?: string | null })?.prompt;
  const baseHeaderSet = new Set(BASE_HEADERS);
  const isNormalizedText =
    Array.isArray(headers) &&
    headers.length >= BASE_HEADERS.length * 0.7 &&
    headers.every((h) => baseHeaderSet.has(h as any));
  
  if (isNonProduction()) {
    console.info('[Stage2] Input Summary:', {
      headerCount: headers.length,
      rowCount: rows.length,
      hasPrompt: typeof prompt === 'string' && prompt.length > 0,
      promptLength: typeof prompt === 'string' ? prompt.length : 0,
      isNormalizedText,
    });
  }

  // 1. Stage1 헤더 매핑 (청크 후속 요청은 재사용 매핑으로 AI/DB 매핑 생략)
  let mappingResult: MappingResult;
  const reuse = options?.reuseHeaderMapping;
  if (reuse) {
    if (reuse.mappedBaseHeaders.length !== headers.length) {
      throw new Error(
        `reuseHeaderMapping.mappedBaseHeaders 길이(${reuse.mappedBaseHeaders.length})가 headers 길이(${headers.length})와 일치하지 않습니다.`,
      );
    }
    mappingResult = {
      mappedBaseHeaders: [...reuse.mappedBaseHeaders],
      unknownHeaders: [...reuse.unknownHeaders],
      mappingDetails: normalizeMappingDetails(headers, reuse),
    };
    if (isNonProduction()) {
      console.info('[Stage2] Reuse Header Mapping:', { headerCount: headers.length });
    }
  } else if (isNormalizedText) {
    if (isNonProduction()) {
      console.info('[Stage2] Text Flow - Skip Header Mapping:', { headerCount: headers.length });
    }
    mappingResult = {
      mappedBaseHeaders: [...headers],
      unknownHeaders: [] as string[],
      mappingDetails: headers.map((header) => ({
        originalHeader: header,
        baseHeader: header,
        status: 'AUTO_MATCHED',
        method: 'BASE_HEADER',
        confidenceReason: '텍스트 정규화 흐름에서 이미 기준헤더 구조로 전달됨',
      })),
    };
  } else {
    if (isNonProduction()) {
      console.info('[Stage1] Starting Header Mapping for Order File:', { headerCount: headers.length });
    }
    try {
      mappingResult = await mapTemplateToBase(headers, undefined, fileSessionId);
    } catch (error) {
      if (isNonProduction()) {
        console.error('[Stage2] Header Mapping failed:', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
          headerCount: headers.length,
        });
      }
      throw error;
    }
    if (isNonProduction()) {
      console.info('[Stage2] Header Mapping Result Summary:', {
        mappedCount: mappingResult.mappedBaseHeaders.filter(Boolean).length,
        unknownCount: mappingResult.unknownHeaders.length,
        detailCount: mappingResult.mappingDetails?.length ?? 0,
      });
    }
  }
  
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
  
  if (isNonProduction()) {
    console.info('[Stage2] Header Map Summary:', {
      mappedCount: Object.keys(headerMap).length,
      unknownCount: unknownHeaders.length,
    });
  }
  const mappingDetails = normalizeMappingDetails(headers, mappingResult);
  if (isNonProduction()) {
    console.info('[Stage2] Header Mapping Details Summary:', {
      detailCount: mappingDetails.length,
      autoMatchedCount: mappingDetails.filter((detail) => detail.status === 'AUTO_MATCHED').length,
      lowConfidenceCount: mappingDetails.filter((detail) => detail.status === 'LOW_CONFIDENCE').length,
      unmappedCount: mappingDetails.filter((detail) => detail.status === 'UNMAPPED').length,
      needsReviewCount: mappingDetails.filter((detail) => detail.status === 'NEEDS_REVIEW').length,
    });
  }
  await buildHeaderMappingAuditSafely(headers, rows, mappingDetails, cleanInputFile.sourceType);
  
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
          const value = coerceStage2CellValue(row[idx], baseHeader);
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

        const nonEmptyDistinctCount = new Set(
          sourceIndices
            .map((idx) => coerceStage2CellValue(row[idx], baseHeader))
            .filter((v) => v.length > 0)
        ).size;
        if (isNonProduction() && nonEmptyDistinctCount > 1) {
          console.warn('[Stage2] 동일 기준헤더로 매핑된 열에 서로 다른 값', {
            baseHeader,
            rowIndex,
            distinctValueCount: nonEmptyDistinctCount,
            sourceHeaders: sourceIndices.map((i) => headers[i]),
          });
        }

        // 선택된 값이 있으면 사용, 없으면 첫 번째 인덱스의 값 사용 (빈 값일 수 있음)
        if (selectedValue) {
          transformedRow[baseHeader] = selectedValue;
        } else {
          transformedRow[baseHeader] = coerceStage2CellValue(
            row[sourceIndices[0]],
            baseHeader,
          );
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

  if (reuse) {
    return orderStandardFile;
  }

  return {
    ...orderStandardFile,
    _reuseHeaderMapping: {
      mappedBaseHeaders: [...mappingResult.mappedBaseHeaders],
      unknownHeaders: [...mappingResult.unknownHeaders],
      mappingDetails: normalizeMappingDetails(headers, mappingResult),
    },
  };
}
