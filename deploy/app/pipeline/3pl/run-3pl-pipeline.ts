import { toRequiredExecutionPlan } from "@/app/pipeline/3pl/contracts/required-execution-plan.contract";
import { analyzeTemplate } from "@/app/pipeline/3pl/stage1/analyze-template";
import { normalizeOrder } from "@/app/pipeline/3pl/stage2/normalize-order";
import {
  mergeToTemplate,
  type TemplateOutputRow,
} from "@/app/pipeline/3pl/stage3/merge-to-template";
import type { MissingReason } from "@/app/pipeline/3pl/contracts/order-standard.contract";

export interface Run3PLPipelineInput {
  templateHeaders: string[];
  orderData: Record<string, unknown>[];
  /** 매핑 파일(저장된 데이터). 변환 실행 시에만 적용 */
  mappingData?: string[][] | null;
}

export interface Run3PLPipelineResult {
  rows: TemplateOutputRow[];
  /**
   * 미리보기용 누락 사유 (outputRows와 동일한 인덱스)
   */
  rowMissingReasons: MissingReason[][];
  meta: {
    total: number;
    missingCount: number;
  };
}

export function run3PLPipeline(
  input: Run3PLPipelineInput
): Run3PLPipelineResult {
  // Stage1: template 분석 -> 실행 계획 축소
  const analysis = analyzeTemplate(input.templateHeaders);
  const executionPlan = toRequiredExecutionPlan(analysis);

  // Stage2: 주문 표준화 + 조건부 매핑 실행
  const normalizedRows = normalizeOrder({
    executionPlan,
    orderRows: input.orderData,
    mappingData: input.mappingData ?? null,
  });

  // Stage3: 템플릿 헤더 구조로 렌더링
  const outputRows = mergeToTemplate(normalizedRows, input.templateHeaders);

  const rowMissingReasons: MissingReason[][] = normalizedRows.map(
    (row) => row.missingReasons ?? []
  );

  const missingCount = normalizedRows.reduce(
    (acc, row) => acc + (row.missingReasons?.length ?? 0),
    0
  );

  return {
    rows: outputRows,
    rowMissingReasons,
    meta: {
      total: outputRows.length,
      missingCount,
    },
  };
}
