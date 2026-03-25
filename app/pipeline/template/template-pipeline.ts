/**
 * EXCLOAD Template Pipeline - 메인 파이프라인
 * 
 * ⚠️ CONSTITUTION.md v4.0 준수
 * Stage1 Template Pipeline 전용
 * 
 * extract → map → TemplateBridgeFile 생성
 * 
 * 금지사항:
 * - 주문 데이터 생성 금지
 * - 고정입력 병합 금지
 * - OrderStandardFile 참조 금지
 * - Stage2, Stage3 참조 금지
 */

import { extractTemplateHeaders } from './extract-template-headers';
import { mapTemplateToBase, type AIHeaderMappingFunction } from './map-template-to-base';
import type { TemplateBridgeFile, TemplatePipelineResult } from './types';
import { BASE_HEADERS } from '../base/base-headers';
import { validateTemplateBridgeFile, validateHeaderMapping, logValidationResult, throwIfInvalid } from '../utils/validation';

/**
 * Template Pipeline을 실행합니다.
 * 
 * 1. 엑셀 파일에서 헤더 추출
 * 2. 택배사 헤더를 기준헤더로 매핑
 * 3. TemplateBridgeFile 생성
 * 
 * @param file - 입력 엑셀 파일 (File 객체)
 * @param aiMappingFn - AI 매핑 함수 (optional, unknownHeaders 2개 이상일 때만 호출)
 * @param fileSessionId - 파일 세션 ID (AI 호출 제한용)
 * @returns TemplatePipelineResult
 * 
 * @example
 * ```typescript
 * const result = await runTemplatePipeline(file);
 * // result.bridgeFile: TemplateBridgeFile
 * ```
 */
export async function runTemplatePipeline(
  file: File,
  aiMappingFn?: AIHeaderMappingFunction,
  fileSessionId?: string
): Promise<TemplatePipelineResult> {
  // 1. 헤더 추출
  const courierHeaders = await extractTemplateHeaders(file);
  
  // 2. 기준헤더로 매핑
  const mappingResult = await mapTemplateToBase(courierHeaders, aiMappingFn, fileSessionId);
  
  // 3. TemplateBridgeFile 생성
  const bridgeFile: TemplateBridgeFile = {
    baseHeaders: [...BASE_HEADERS], // 기준헤더 전체 배열
    courierHeaders: courierHeaders, // 택배사 헤더 배열
    mappedBaseHeaders: mappingResult.mappedBaseHeaders, // 매핑된 기준헤더 (courierHeaders 순서 유지)
    unknownHeaders: mappingResult.unknownHeaders, // 매핑 실패 헤더
  };
  
  // 4. 검증 체크포인트
  const validationResult = validateTemplateBridgeFile(bridgeFile);
  logValidationResult(validationResult, 'Stage1 Template Pipeline');
  throwIfInvalid(validationResult, 'Stage1 Template Pipeline');
  
  // 5. 헤더 매핑 일관성 검증
  const mappingValidation = validateHeaderMapping(
    bridgeFile.courierHeaders,
    bridgeFile.mappedBaseHeaders,
    bridgeFile.baseHeaders
  );
  logValidationResult(mappingValidation, 'Stage1 Template Pipeline - Header Mapping');
  throwIfInvalid(mappingValidation, 'Stage1 Template Pipeline - Header Mapping');
  
  // 템플릿 비교를 위한 전역 변수 저장
  if (typeof window !== 'undefined') {
    const templateNumber = (window as any).__templateExecutionCount || 0;
    const nextTemplateNumber = templateNumber + 1;
    (window as any).__templateExecutionCount = nextTemplateNumber;
    
    const templateKey = `__template${nextTemplateNumber}_courierHeaders` as keyof Window;
    (window as any)[templateKey] = [...courierHeaders]; // 배열 복사본 저장
    
    // 템플릿 2가 실행된 경우 비교
    if (nextTemplateNumber === 2) {
      const template1Headers = (window as any).__template1_courierHeaders || [];
      const template2Headers = (window as any).__template2_courierHeaders || [];
      
      console.log('\n========== 템플릿 1 vs 템플릿 2 비교 ==========');
      console.log(`템플릿 1 길이: ${template1Headers.length}`);
      console.log(`템플릿 2 길이: ${template2Headers.length}`);
      console.log(`길이 동일 여부: ${template1Headers.length === template2Headers.length}`);
      
      if (template1Headers.length === template2Headers.length) {
        let allMatch = true;
        const differences: Array<{ index: number; template1: string; template2: string }> = [];
        
        template1Headers.forEach((header1: string, index: number) => {
          const header2 = template2Headers[index];
          if (header1 !== header2) {
            allMatch = false;
            differences.push({ index, template1: header1, template2: header2 });
          }
        });
        
        console.log(`순서 및 내용 동일 여부: ${allMatch}`);
        
        if (allMatch) {
          console.log('✅ 두 템플릿의 courierHeaders가 정확히 동일합니다.');
        } else {
          console.log('❌ 두 템플릿의 courierHeaders가 다릅니다:');
          differences.forEach((diff) => {
            console.log(`  인덱스 ${diff.index}: 템플릿1="${diff.template1}", 템플릿2="${diff.template2}"`);
          });
        }
      } else {
        console.log('❌ 두 템플릿의 courierHeaders 길이가 다릅니다.');
        console.log('템플릿 1:', template1Headers);
        console.log('템플릿 2:', template2Headers);
      }
      console.log('==========================================\n');
    }
  }
  
  return {
    bridgeFile,
  };
}
