/**
 * EXCLOAD 파이프라인 데이터 검증 유틸리티
 * 
 * ⚠️ CONSTITUTION.md v4.1 준수
 * 
 * 목적: 데이터 일관성과 매핑 오류를 미연에 방지
 * 
 * 기능:
 * 1. 타입 검증 (런타임 타입 체크)
 * 2. 데이터 일관성 검증 (배열 길이, 키 존재 여부 등)
 * 3. 매핑 검증 (헤더 매핑 일관성)
 * 4. 명확한 에러 메시지 제공
 */

import type { TemplateBridgeFile } from '../template/types';
import type { OrderStandardFile } from '../order/order-pipeline';
import type { FixedInput, PreviewRow } from '../merge/types';
import type { CleanInputFile } from '../preprocess/types';

/**
 * 검증 결과 타입
 */
export interface ValidationResult {
  /** 검증 성공 여부 */
  isValid: boolean;
  /** 에러 메시지 배열 */
  errors: string[];
  /** 경고 메시지 배열 */
  warnings: string[];
  /** 검증 실패 시 복구 가이드 */
  recoveryGuide?: string[];
}

/**
 * 검증 에러 클래스
 */
export class ValidationError extends Error {
  public readonly errors: string[];
  public readonly warnings: string[];
  public readonly recoveryGuide?: string[];

  constructor(
    message: string,
    errors: string[],
    warnings: string[] = [],
    recoveryGuide?: string[]
  ) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
    this.warnings = warnings;
    this.recoveryGuide = recoveryGuide;
  }
}

/**
 * CleanInputFile 검증
 */
