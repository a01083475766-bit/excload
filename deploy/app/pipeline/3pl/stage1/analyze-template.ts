import type { TemplateAnalysisResult } from "@/app/pipeline/3pl/contracts/template-analysis.contract";
import { buildMappingPlan } from "@/app/pipeline/3pl/stage1/build-mapping-plan";
import { buildRequiredFields } from "@/app/pipeline/3pl/stage1/build-required-fields";

type TemplateData =
  | string[]
  | { headers?: string[] }
  | Array<Record<string, unknown>>;

function extractTemplateHeaders(templateData: TemplateData): string[] {
  if (Array.isArray(templateData) && templateData.every((item) => typeof item === "string")) {
    return templateData.map((header) => header.trim()).filter(Boolean);
  }

  if (!Array.isArray(templateData) && Array.isArray(templateData.headers)) {
    return templateData.headers.map((header) => header.trim()).filter(Boolean);
  }

  if (Array.isArray(templateData) && templateData.length > 0) {
    const firstRow = templateData[0];
    if (firstRow && typeof firstRow === "object") {
      return Object.keys(firstRow);
    }
  }

  return [];
}

export function analyzeTemplate(templateData: TemplateData): TemplateAnalysisResult {
  const templateHeaders = extractTemplateHeaders(templateData);
  const requiredFields = buildRequiredFields(templateHeaders);
  const mappingPlan = buildMappingPlan(templateHeaders);

  return {
    outputSchemaVersion: "3pl-template-analysis.v1",
    templateHeaders,
    requiredFields,
    mappingPlan,
  };
}
