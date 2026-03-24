import type {
  MissingReason,
  OrderStandardRow,
  Stage2NormalizeInput,
} from "@/app/pipeline/3pl/contracts/order-standard.contract";
import { assertNoTemplateLeak } from "@/app/pipeline/3pl/guards/assert-no-template-leak";
import { assertSupportedSchemaVersion } from "@/app/pipeline/3pl/guards/assert-supported-schema-version";
import { applyConditionalMapping } from "@/app/pipeline/3pl/stage2/apply-conditional-mapping";

function toCellValue(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  const text = String(value).trim();
  return text ? text : undefined;
}

function addMissingReason(
  row: OrderStandardRow,
  reason: MissingReason
): void {
  const list = (row.missingReasons ??= []);
  list.push(reason);
}

export function normalizeOrder(input: Stage2NormalizeInput): OrderStandardRow[] {
  assertNoTemplateLeak(input);
  assertSupportedSchemaVersion(input.executionPlan.outputSchemaVersion);

  const normalizedRows: OrderStandardRow[] = input.orderRows.map((rawRow) => {
    // RequiredFields만으로 row를 생성하면 mapping source 필드(상품명/옵션명/바코드)가 누락될 수 있다.
    // Stage2 output의 렌더링은 Stage3(templateHeaders 기준)이므로,
    // 여기서는 rawRow의 전체 key를 먼저 복사한 뒤 requiredFields로 누락만 판단/정리한다.
    const row: OrderStandardRow = { missingReasons: [] };

    for (const [key, rawValue] of Object.entries(rawRow)) {
      row[key] = toCellValue(rawValue);
    }

    for (const spec of input.executionPlan.requiredFields) {
      const value = toCellValue(rawRow[spec.key]);
      row[spec.key] = value;

      if (spec.required && !value) {
        addMissingReason(row, {
          key: spec.key,
          reason: spec.reason,
        });
      }
    }

    if (row.missingReasons && row.missingReasons.length === 0) {
      delete row.missingReasons;
    }

    return row;
  });

  return applyConditionalMapping(
    normalizedRows,
    input.executionPlan.mappingPlan,
    input.mappingData ?? null
  );
}
