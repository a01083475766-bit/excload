/**
 * UnifiedInput용 Stage2 + Stage3 실행 헬퍼
 * 텍스트 주문 변환 / 이미지 주문 변환 결과를 공통 파이프라인으로 전달
 *
 * ⚠️ CONSTITUTION.md v4.0 준수
 * ⚠️ Stage0/1/2/3 구현 파일 직접 수정 금지
 *
 * 역할:
 * - CleanInputFile(ExtendedCleanInputFile)을 Stage2(Order Pipeline)에 전달
 * - Stage2 결과(OrderStandardFile)를 Stage3(Merge Pipeline)에 전달
 * - 최종 미리보기 구조(MergePipelineResult)를 반환
 *
 * 흐름:
 * ExtendedCleanInputFile → /api/order-pipeline(Stage2) → OrderStandardFile
 * → runMergePipeline(Stage3) → MergePipelineResult
 */

import type { ExtendedCleanInputFile } from './types';
import type { TemplateBridgeFile } from '@/app/pipeline/template/types';
import type { MergePipelineResult, FixedInput } from '@/app/pipeline/merge/types';
import { runMergePipeline } from '@/app/pipeline/merge/merge-pipeline';

export interface UnifiedInputPipelineParams {
  /** Stage0/1을 거치지 않고 생성된 CleanInputFile 확장 타입 */
  cleanInputFile: ExtendedCleanInputFile;
  /** 현재 선택된 TemplateBridgeFile (택배사 업로드 양식) */
  templateBridgeFile: TemplateBridgeFile | null;
  /** 고정 입력 값 (택배사 헤더 기준) */
  fixedHeaderValues: Record<string, string>;
  /** 파일/세션 단위 식별자 (AI 호출 통제용) */
  fileSessionId?: string;
}

export interface UnifiedInputPipelineResult {
  /** Stage2 Order Pipeline 결과 (기준헤더 통일된 주문 파일) */
  orderStandardFile: any; // OrderStandardFile 타입을 직접 import하지 않고 any로 둠 (UI 계층 분리 유지)
  /** Stage3 Merge Pipeline 결과 (미리보기 + 택배사 헤더) */
  mergeResult: MergePipelineResult | null;
}

/**
 * UnifiedInput용 Stage2 + Stage3 실행 헬퍼 함수
 *
 * UI 계층에서는 이 함수를 통해서만 Stage2/Stage3를 호출합니다.
 * - Stage2: /api/order-pipeline (기존 API 경로 재사용)
 * - Stage3: runMergePipeline (템플릿 + 주문 + 고정입력 병합)
 */
export async function runUnifiedInputOrderPipelines(
  params: UnifiedInputPipelineParams
): Promise<UnifiedInputPipelineResult> {
  const { cleanInputFile, templateBridgeFile, fixedHeaderValues, fileSessionId } = params;

  // Stage2: Order Pipeline 실행 (기존 API 재사용)
  const response = await fetch('/api/order-pipeline', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...cleanInputFile,
      fileSessionId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Stage2(Order Pipeline) 실행 실패: ${response.statusText}`);
  }

  const orderStandardFile = await response.json();

  // Stage3 실행 가능 여부 확인
  if (!templateBridgeFile) {
    // 템플릿이 없으면 Stage2 결과까지만 반환
    return {
      orderStandardFile,
      mergeResult: null,
    };
  }

  const fixedInput: FixedInput = { ...(fixedHeaderValues || {}) };

  const mergeResult = await runMergePipeline(
    templateBridgeFile,
    orderStandardFile,
    fixedInput
  );

  return {
    orderStandardFile,
    mergeResult,
  };
}

