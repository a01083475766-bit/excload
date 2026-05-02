/**
 * EXCLOAD Template Pipeline - 기준헤더 매핑 함수
 * 
 * ⚠️ CONSTITUTION.md v4.0 준수
 * Stage1 Template Pipeline 전용
 * 
 * 택배사 헤더를 기준헤더로 매핑합니다.
 * 매핑 실패 헤더가 2개 이상일 경우 AI 호출 함수를 연결합니다.
 * 
 * 헌법 준수:
 * - 1파일당 최대 1회 AI 호출 보장 (guard 추가)
 * - Stage2/Stage3 참조 금지
 */

import { ALIAS_DICTIONARY } from '../base/alias-dictionary';
import { BASE_HEADERS } from '../base/base-headers';
import { getHeaderAliasDictionary } from '@/app/lib/header-alias-cache';
import { prisma } from '@/app/lib/prisma';
import { isExcloudPipelineDebugMapping } from '@/app/lib/excloud-pipeline-debug';
import { refineMappedBaseHeadersCouriers } from './refine-mapped-base-headers';

/**
 * 매핑 결과 인터페이스
 */
export interface MappingResult {
  /** 매핑된 기준헤더 배열 (courierHeaders 순서 유지, 매핑 실패 시 null) */
  mappedBaseHeaders: (string | null)[];
  
  /** 매핑 실패한 헤더 배열 */
  unknownHeaders: string[];
}

/**
 * AI 헤더 매핑 함수 타입
 * unknownHeaders를 받아서 매핑 결과를 반환합니다.
 * 
 * @param unknownHeaders - 매핑 실패한 헤더 배열
 * @returns 헤더를 한글 기준헤더로 매핑한 Record 객체
 */
export type AIHeaderMappingFunction = (
  unknownHeaders: string[]
) => Promise<Record<string, string>>;

/**
 * AI 호출 guard: 1파일당 1회만 호출하도록 보장
 * fileSessionId별로 관리
 */
const aiCallGuardMap = new Map<string, boolean>();

/**
 * AI 호출 guard 리셋 (테스트용 또는 재사용 시)
 */
export function resetAICallGuard(fileSessionId?: string): void {
  if (fileSessionId) {
    aiCallGuardMap.delete(fileSessionId);
  } else {
    aiCallGuardMap.clear();
  }
}

/**
 * 헤더 정규화 함수
 * 공백 제거, 괄호 제거, 점 제거, 한글/숫자 외 제거
 * 
 * @param header - 정규화할 헤더 문자열
 * @returns 정규화된 헤더 문자열
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
 * 택배사 헤더를 기준헤더로 매핑합니다.
 * 
 * @param courierHeaders - 택배사 헤더 배열
 * @param aiMappingFn - AI 매핑 함수 (optional, unknownHeaders 2개 이상일 때만 호출)
 * @param fileSessionId - 파일 세션 ID (AI 호출 제한용)
 * @returns 매핑 결과 (mappedBaseHeaders, unknownHeaders)
 * 
 * @example
 * ```typescript
 * const result = await mapTemplateToBase(
 *   ['받는분', '받는분전화', '알수없는헤더']
 * );
 * ```
 */