export function validateCleanInputFile(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 타입 체크
  if (!input || typeof input !== 'object') {
    errors.push('CleanInputFile이 객체가 아닙니다.');
    return {
      isValid: false,
      errors,
      warnings,
      recoveryGuide: ['입력 파일이 올바른 형식인지 확인하세요.'],
    };
  }

  const file = input as Partial<CleanInputFile>;

  // headers 검증
  if (!Array.isArray(file.headers)) {
    errors.push('headers가 배열이 아닙니다.');
  } else {
    if (file.headers.length === 0) {
      errors.push('headers 배열이 비어있습니다.');
    }
    // 빈 헤더 체크
    const emptyHeaders = file.headers.filter((h, i) => !h || h.trim() === '');
    if (emptyHeaders.length > 0) {
      warnings.push(`빈 헤더가 ${emptyHeaders.length}개 있습니다. (인덱스: ${file.headers.map((h, i) => !h || h.trim() === '' ? i : null).filter(i => i !== null).join(', ')})`);
    }
  }

  // rows 검증
  if (!Array.isArray(file.rows)) {
    errors.push('rows가 배열이 아닙니다.');
  } else {
    if (file.rows.length === 0) {
      warnings.push('rows 배열이 비어있습니다. (데이터가 없을 수 있습니다)');
    } else {
      // 첫 번째 행의 길이와 headers 길이 일치 여부 확인
      const firstRowLength = Array.isArray(file.rows[0]) ? file.rows[0].length : 0;
      const headersLength = Array.isArray(file.headers) ? file.headers.length : 0;
      if (firstRowLength !== headersLength) {
        errors.push(
          `첫 번째 행의 컬럼 수(${firstRowLength})와 headers 길이(${headersLength})가 일치하지 않습니다.`
        );
      }
    }
  }

  // sourceType 검증
  if (file.sourceType !== 'excel') {
    warnings.push(`sourceType이 'excel'이 아닙니다. (현재: ${file.sourceType})`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    recoveryGuide: errors.length > 0 ? [
      '1. 입력 파일의 헤더 행이 올바른지 확인하세요.',
      '2. 데이터 행의 컬럼 수가 헤더와 일치하는지 확인하세요.',
      '3. 빈 셀이 있는지 확인하고 필요시 채워주세요.',
    ] : undefined,
  };
}

/**
 * TemplateBridgeFile 검증
 */
export function validateTemplateBridgeFile(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 타입 체크
  if (!input || typeof input !== 'object') {
    errors.push('TemplateBridgeFile이 객체가 아닙니다.');
    return {
      isValid: false,
      errors,
      warnings,
      recoveryGuide: ['TemplateBridgeFile이 올바른 형식인지 확인하세요.'],
    };
  }

  const bridgeFile = input as Partial<TemplateBridgeFile>;

  // baseHeaders 검증
  if (!Array.isArray(bridgeFile.baseHeaders)) {
    errors.push('baseHeaders가 배열이 아닙니다.');
  } else {
    if (bridgeFile.baseHeaders.length === 0) {
      errors.push('baseHeaders 배열이 비어있습니다.');
    }
  }

  // courierHeaders 검증
  if (!Array.isArray(bridgeFile.courierHeaders)) {
    errors.push('courierHeaders가 배열이 아닙니다.');
  } else {
    if (bridgeFile.courierHeaders.length === 0) {
      errors.push('courierHeaders 배열이 비어있습니다.');
    }
  }

  // mappedBaseHeaders 검증
  if (!Array.isArray(bridgeFile.mappedBaseHeaders)) {
    errors.push('mappedBaseHeaders가 배열이 아닙니다.');
  } else {
    // courierHeaders와 mappedBaseHeaders 길이 일치 여부 확인
    const courierLength = Array.isArray(bridgeFile.courierHeaders) ? bridgeFile.courierHeaders.length : 0;
    const mappedLength = bridgeFile.mappedBaseHeaders.length;
    if (courierLength !== mappedLength) {
      errors.push(
        `courierHeaders 길이(${courierLength})와 mappedBaseHeaders 길이(${mappedLength})가 일치하지 않습니다.`
      );
    }

    // 매핑 실패한 헤더 확인
    const unmappedCount = bridgeFile.mappedBaseHeaders.filter(h => h === null || h === undefined).length;
    if (unmappedCount > 0) {
      warnings.push(`매핑되지 않은 헤더가 ${unmappedCount}개 있습니다.`);
    }
  }

  // unknownHeaders 검증
  if (!Array.isArray(bridgeFile.unknownHeaders)) {
    errors.push('unknownHeaders가 배열이 아닙니다.');
  } else {
    if (bridgeFile.unknownHeaders.length > 0) {
      warnings.push(`매핑 실패한 헤더가 ${bridgeFile.unknownHeaders.length}개 있습니다: ${bridgeFile.unknownHeaders.join(', ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    recoveryGuide: errors.length > 0 ? [
      '1. Template Pipeline(Stage1)이 올바르게 실행되었는지 확인하세요.',
      '2. courierHeaders와 mappedBaseHeaders의 길이가 일치하는지 확인하세요.',
      '3. 매핑되지 않은 헤더가 있다면 AI 매핑을 시도하거나 수동으로 매핑하세요.',
    ] : undefined,
  };
}

/**
 * OrderStandardFile 검증
 */
export function validateOrderStandardFile(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 타입 체크
  if (!input || typeof input !== 'object') {
    errors.push('OrderStandardFile이 객체가 아닙니다.');
    return {
      isValid: false,
      errors,
      warnings,
      recoveryGuide: ['OrderStandardFile이 올바른 형식인지 확인하세요.'],
    };
  }

  const orderFile = input as Partial<OrderStandardFile>;

  // baseHeaders 검증
  if (!Array.isArray(orderFile.baseHeaders)) {
    errors.push('baseHeaders가 배열이 아닙니다.');
  } else {
    if (orderFile.baseHeaders.length === 0) {
      errors.push('baseHeaders 배열이 비어있습니다.');
    }
  }

  // rows 검증
  if (!Array.isArray(orderFile.rows)) {
    errors.push('rows가 배열이 아닙니다.');
  } else {
    if (orderFile.rows.length === 0) {
      warnings.push('rows 배열이 비어있습니다. (데이터가 없을 수 있습니다)');
    } else {
      // 각 행이 baseHeaders를 모두 포함하는지 확인
      const baseHeaders = Array.isArray(orderFile.baseHeaders) ? orderFile.baseHeaders : [];
      orderFile.rows.forEach((row, index) => {
        if (!row || typeof row !== 'object') {
          errors.push(`rows[${index}]가 객체가 아닙니다.`);
        } else {
          // baseHeaders의 모든 키가 row에 있는지 확인
          const missingKeys = baseHeaders.filter(key => !(key in row));
          if (missingKeys.length > 0 && index === 0) {
            // 첫 번째 행만 체크 (모든 행을 체크하면 너무 많을 수 있음)
            warnings.push(`첫 번째 행에 baseHeaders 키가 누락되었습니다: ${missingKeys.join(', ')}`);
          }
        }
      });
    }
  }

  // unknownHeaders 검증
  if (!Array.isArray(orderFile.unknownHeaders)) {
    errors.push('unknownHeaders가 배열이 아닙니다.');
  } else {
    if (orderFile.unknownHeaders.length > 0) {
      warnings.push(`매핑 실패한 헤더가 ${orderFile.unknownHeaders.length}개 있습니다: ${orderFile.unknownHeaders.join(', ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    recoveryGuide: errors.length > 0 ? [
      '1. Order Pipeline(Stage2)이 올바르게 실행되었는지 확인하세요.',
      '2. rows의 각 행이 baseHeaders의 모든 키를 포함하는지 확인하세요.',
      '3. 매핑 실패한 헤더가 있다면 AI 매핑을 시도하거나 수동으로 매핑하세요.',
    ] : undefined,
  };
}

/**
 * FixedInput 검증
 */
export function validateFixedInput(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 타입 체크
  if (!input || typeof input !== 'object') {
    // FixedInput은 선택적이므로 null이나 undefined는 경고만
    if (input === null || input === undefined) {
      return {
        isValid: true,
        errors: [],
        warnings: ['FixedInput이 설정되지 않았습니다. (선택 사항)'],
      };
    }
    errors.push('FixedInput이 객체가 아닙니다.');
    return {
      isValid: false,
      errors,
      warnings,
      recoveryGuide: ['FixedInput이 올바른 형식인지 확인하세요.'],
    };
  }

  const fixedInput = input as FixedInput;

  // 모든 값이 문자열인지 확인
  Object.entries(fixedInput).forEach(([key, value]) => {
    if (typeof value !== 'string') {
      warnings.push(`FixedInput[${key}]의 값이 문자열이 아닙니다. (타입: ${typeof value})`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * PreviewRow 검증
 * 
 * ⚠️ validation은 courierHeaders를 기준으로 수행하되,
 * mappedBaseHeaders[i] !== null인 경우에만 검사합니다.
 * 
 * 즉, 매핑된 courierHeaders만 검증 대상입니다.
 * 
 * @param input - 검증할 PreviewRow 객체
 * @param courierHeaders - 택배사 헤더 배열
 * @param mappedBaseHeaders - 매핑된 기준헤더 배열 (null 포함 가능)
 */
export function validatePreviewRow(
  input: unknown,
  courierHeaders: string[],
  mappedBaseHeaders: (string | null)[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 타입 체크
  if (!input || typeof input !== 'object') {
    errors.push('PreviewRow가 객체가 아닙니다.');
    return {
      isValid: false,
      errors,
      warnings,
      recoveryGuide: ['PreviewRow가 올바른 형식인지 확인하세요.'],
    };
  }

  const previewRow = input as PreviewRow;

  // 길이 일치 확인
  if (courierHeaders.length !== mappedBaseHeaders.length) {
    errors.push(
      `courierHeaders 길이(${courierHeaders.length})와 mappedBaseHeaders 길이(${mappedBaseHeaders.length})가 일치하지 않습니다.`
    );
    return {
      isValid: false,
      errors,
      warnings,
    };
  }

  // mappedBaseHeaders[i] !== null인 경우에만 해당 courierHeaders[i] 검사
  const validatedHeaders: string[] = [];
  const missingKeys: string[] = [];
  const emptyValues: string[] = [];

  for (let i = 0; i < courierHeaders.length; i++) {
    if (mappedBaseHeaders[i] !== null && mappedBaseHeaders[i] !== undefined) {
      const courierHeader = courierHeaders[i];
      validatedHeaders.push(courierHeader);

      // previewRow에 해당 courierHeader 키가 있는지 확인
      if (!(courierHeader in previewRow)) {
        missingKeys.push(courierHeader);
      } else {
        // 값이 비어있는지 확인
        const value = previewRow[courierHeader];
        if (!value || value.trim() === '') {
          emptyValues.push(courierHeader);
        }
      }
    }
  }

  // 검증 결과
  if (missingKeys.length > 0) {
    warnings.push(
      `매핑된 courierHeaders 중 PreviewRow에 키가 누락된 헤더: ${missingKeys.join(', ')}`
    );
  }

  if (emptyValues.length > 0 && emptyValues.length === validatedHeaders.length) {
    warnings.push(
      `매핑된 courierHeaders의 모든 값이 비어있습니다: ${emptyValues.join(', ')}`
    );
  }

  // previewRow에 courierHeaders에 없는 키가 있는지 확인
  const previewRowKeys = Object.keys(previewRow);
  const extraKeys = previewRowKeys.filter(key => !courierHeaders.includes(key));
  if (extraKeys.length > 0) {
    warnings.push(
      `PreviewRow에 courierHeaders에 없는 키가 있습니다: ${extraKeys.join(', ')}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Stage3 병합 전 통합 검증
 * 
 * TemplateBridgeFile + OrderStandardFile + FixedInput의 일관성 검증
 */
export function validateMergeInputs(
  bridgeFile: unknown,
  orderFile: unknown,
  fixedInput: unknown
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 각 입력 검증
  const bridgeValidation = validateTemplateBridgeFile(bridgeFile);
  const orderValidation = validateOrderStandardFile(orderFile);
  const fixedValidation = validateFixedInput(fixedInput);

  errors.push(...bridgeValidation.errors);
  errors.push(...orderValidation.errors);
  errors.push(...fixedValidation.errors);
  warnings.push(...bridgeValidation.warnings);
  warnings.push(...orderValidation.warnings);
  warnings.push(...fixedValidation.warnings);

  // 통합 검증: bridgeFile의 mappedBaseHeaders와 orderFile의 baseHeaders 일치 여부
  if (bridgeValidation.isValid && orderValidation.isValid) {
    const bridge = bridgeFile as TemplateBridgeFile;
    const order = orderFile as OrderStandardFile;

    // bridgeFile.mappedBaseHeaders에 있는 baseHeader가 orderFile.baseHeaders에 있는지 확인
    const bridgeBaseHeaders = new Set(
      bridge.mappedBaseHeaders.filter((h): h is string => h !== null && h !== undefined)
    );
    const orderBaseHeaders = new Set(order.baseHeaders);

    const missingInOrder = Array.from(bridgeBaseHeaders).filter(h => !orderBaseHeaders.has(h));
    if (missingInOrder.length > 0) {
      errors.push(
        `bridgeFile.mappedBaseHeaders에 있지만 orderFile.baseHeaders에 없는 헤더: ${missingInOrder.join(', ')}`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    recoveryGuide: errors.length > 0 ? [
      '1. Stage1(Template Pipeline)과 Stage2(Order Pipeline)이 올바르게 실행되었는지 확인하세요.',
      '2. bridgeFile.mappedBaseHeaders와 orderFile.baseHeaders가 일치하는지 확인하세요.',
      '3. 매핑되지 않은 헤더가 있다면 AI 매핑을 시도하거나 수동으로 매핑하세요.',
      '4. 각 파이프라인 단계의 검증 결과를 확인하세요.',
    ] : undefined,
  };
}

/**
 * 데이터 매핑 일관성 검증
 * 
 * 서로 다른 소스에서 가져온 데이터가 일관성 있게 매핑되는지 확인
 */
export function validateMappingConsistency(
  source1: Record<string, unknown>,
  source2: Record<string, unknown>,
  mapping: Record<string, string> // source1의 키 -> source2의 키 매핑
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 매핑된 키들이 양쪽 소스에 모두 존재하는지 확인
  Object.entries(mapping).forEach(([key1, key2]) => {
    if (!(key1 in source1)) {
      errors.push(`매핑된 키 "${key1}"가 source1에 없습니다.`);
    }
    if (!(key2 in source2)) {
      errors.push(`매핑된 키 "${key2}"가 source2에 없습니다.`);
    }

    // 양쪽 모두 값이 있는 경우 타입 일치 여부 확인
    if (key1 in source1 && key2 in source2) {
      const value1 = source1[key1];
      const value2 = source2[key2];
      const type1 = typeof value1;
      const type2 = typeof value2;

      if (type1 !== type2) {
        warnings.push(
          `매핑된 키 "${key1}" -> "${key2}"의 타입이 다릅니다. (${type1} vs ${type2})`
        );
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    recoveryGuide: errors.length > 0 ? [
      '1. 매핑 설정이 올바른지 확인하세요.',
      '2. source1과 source2에 필요한 키가 모두 존재하는지 확인하세요.',
      '3. 데이터 소스가 올바르게 로드되었는지 확인하세요.',
    ] : undefined,
  };
}

/**
 * 헤더 매핑 일관성 검증
 * 
 * courierHeaders와 mappedBaseHeaders의 매핑이 일관성 있는지 확인
 */
export function validateHeaderMapping(
  courierHeaders: string[],
  mappedBaseHeaders: (string | null)[],
  baseHeaders: readonly string[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 길이 일치 여부
  if (courierHeaders.length !== mappedBaseHeaders.length) {
    errors.push(
      `courierHeaders 길이(${courierHeaders.length})와 mappedBaseHeaders 길이(${mappedBaseHeaders.length})가 일치하지 않습니다.`
    );
  }

  // mappedBaseHeaders에 있는 baseHeader가 실제 baseHeaders에 존재하는지 확인
  const baseHeadersSet = new Set(baseHeaders);
  mappedBaseHeaders.forEach((mappedHeader, index) => {
    if (mappedHeader !== null && mappedHeader !== undefined) {
      if (!baseHeadersSet.has(mappedHeader)) {
        errors.push(
          `인덱스 ${index}: mappedBaseHeaders[${index}]="${mappedHeader}"가 baseHeaders에 없습니다.`
        );
      }
    }
  });

  // 매핑되지 않은 헤더 확인
  const unmappedIndices: number[] = [];
  mappedBaseHeaders.forEach((mappedHeader, index) => {
    if (mappedHeader === null || mappedHeader === undefined) {
      unmappedIndices.push(index);
    }
  });

  if (unmappedIndices.length > 0) {
    const unmappedHeaders = unmappedIndices.map(i => courierHeaders[i]).filter(Boolean);
    warnings.push(
      `매핑되지 않은 헤더가 ${unmappedIndices.length}개 있습니다: ${unmappedHeaders.join(', ')}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    recoveryGuide: errors.length > 0 ? [
      '1. courierHeaders와 mappedBaseHeaders의 길이가 일치하는지 확인하세요.',
      '2. mappedBaseHeaders의 모든 값이 baseHeaders에 존재하는지 확인하세요.',
      '3. 매핑되지 않은 헤더가 있다면 AI 매핑을 시도하거나 수동으로 매핑하세요.',
    ] : undefined,
  };
}

/**
 * 검증 결과를 콘솔에 출력
 */
export function logValidationResult(result: ValidationResult, context: string = ''): void {
  const prefix = context ? `[${context}] ` : '';
  
  if (result.isValid) {
    console.log(`${prefix}✅ 검증 성공`);
    if (result.warnings.length > 0) {
      console.warn(`${prefix}⚠️ 경고:`, result.warnings);
    }
  } else {
    console.error(`${prefix}❌ 검증 실패:`, result.errors);
    if (result.warnings.length > 0) {
      console.warn(`${prefix}⚠️ 경고:`, result.warnings);
    }
    if (result.recoveryGuide) {
      console.info(`${prefix}💡 복구 가이드:`, result.recoveryGuide);
    }
  }
}

/**
 * 검증 실패 시 ValidationError를 throw
 */
export function throwIfInvalid(result: ValidationResult, context: string = ''): void {
  if (!result.isValid) {
    const message = result.errors.join('; ');
    throw new ValidationError(
      message,
      result.errors,
      result.warnings,
      result.recoveryGuide
    );
  }
}
