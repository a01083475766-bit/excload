/**
 * 3PL Stage1 산출물 계약
 * Stage2 직접 전달 금지 (RequiredExecutionPlan으로 축소 전달)
 */
export interface MappingRule {
  key: string;
  mappingNeeded: boolean;
  mappingType?: "productCode" | "barcode" | "optionCode";
  sourceHint?: "productName" | "optionName" | "barcode";
  priority?: number;
}

export interface MappingPlan {
  rules: MappingRule[];
}

export type RequiredReason =
  | "recipient"
  | "address"
  | "contact"
  | "quantity"
  | "explicit";

export interface RequiredFieldSpec {
  key: string;
  required: boolean;
  reason?: RequiredReason;
}

export interface TemplateAnalysisResult {
  outputSchemaVersion: "3pl-template-analysis.v1";
  templateHeaders: string[];
  requiredFields: RequiredFieldSpec[];
  mappingPlan: MappingPlan;
}