export async function mapTemplateToBase(
  courierHeaders: string[],
  aiMappingFn?: AIHeaderMappingFunction,
  fileSessionId?: string
): Promise<MappingResult> {
  console.log("===== mapTemplateToBase START =====");
  console.log("headers:", courierHeaders);
  console.log("fileSessionId:", fileSessionId);
  
  // 파일 세션별 guard 초기화 (새 파일 처리 시작 시)
  const sessionKey = fileSessionId || 'default';
  let aiCallGuard = aiCallGuardMap.get(sessionKey) || false;
  
  const mappedBaseHeaders: (string | null)[] = [];
  const unknownHeaders: string[] = [];
  
  // DB에서 HeaderAlias 로드 (서버 사이드에서만 가능)
  let dbAliasDictionary: Record<string, string> = {};
  if (typeof window === 'undefined') {
    try {
      dbAliasDictionary = await getHeaderAliasDictionary();
      if (Object.keys(dbAliasDictionary).length > 0) {
        console.log('[Stage1] DB Alias Dictionary loaded:', Object.keys(dbAliasDictionary).length, 'aliases');
      }
    } catch (error) {
      console.error('[Stage1] DB Alias Dictionary 로드 실패:', error);
      // DB 로드 실패 시에도 계속 진행
    }
  }
  
  // 1단계: Alias Dictionary를 사용한 기본 매핑
  // 우선순위: DB Alias > 기존 ALIAS_DICTIONARY
  for (let i = 0; i < courierHeaders.length; i++) {
    const courierHeader = courierHeaders[i];
    
    const normalizedHeader = normalizeHeader(courierHeader);
    
    // BASE_HEADERS에 포함된 헤더인지 먼저 확인
    if (BASE_HEADERS.includes(normalizedHeader as any)) {
      mappedBaseHeaders[i] = normalizedHeader;
      continue;
    }
    
    // DB Alias Dictionary에서 먼저 확인
    const dbBaseHeaderKey = dbAliasDictionary[courierHeader] || dbAliasDictionary[normalizedHeader];
    
    if (dbBaseHeaderKey) {
      // DB Alias 매핑 성공
      mappedBaseHeaders[i] = dbBaseHeaderKey;
      continue;
    }
    
    // 기존 ALIAS_DICTIONARY에서 확인
    const baseHeaderKey =
      ALIAS_DICTIONARY[courierHeader] ||
      ALIAS_DICTIONARY[normalizedHeader];
    
    if (baseHeaderKey) {
      // 매핑 성공
      mappedBaseHeaders[i] = baseHeaderKey;
    } else {
      // 매핑 실패
      mappedBaseHeaders[i] = null;
      unknownHeaders.push(courierHeader);
    }
  }
  
    console.log('[Stage1] Unknown Headers:', unknownHeaders);
  console.log('[Stage1] unknownHeaders.length:', unknownHeaders.length);
  
  // 2단계: unknownHeaders가 1개 이상일 경우 AI 호출
  // 헌법 준수: 1파일당 최대 1회 호출 보장
  
  console.log('[Stage1] AI Trigger Condition Check');
  const condition = unknownHeaders.length > 0 && !aiCallGuard;
  console.log('unknownHeaders.length:', unknownHeaders.length);
  console.log('aiCallGuard:', aiCallGuard);
  console.log('condition:', condition);
  
  if (unknownHeaders.length > 0 && !aiCallGuard) {
    // guard 설정: 이후 호출 방지 (파일 세션별로 관리)
    aiCallGuardMap.set(sessionKey, true);
    aiCallGuard = true;
    
    console.log('[Stage1] AI Header Mapping Triggered');
    
    try {
      // AI 매핑 함수가 제공되지 않은 경우 API 호출
      let aiMapping: Record<string, string>;
      
      if (aiMappingFn) {
        // 외부에서 제공된 함수 사용
        aiMapping = await aiMappingFn(unknownHeaders);
      } else {
        // 헌법 준수: 서버 내부에서는 ai-gateway의 handler를 직접 import하여 호출
        // 클라이언트에서는 fetch 사용
        if (typeof window === 'undefined') {
          // 서버 사이드: handler 직접 호출
          const { handleHeaderMap } = await import('@/app/api/ai-gateway/route');
          const apiKey = process.env.OPENAI_API_KEY;
          
          if (!apiKey) {
            throw new Error('시스템 설정 오류가 발생했습니다.');
          }
          
          const payload = {
            type: 'header-map' as const,
            unknownHeaders,
            baseHeaders: BASE_HEADERS,
          };
          console.log('[AI GATEWAY REQUEST]', payload);

          const response = await handleHeaderMap(
            payload,
            apiKey
          );
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`헤더 매핑 실패: ${errorData.error || response.status}`);
          }
          
          aiMapping = await response.json();
          console.log('[AI GATEWAY RESPONSE]', aiMapping);
        } else {
          // 클라이언트 사이드: API 호출
        const payload = {
          type: 'header-map',
          unknownHeaders,
          baseHeaders: BASE_HEADERS,
          fileSessionId: fileSessionId,
        };
        console.log('[AI GATEWAY REQUEST]', payload);

        const response = await fetch('/api/ai-gateway', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        
        if (!response.ok) {
          throw new Error(`헤더 매핑 API 호출 실패: ${response.status}`);
        }
        
        aiMapping = await response.json();
        console.log('[AI GATEWAY RESPONSE]', aiMapping);
        }
      }
      
      // AI 매핑 결과를 반영 및 로그 저장
      for (let i = 0; i < courierHeaders.length; i++) {
        const courierHeader = courierHeaders[i];
        
        // 현재 null인 경우에만 AI 매핑 결과 확인
        if (mappedBaseHeaders[i] === null) {
          const aiMappedValue = aiMapping[courierHeader];
          
          if (aiMappedValue) {
            const mappedHeader = aiMappedValue;
            const baseHeader = mappedHeader; // AI가 반환한 값이 기준헤더
            
            mappedBaseHeaders[i] = baseHeader;
            
            // AI Header Mapping Log 저장 (중복 방지)
            try {
              // originalHeader + baseHeader 조합이 이미 존재하는지 확인
              const existingLog = await prisma.aiHeaderMappingLog.findFirst({
                where: {
                  originalHeader: courierHeader,
                  baseHeader: baseHeader,
                },
              });
              
              // 중복이 아닌 경우에만 저장
              if (!existingLog) {
                await prisma.aiHeaderMappingLog.create({
                  data: {
                    originalHeader: courierHeader,
                    aiMappedHeader: mappedHeader,
                    baseHeader: baseHeader,
                    sourceType: 'excel',
                  },
                });
              }
            } catch (logError) {
              // 로그 저장 실패해도 매핑은 계속 진행
              // 에러 로그는 출력하지 않음
            }
          
          // unknownHeaders에서 제거
          const index = unknownHeaders.indexOf(courierHeader);
          if (index !== -1) {
            unknownHeaders.splice(index, 1);
            }
          }
        }
      }
      
      console.log('[Stage1] AI Mapping Result:', aiMapping);
    } catch (error) {
      console.error('[Stage2 INNER ERROR]', error);
      throw error;
    }
  }

  const beforeRefine = [...mappedBaseHeaders];
  const refinedMapped = refineMappedBaseHeadersCouriers(courierHeaders, mappedBaseHeaders);

  if (isExcloudPipelineDebugMapping()) {
    console.log('[Stage1 mappedBaseHeaders BEFORE refine]', beforeRefine);
    console.log('[Stage1 mappedBaseHeaders AFTER refine]', refinedMapped);
  }

  return {
    mappedBaseHeaders: refinedMapped,
    unknownHeaders,
  };
}

