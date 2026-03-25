import type {
  MappingPlan,
  RequiredFieldSpec,
  TemplateAnalysisResult,
} from "@/app/pipeline/3pl/contracts/template-analysis.contract";

/**
 * Stage2 실행 전용 계약
 * templateHeaders를 제거해 템플릿 구조 직접 참조를 차단한다.
 */
export interface RequiredExecutionPlan {
  outputSchemaVersion: "3pl-template-analysis.v1";
  requiredFields: RequiredFieldSpec[];
  mappingPlan: MappingPlan;
}

export function toRequiredExecutionPlan(
  analysis: TemplateAnalysisResult
): RequiredExecutionPlan {
  const templateHeaderSet = new Set(analysis.templateHeaders);
  // Stage2는 templateHeaders 자체를 전달받지 않지만,
  // 실행 계획에 포함되는 mapping rule은 "템플릿에 존재하는 컬럼"만 남긴다.
  // (상품코드 없는 템플릿이면 productCode mapping rule 자체가 executionPlan에 존재하지 않게 됨)
  const filteredRules = analysis.mappingPlan.rules.filter(
    (rule) => templateHeaderSet.has(rule.key) && rule.mappingNeeded,
  );

  return {
    outputSchemaVersion: analysis.outputSchemaVersion,
    requiredFields: analysis.requiredFields,
    mappingPlan: { rules: filteredRules },
  };
}
