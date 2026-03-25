import type { MappingRule } from "@/app/pipeline/3pl/contracts/template-analysis.contract";

export function sortMappingRules(rules: MappingRule[]): MappingRule[] {
  return [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}
