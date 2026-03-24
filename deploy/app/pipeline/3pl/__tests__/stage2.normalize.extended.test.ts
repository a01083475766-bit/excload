import { test } from "vitest";
import assert from "node:assert/strict";

import { normalizeOrder } from "@/app/pipeline/3pl/stage2/normalize-order";
import { mergeToTemplate } from "@/app/pipeline/3pl/stage3/merge-to-template";
import type {
  MappingPlan,
  MappingRule,
  RequiredFieldSpec,
} from "@/app/pipeline/3pl/contracts/template-analysis.contract";
import type { RequiredExecutionPlan } from "@/app/pipeline/3pl/contracts/required-execution-plan.contract";

function makeExecutionPlan(rules: MappingRule[]): RequiredExecutionPlan {
  const mappingPlan: MappingPlan = { rules };
  const requiredFields: RequiredFieldSpec[] = [];

  return {
    outputSchemaVersion: "3pl-template-analysis.v1",
    requiredFields,
    mappingPlan,
  };
}

function assertRowContainsAllRawKeys(
  row: Record<string, unknown>,
  rawRow: Record<string, unknown>
) {
  for (const key of Object.keys(rawRow)) {
    assert.ok(key in row, `Expected row to contain key: ${key}`);
  }
}

function assertStage3KeysOrder(
  outputRow: Record<string, unknown>,
  templateHeaders: string[]
) {
  assert.deepEqual(Object.keys(outputRow), templateHeaders);
}

test("케이스 1: 옵션 누락 - 상품명 단독 매칭 가능/ missingReasons 없음", () => {
  const rawRow = { 상품명: "사과 1kg", 수량: "2" };

  const executionPlan = makeExecutionPlan([
    {
      key: "상품코드",
      mappingNeeded: true,
      mappingType: "productCode",
      sourceHint: "productName",
      priority: 100,
    },
  ]);

  const templateHeaders = ["상품코드", "수량"];

  const [row] = normalizeOrder({ executionPlan, orderRows: [rawRow] });
  const [outputRow] = mergeToTemplate([row], templateHeaders);

  console.log("[case1] input rawRow:", rawRow);
  console.log("[case1] output stage2 row:", row);
  console.log("[case1] missingReasons:", row.missingReasons);
  console.log("[case1] output stage3 row:", outputRow);

  assertRowContainsAllRawKeys(row as Record<string, unknown>, rawRow);
  assert.equal((row as any)["상품코드"], "사과 1kg");
  assert.equal(row.missingReasons, undefined);

  assert.equal(outputRow["상품코드"], "사과 1kg");
  assert.equal(outputRow["수량"], "2");
  assertStage3KeysOrder(outputRow, templateHeaders);
});

test("케이스 2: 옵션 공백/빈문자 - trim → undefined 처리 및 옵션 없는 것으로 동작", () => {
  const rawRow = { 상품명: "사과 1kg", 옵션명: "   ", 수량: "1" };

  const executionPlan = makeExecutionPlan([
    {
      key: "상품코드",
      mappingNeeded: true,
      mappingType: "productCode",
      sourceHint: "productName",
      priority: 100,
    },
    {
      key: "옵션코드",
      mappingNeeded: true,
      mappingType: "optionCode",
      sourceHint: "optionName",
      priority: 90,
    },
  ]);

  const templateHeaders = ["상품코드", "옵션코드", "수량"];

  const [row] = normalizeOrder({ executionPlan, orderRows: [rawRow] });
  const [outputRow] = mergeToTemplate([row], templateHeaders);

  console.log("[case2] input rawRow:", rawRow);
  console.log("[case2] output stage2 row:", row);
  console.log("[case2] missingReasons:", row.missingReasons);
  console.log("[case2] output stage3 row:", outputRow);

  assert.equal((row as any)["상품코드"], "사과 1kg");
  assert.equal((row as any)["옵션코드"], undefined);
  assert.equal((row as any)["옵션명"], undefined);

  assert.ok(row.missingReasons?.some((m) => m.key === "옵션코드"));
  assert.equal(outputRow["옵션코드"], "");
  assertStage3KeysOrder(outputRow, templateHeaders);
});

