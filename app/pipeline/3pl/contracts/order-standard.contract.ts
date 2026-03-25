import type { RequiredExecutionPlan } from "@/app/pipeline/3pl/contracts/required-execution-plan.contract";
import type { RequiredReason } from "@/app/pipeline/3pl/contracts/template-analysis.contract";

export interface MissingReason {
  key: string;
  reason?: RequiredReason;
}

export interface OrderStandardRow {
  [key: string]: unknown;
  missingReasons?: MissingReason[];
}

/**
 * Stage2 입력 계약
 * FixedInput은 Stage3 전용이므로 포함하지 않는다.
 */
export interface Stage2NormalizeInput {
  orderRows: Record<string, unknown>[];
  executionPlan: RequiredExecutionPlan;
  /**
   * 사용자 업로드 매핑 파일(첫 행 헤더, 이후 데이터). 변환 실행 시에만 전달.
   */
  mappingData?: string[][] | null;
}
