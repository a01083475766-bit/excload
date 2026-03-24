import type {
  MappingPlan,
  MappingRule,
} from "@/app/pipeline/3pl/contracts/template-analysis.contract";
import { normalizeHeader } from "@/app/pipeline/3pl/utils/normalize-header";

function toMappingRule(header: string): MappingRule {
  const normalized = normalizeHeader(header);

  if (normalized.includes("상품코드") || normalized.includes("sku")) {
    return {
      key: header,
      mappingNeeded: true,
      mappingType: "productCode",
      sourceHint: "productName",
      priority: 100,
    };
  }

  if (normalized.includes("옵션코드")) {
    return {
      key: header,
      mappingNeeded: true,
      mappingType: "optionCode",
      sourceHint: "optionName",
      priority: 90,
    };
  }

  if (normalized.includes("바코드")) {
    return {
      key: header,
      mappingNeeded: true,
      mappingType: "barcode",
      sourceHint: "barcode",
      priority: 95,
    };
  }

  return {
    key: header,
    mappingNeeded: false,
  };
}

export function buildMappingPlan(templateHeaders: string[]): MappingPlan {
  return {
    rules: templateHeaders.map((header) => toMappingRule(header)),
  };
}