test("케이스 3: 바코드 기반 매핑 - 상품명 없이도 상품코드 채움", () => {
  const rawRow = { 바코드: "8800001111111", 수량: "3" };

  // 기대사항에 맞추기 위해, 상품코드 규칙을 barcode 기반으로 mock 구성
  const executionPlan = makeExecutionPlan([
    {
      key: "상품코드",
      mappingNeeded: true,
      mappingType: "barcode",
      sourceHint: "barcode",
      priority: 100,
    },
  ]);

  const templateHeaders = ["상품코드", "수량"];

  const [row] = normalizeOrder({ executionPlan, orderRows: [rawRow] });
  const [outputRow] = mergeToTemplate([row], templateHeaders);

  console.log("[case3] input rawRow:", rawRow);
  console.log("[case3] output stage2 row:", row);
  console.log("[case3] missingReasons:", row.missingReasons);
  console.log("[case3] output stage3 row:", outputRow);

  assertRowContainsAllRawKeys(row as Record<string, unknown>, rawRow);
  assert.equal((row as any)["상품명"], undefined);
  assert.equal((row as any)["상품코드"], "8800001111111");
  assert.equal(row.missingReasons, undefined);

  assert.equal(outputRow["상품코드"], "8800001111111");
  assertStage3KeysOrder(outputRow, templateHeaders);
});

test("케이스 4: 이상한 키 포함 - rawRow 전체 복사 유지 및 매핑 실패 시 missingReasons 기록", () => {
  const rawRow = { "상품명1": "바나나 1송이", "옵션정보": "없음", 수량: "1" };

  const executionPlan = makeExecutionPlan([
    {
      key: "상품코드",
      mappingNeeded: true,
      mappingType: "productCode",
      sourceHint: "productName",
      priority: 100,
    },
    {
      key: "옵션코드",
      mappingNeeded: true,
      mappingType: "optionCode",
      sourceHint: "optionName",
      priority: 90,
    },
  ]);

  const templateHeaders = ["상품코드", "옵션코드", "수량"];

  const [row] = normalizeOrder({ executionPlan, orderRows: [rawRow] });
  const [outputRow] = mergeToTemplate([row], templateHeaders);

  console.log("[case4] input rawRow:", rawRow);
  console.log("[case4] output stage2 row:", row);
  console.log("[case4] missingReasons:", row.missingReasons);
  console.log("[case4] output stage3 row:", outputRow);

  assertRowContainsAllRawKeys(row as Record<string, unknown>, rawRow);
  assert.ok((row as any)["상품명1"] === "바나나 1송이");
  assert.ok((row as any)["옵션정보"] === "없음");

  assert.ok(row.missingReasons?.some((m) => m.key === "상품코드"));
  assert.ok(row.missingReasons?.some((m) => m.key === "옵션코드"));

  assert.equal(outputRow["상품코드"], "");
  assert.equal(outputRow["옵션코드"], "");

  assertStage3KeysOrder(outputRow, templateHeaders);
  assert.equal((outputRow as any)["상품명1"], undefined);
  assert.equal((outputRow as any)["옵션정보"], undefined);
});

test("케이스 5: 매핑 실패 - 상품코드 undefined 유지 및 missingReasons에 mapping_not_found 포함", () => {
  const rawRow = { 상품명: "존재하지않는상품", 옵션명: "특대", 수량: "1" };

  const executionPlan = makeExecutionPlan([
    {
      key: "상품코드",
      mappingNeeded: true,
      mappingType: "productCode",
      sourceHint: "productName",
      priority: 100,
    },
    {
      key: "옵션코드",
      mappingNeeded: true,
      mappingType: "optionCode",
      sourceHint: "optionName",
      priority: 90,
    },
  ]);

  const templateHeaders = ["상품코드", "옵션코드", "수량"];

  const [row] = normalizeOrder({ executionPlan, orderRows: [rawRow] });
  const [outputRow] = mergeToTemplate([row], templateHeaders);

  console.log("[case5] input rawRow:", rawRow);
  console.log("[case5] output stage2 row:", row);
  console.log("[case5] missingReasons:", row.missingReasons);
  console.log("[case5] output stage3 row:", outputRow);

  assert.equal((row as any)["상품코드"], undefined);
  assert.equal((outputRow as any)["상품코드"], "");

  assert.ok(
    row.missingReasons?.some((m: any) => m.key === "상품코드" && m.reason === "explicit"),
    "Expected missingReasons to contain {key:'상품코드', reason:'explicit'}"
  );
});

