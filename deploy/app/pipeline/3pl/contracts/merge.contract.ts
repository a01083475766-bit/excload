import type { TemplateAnalysisResult } from "@/app/pipeline/3pl/contracts/template-analysis.contract";
import type { OrderStandardRow } from "@/app/pipeline/3pl/contracts/order-standard.contract";

export interface FixedInput3PL {
  [templateHeader: string]: string | undefined;
}

/**
 * FixedInput은 Stage3에서만 병합된다.
 */
export interface MergeInput {
  analysis: TemplateAnalysisResult;
  standardRows: OrderStandardRow[];
  fixedInput: FixedInput3PL;
}

export interface MergedTemplateRow {
  [templateHeader: string]: string | undefined;
}
