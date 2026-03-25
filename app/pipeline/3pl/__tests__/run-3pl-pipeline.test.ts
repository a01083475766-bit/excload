import assert from "node:assert/strict";
import { test } from "vitest";

import { run3PLPipeline } from "@/app/pipeline/3pl/run-3pl-pipeline";
import { sortMappingRules } from "@/app/pipeline/3pl/utils/sort-mapping-rules";
import type { MappingRule } from "@/app/pipeline/3pl/contracts/template-analysis.contract";

test("정상 흐름: rows/meta/mapping 결과 검증", () => {
  const result = run3PLPipeline({
    templateHeaders: ["수령인명", "주소", "상품코드"],
    orderData: [{ 수령인명: "홍길동", 주소: "서울", 상품명: "티셔츠" }],
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]["상품코드"], "티셔츠");
  assert.equal(result.meta.total, 1);
  assert.equal(result.meta.missingCount, 0);

  // 공통 검증: 헤더 순서 유지
  assert.deepEqual(Object.keys(result.rows[0]), ["수령인명", "주소", "상품코드"]);
});

test("필수값 누락: missingCount 및 빈값 처리 검증", () => {
  const result = run3PLPipeline({
    templateHeaders: ["수령인명", "주소"],
    orderData: [{ 수령인명: "홍길동", 주소: "" }],
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]["주소"], "");
  assert.equal(result.meta.total, 1);
  assert.equal(result.meta.missingCount, 1);

  // 공통 검증: undefined -> "" 변환
  const undefinedCase = run3PLPipeline({
    templateHeaders: ["수령인명", "주소"],
    orderData: [{ 수령인명: "홍길동" }],
  });
  assert.equal(undefinedCase.rows[0]["주소"], "");
});

test("매핑 우선순위: priority 내림차순 정렬 검증", () => {
  const rules: MappingRule[] = [
    { key: "A", mappingNeeded: true, mappingType: "productCode", priority: 10 },
    { key: "B", mappingNeeded: true, mappingType: "optionCode", priority: 100 },
    { key: "C", mappingNeeded: true, mappingType: "barcode", priority: 50 },
    { key: "D", mappingNeeded: false },
  ];

  const sorted = sortMappingRules(rules);

  assert.deepEqual(
    sorted.map((rule) => rule.key),
    ["B", "C", "A", "D"]
  );
});
