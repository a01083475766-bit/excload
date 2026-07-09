# 송장 업로드 smoke test — 주문 snapshot 예시

> **더미 데이터 전용** — 실제 고객·운영 주문이 아닙니다.  
> 아래 값은 smoke test 실행 **전** 테스트 계정 DB에 **수동으로** 준비할 때 참고하는 예시입니다.  
> 자동 seed·Prisma seed·Production insert는 **하지 않습니다**.

**공통 scope (업로드 시 동일하게 지정)**

| 항목 | 값 |
|------|-----|
| `userId` | *(smoke test 전용 로그인 계정 ID)* |
| `provider` | `COUPANG` |
| `integrationAccountId` | `acc-smoke-test-001` |
| `batchId` | *(테스트용 `OrderSyncBatch` ID — 예: `batch-smoke-001`)* |

---

## 주문 1 — 자동 매칭 성공

| 필드 | 값 |
|------|-----|
| `id` (예시) | `smoke-order-sync-001` |
| `provider` | `COUPANG` |
| `integrationAccountId` | `acc-smoke-test-001` |
| `mallOrderNo` | `TEST-MALL-ORDER-001` |
| `excloadOrderNo` | `EX-SMOKE-0001` |
| `receiverName` | `테스트일` |
| `receiverPhone` | `010-0000-0001` |
| `receiverAddress` | `테스트시 테스트구 테스트로 1` |
| `productSummary` | `스모크테스트상품A x1` |
| `orderStatus` | `PAID` |

| 항목 | 값 |
|------|-----|
| `expectedScenario` | `MATCHED_CONFIDENT` (주문번호 + 전화 일치) |
| `expectedAction` | `confirm` |
| `expectedExportIncluded` | `true` |

**대응 CSV 행**: 1행 (`TEST-MALL-ORDER-001`, 송장 `91000000001`)

---

## 주문 2 — 확인 필요 (MATCHED_WARNING)

| 필드 | 값 |
|------|-----|
| `id` (예시) | `smoke-order-sync-002` |
| `provider` | `COUPANG` |
| `integrationAccountId` | `acc-smoke-test-001` |
| `mallOrderNo` | `TEST-MALL-ORDER-002` |
| `excloadOrderNo` | `EX-SMOKE-0002` |
| `receiverName` | `테스트이` |
| `receiverPhone` | `010-0000-0002` |
| `receiverAddress` | `테스트시 테스트구 테스트로 2` |
| `productSummary` | `스모크테스트상품B x1` |
| `orderStatus` | `PAID` |

| 항목 | 값 |
|------|-----|
| `expectedScenario` | `MATCHED_WARNING` (주문번호 일치, 전화 불일치) |
| `expectedAction` | `confirm` (검토 후 확정) |
| `expectedExportIncluded` | `true` |

**대응 CSV 행**: 2행 — 주문번호는 맞고 전화는 `010-0000-0099`로 **의도적 불일치**

---

## 주문 3 — 매칭 실패 후 주문 연결

| 필드 | 값 |
|------|-----|
| `id` (예시) | `smoke-order-sync-003` |
| `provider` | `COUPANG` |
| `integrationAccountId` | `acc-smoke-test-001` |
| `mallOrderNo` | `TEST-MALL-ORDER-003` |
| `excloadOrderNo` | `EX-SMOKE-0003` |
| `receiverName` | `테스트삼` |
| `receiverPhone` | `010-0000-0003` |
| `receiverAddress` | `테스트시 테스트구 테스트로 3` |
| `productSummary` | `스모크테스트상품C x1` |
| `orderStatus` | `PAID` |

| 항목 | 값 |
|------|-----|
| `expectedScenario` | `NOT_MATCHED` (CSV에 주문번호 없음, 이름·전화 불일치) |
| `expectedAction` | `link` → `smoke-order-sync-003` 선택 |
| `expectedExportIncluded` | `true` (연결·확정 처리 후) |

**대응 CSV 행**: 3행 — 주문번호 **비움**, 이름 `테스트외`, 전화 `010-0000-9999`

---

## 주문 4 — 제외 처리

| 필드 | 값 |
|------|-----|
| `id` (예시) | `smoke-order-sync-004` |
| `provider` | `COUPANG` |
| `integrationAccountId` | `acc-smoke-test-001` |
| `mallOrderNo` | `TEST-MALL-ORDER-004` |
| `excloadOrderNo` | `EX-SMOKE-0004` |
| `receiverName` | `테스트사` |
| `receiverPhone` | `010-0000-0004` |
| `receiverAddress` | `테스트시 테스트구 테스트로 4` |
| `productSummary` | `스모크테스트상품D x1` |
| `orderStatus` | `PAID` |

| 항목 | 값 |
|------|-----|
| `expectedScenario` | `MATCHED_CONFIDENT` (자동 매칭 성공) |
| `expectedAction` | `exclude` |
| `expectedExportIncluded` | `false` |

**대응 CSV 행**: 4행 — 정상 매칭되지만 smoke에서 **제외** 버튼으로 처리

---

## 주문 5 — 송장번호 앞자리 0 보존

| 필드 | 값 |
|------|-----|
| `id` (예시) | `smoke-order-sync-005` |
| `provider` | `COUPANG` |
| `integrationAccountId` | `acc-smoke-test-001` |
| `mallOrderNo` | `TEST-MALL-ORDER-005` |
| `excloadOrderNo` | `EX-SMOKE-0005` |
| `receiverName` | `테스트오` |
| `receiverPhone` | `010-0000-0005` |
| `receiverAddress` | `테스트시 테스트구 테스트로 5` |
| `productSummary` | `스모크테스트상품E x1` |
| `orderStatus` | `PAID` |

| 항목 | 값 |
|------|-----|
| `expectedScenario` | `MATCHED_CONFIDENT` |
| `expectedAction` | `confirm` |
| `expectedExportIncluded` | `true` |

**대응 CSV 행**: 5행 — 송장번호 `000123456789` (앞자리 `0` 유지 확인)

---

## smoke 완료 후 export 기대 요약

| CSV 행 | 처리 | export 포함 |
|--------|------|-------------|
| 1 | confirm | ✅ |
| 2 | confirm (warning 검토 후) | ✅ |
| 3 | link | ✅ |
| 4 | exclude | ❌ |
| 5 | confirm | ✅ (`송장번호` = `000123456789`) |

**export 파일에 없어야 하는 것**: 수취인명, 전화번호, 주소, `rawRowJson`, `candidateOrdersJson`

---

## 준비 체크리스트

- [ ] 위 5건이 **동일 `userId`**·`provider`·`integrationAccountId`로 snapshot에 존재
- [ ] 운영 주문·실제 고객 데이터와 **ID/주문번호가 겹치지 않음**
- [ ] `shipment-upload-smoke-file.csv`와 주문번호·전화·이름이 시나리오대로 대응
- [ ] smoke 후 테스트 batch·주문 정리 계획 수립 (Production DB 공유 시 특히 중요)
