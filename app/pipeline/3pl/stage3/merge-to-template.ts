import type { OrderStandardRow } from "@/app/pipeline/3pl/contracts/order-standard.contract";
import { assertNoStage3Mutation } from "@/app/pipeline/3pl/guards/assert-no-stage3-mutation";

export interface TemplateOutputRow {
  [header: string]: string;
}

function toCellText(value: unknown): string {
  if (value == null) {
    return "";
  }
  return String(value);
}

function pickHeaderValues(
  row: OrderStandardRow,
  templateHeaders: string[]
): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  for (const header of templateHeaders) {
    const value = row[header];
    snapshot[header] = value == null ? undefined : String(value);
  }
  return snapshot;
}

export function mergeToTemplate(
  rows: OrderStandardRow[],
  templateHeaders: string[]
): TemplateOutputRow[] {
  const beforeValues = rows.map((row) => pickHeaderValues(row, templateHeaders));

  const mergedRows: TemplateOutputRow[] = rows.map((row) => {
    const outputRow: TemplateOutputRow = {};
    for (const header of templateHeaders) {
      outputRow[header] = toCellText(row[header]);
    }
    return outputRow;
  });

  const afterValues = rows.map((row) => pickHeaderValues(row, templateHeaders));
  assertNoStage3Mutation(beforeValues, afterValues);

  if (mergedRows.length !== rows.length) {
    throw new Error("Stage3 merge mismatch: row length changed.");
  }

  return mergedRows;
}
