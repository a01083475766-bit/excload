# 송장 업로드·export smoke test — Cleanup Runbook (D-4h-5)

> **상태**: cleanup runbook (2026-07-10) — **실행 전 승인 필요**  
> **단계**: D-4h-5  
> **목적**: D-4 smoke test **완료 후** 별도 **테스트 DB**에 남은 smoke 전용 데이터를 **안전하게 정리**하기 위한 절차  
> **선행 문서**  
> - [shipment-upload-export-smoke-execution-runbook.md](./shipment-upload-export-smoke-execution-runbook.md) — D-4h-4 (smoke 실행)  
> - [shipment-upload-export-smoke-data-insert-runbook.md](./shipment-upload-export-smoke-data-insert-runbook.md) — D-4h-3 (insert)  
> - [shipment-upload-export-test-db-setup-runbook.md](./shipment-upload-export-test-db-setup-runbook.md) — D-4h-2 (테스트 DB setup)  
> - [shipment-upload-export-test-db-plan.md](./shipment-upload-export-test-db-plan.md) — D-4h-1  
> - [shipment-upload-export-smoke-data-preparation-plan.md](./shipment-upload-export-smoke-data-preparation-plan.md) — D-4h-준비  
> - [shipment-upload-export-smoke-result-template.md](./shipment-upload-export-smoke-result-template.md) — D-4h-6

**본 문서는 cleanup 전 승인용 runbook입니다.**  
**D-4h-5 문서 작성 단계에서 수행하지 않는 것**: 실제 DB delete/update, SQL 실행, Prisma script 파일 작성, env 변경, migration 실행, smoke test 재실행, 쇼핑몰 API 호출, 송장전송.

**정리 대상**  
- **별도 테스트 DB**의 smoke 전용 row (운영 DB 정리 **아님**)

**정리 목표 아님**  
- 쇼핑몰 API **송장전송**  
- `docs/order-integration/smoke-samples/` 샘플 파일 삭제  
- git 레포 파일 변경

> ⚠️ 아래 SQL·Prisma 예시는 **문서 내 pseudo 코드**입니다. **실행 전 사용자 승인**이 필요하며, 본 D-4h-5 단계에서는 **실행하지 않습니다**.  
> ⚠️ `prisma/schema.prisma`와 **다르면 실행 전 반드시 schema·FK를 재확인**하세요.

---

## 1. 목적

| 항목 | 설명 |
|------|------|
| 무엇을 | smoke test 후 테스트 DB에 남은 **smoke 전용 데이터 delete 절차** 문서화 |
| 왜 | D-4h-3 insert + D-4h-4 smoke 실행으로 생성된 row를 **테스트 DB에서만** 정리 |
| 어디서 | **별도 테스트 DB** (운영 DB **아님**) |
| 무엇이 아님 | 실제 delete 실행, Prisma script 파일, 송장전송, 운영 데이터 정리 |

---

## 2. cleanup 전제 조건

cleanup **시작 전** 모두 충족:

| # | 조건 |
|---|------|
| C1 | [D-4h-4 smoke 실행](./shipment-upload-export-smoke-execution-runbook.md) **완료** (PASS/FAIL 무관 — 결과 기록 후 cleanup 검토) |
| C2 | 연결 DB가 **운영 DB와 분리**된 테스트 DB |
| C3 | **`.env.smoke.local`** 등 테스트 전용 env 사용 중 (운영 `.env` 미사용) |
| C4 | smoke 전용 **`userId` 확인** (`<SMOKE_USER_ID>` placeholder → 실제 값으로 치환) |
| C5 | 삭제 대상이 **smoke 전용 데이터**인지 read-only로 확인 (§6) |
| C6 | **사용자 승인** — 승인 전 delete/update **금지** |

---

## 3. 삭제 대상 데이터

D-4h-3 insert + D-4h-4 smoke 실행 후 테스트 DB에 남을 수 있는 row:

| 테이블 | 예상 수량 | 출처 | 비고 |
|--------|-----------|------|------|
| `ShipmentMatch` | smoke upload batch당 **최대 5건** | D-4h-4 업로드·매칭 | `uploadBatchId` = smoke upload batch |
| `ShipmentUploadRow` | **5건** (CSV 5행) | D-4h-4 업로드 | `uploadBatchId` = smoke upload batch |
| `ShipmentUploadBatch` | **1건** (이상 시 중단) | D-4h-4 업로드 | id는 실행 시 자동 생성 — **실행 기록 필수** |
| `OrderSyncOrder` | **5건** | D-4h-3 insert | `TEST-MALL-ORDER-001`~`005` |
| `OrderSyncBatch` | **1건** | D-4h-3 insert | 예: `batch-smoke-001` |
| `OrderIntegrationAccount` | **1건** | D-4h-3 insert | `acc-smoke-test-001` |
| smoke 전용 `User` | **0~1건** | D-4h-2/3 | **삭제 여부 별도 판단** (§5.8) |

**삭제하지 않는 것**

| 대상 | 이유 |
|------|------|
| `docs/order-integration/smoke-samples/*` | 레포 샘플 — DB cleanup과 무관 |
| `ExcloadOrderNoSequence` | smoke 고정 번호(`EX-SMOKE-*`) 사용 시 보통 미생성 |
| 운영 DB row | **절대 대상 아님** |

---

## 4. 삭제 기준

아래 조건을 **모두** 만족하는 row만 삭제 대상으로 간주합니다. 하나라도 불일치하면 **중단** (§9).

| 기준 | 값 |
|------|-----|
| `userId` | `<SMOKE_USER_ID>` (smoke 전용, 운영 user **금지**) |
| `provider` | `COUPANG` |
| `integrationAccountId` | `acc-smoke-test-001` |
| `mallOrderNo` | `TEST-MALL-ORDER-001` ~ `TEST-MALL-ORDER-005` |
| `excloadOrderNo` | `EX-SMOKE-0001` ~ `EX-SMOKE-0005` |
| `OrderSyncBatch.id` | `batch-smoke-001` (insert 시 고정 id 사용한 경우) |
| `ShipmentUploadBatch.id` | D-4h-4 실행 시 기록한 id (예: `<UPLOAD_BATCH_ID_FROM_SMOKE_RUN>`) |

**운영 데이터 혼입 방지**

- 삭제 쿼리에 `userId = '<SMOKE_USER_ID>'` **필수**  
- `mallOrderNo LIKE 'TEST-MALL-ORDER-%'` 외 **실주문번호 포함 row 0건** 확인 후 진행  
- count가 예상보다 **많으면 즉시 중단** (§9)

---

## 5. 삭제 순서

`prisma/schema.prisma` FK 기준 권장 순서 (2026-07). **실행 전 schema diff 확인 필수.**

### FK 참고 (요약)

| 자식 | 부모 | `onDelete` |
|------|------|------------|
| `ShipmentMatch` | `ShipmentUploadBatch`, `ShipmentUploadRow` | Cascade |
| `ShipmentMatch` | `OrderSyncOrder` | **SetNull** |
| `ShipmentUploadRow` | `ShipmentUploadBatch` | Cascade |
| `OrderSyncOrder` | `OrderSyncBatch` | Cascade |
| `OrderSyncBatch` | `OrderIntegrationAccount` | SetNull |
| `ShipmentUploadBatch` | `OrderIntegrationAccount` | SetNull |

부모를 먼저 지우면 cascade로 자식이 삭제될 수 있으나, **smoke scope만** 지우기 위해 **자식 → 부모** 순서를 권장합니다.

### 5.1 삭제 대상 read-only 확인

§6 쿼리로 count·식별자 확인. 예상과 다르면 **여기서 중단**.

### 5.2 `ShipmentMatch` 삭제

- `uploadBatchId` = smoke upload batch id  
- 또는 `userId` + `integrationAccountId` = `acc-smoke-test-001` + smoke upload batch 범위

### 5.3 `ShipmentUploadRow` 삭제

- `uploadBatchId` = smoke upload batch id  
- 예상: **5건**

### 5.4 `ShipmentUploadBatch` 삭제

- smoke 실행 시 기록한 `ShipmentUploadBatch.id` 1건  
- `userId` = `<SMOKE_USER_ID>`, `integrationAccountId` = `acc-smoke-test-001`

### 5.5 `OrderSyncOrder` 삭제

- `mallOrderNo` IN (`TEST-MALL-ORDER-001` … `005`)  
- 또는 id: `smoke-order-sync-001`~`005` (insert 시 고정 id 사용한 경우)  
- 예상: **5건**

### 5.6 `OrderSyncBatch` 삭제

- `id` = `batch-smoke-001` (또는 insert 시 사용한 batch id)  
- 남은 `OrderSyncOrder`가 **0건**인지 확인 후 삭제

### 5.7 `OrderIntegrationAccount` 삭제

- `id` = `acc-smoke-test-001`  
- 위 테이블 정리 완료 후 **1건**만 삭제

### 5.8 smoke 전용 `User` 삭제 여부 판단

| 옵션 | 설명 |
|------|------|
| **유지 (권장)** | 이후 smoke 재실행·회귀 시 재사용 |
| **삭제** | 테스트 DB 전용 일회성 계정이고 팀 정책상 제거 필요 시 |

`User` 삭제 시 NextAuth `Account` / `Session` cascade 여부는 schema 확인 후 진행. **기본 cleanup 범위에서는 User 삭제하지 않음.**

---

## 6. read-only 확인 쿼리

> **실행 전 사용자 승인 필요** — **테스트 DATABASE_URL**에서만 실행.

```sql
-- ⚠️ 실행 전 승인 필요 · 운영 DB 금지

-- smoke user 확인
SELECT id, email FROM "User" WHERE id = '<SMOKE_USER_ID>';

-- Upload batch (D-4h-4에서 기록한 id로 조회 권장)
SELECT id, "userId", provider, "integrationAccountId", status, "rowCount"
FROM "ShipmentUploadBatch"
WHERE "userId" = '<SMOKE_USER_ID>'
  AND "integrationAccountId" = 'acc-smoke-test-001';

-- Match / Row count (upload batch id 치환)
SELECT COUNT(*) AS match_count FROM "ShipmentMatch"
WHERE "uploadBatchId" = '<UPLOAD_BATCH_ID_FROM_SMOKE_RUN>';

SELECT COUNT(*) AS row_count FROM "ShipmentUploadRow"
WHERE "uploadBatchId" = '<UPLOAD_BATCH_ID_FROM_SMOKE_RUN>';

-- OrderSync 5건
SELECT "mallOrderNo", "excloadOrderNo", "integrationAccountId"
FROM "OrderSyncOrder"
WHERE "userId" = '<SMOKE_USER_ID>'
  AND "mallOrderNo" LIKE 'TEST-MALL-ORDER-%'
ORDER BY "mallOrderNo";

SELECT COUNT(*) AS order_count FROM "OrderSyncOrder"
WHERE "userId" = '<SMOKE_USER_ID>'
  AND provider = 'COUPANG'
  AND "mallOrderNo" LIKE 'TEST-MALL-ORDER-%';

-- Account 1건
SELECT id, "userId", provider FROM "OrderIntegrationAccount"
WHERE id = 'acc-smoke-test-001';

-- 운영 데이터 혼입 검사 (0이어야 함)
SELECT COUNT(*) AS non_smoke_orders
FROM "OrderSyncOrder"
WHERE "userId" = '<SMOKE_USER_ID>'
  AND "mallOrderNo" NOT LIKE 'TEST-MALL-ORDER-%'
  AND provider = 'COUPANG';
```

| 기대 count (smoke만 있는 테스트 DB) | |
|--------------------------------------|--|
| `ShipmentUploadBatch` (smoke scope) | **1** (D-4h-4 1회 실행 기준) |
| `ShipmentUploadRow` | **5** |
| `ShipmentMatch` | **≤5** (매칭 결과에 따라 변동 가능) |
| `OrderSyncOrder` (TEST-MALL-*) | **5** |
| `OrderIntegrationAccount` (`acc-smoke-test-001`) | **1** |
| `non_smoke_orders` | **0** |

**count가 예상과 다르면 cleanup 중단** → 원인 조사 후 runbook·승인 재요청.

### pseudo Prisma (read-only — 실행 전 승인)

```typescript
// ⚠️ 문서 참고용 — 레포에 script 파일 생성 금지
const smokeUserId = '<SMOKE_USER_ID>';
const uploadBatchId = '<UPLOAD_BATCH_ID_FROM_SMOKE_RUN>';

await prisma.shipmentMatch.count({ where: { uploadBatchId } });
await prisma.shipmentUploadRow.count({ where: { uploadBatchId } });
await prisma.orderSyncOrder.count({
  where: { userId: smokeUserId, mallOrderNo: { startsWith: 'TEST-MALL-ORDER-' } },
});
```

---

## 7. cleanup 실행 예시

> **실제 DELETE 실행 금지** — D-4h-5 문서 단계. 승인 후 담당자가 테스트 DB에서만 수행.

**권장**: 단일 **transaction** 내에서 삭제 → commit 전 count 재확인.

### 7.1 pseudo SQL (예시)

```sql
-- ⚠️ 실행 전 승인 필요 · 테스트 DATABASE_URL 확인
BEGIN;

-- 5.2 Match
DELETE FROM "ShipmentMatch"
WHERE "uploadBatchId" = '<UPLOAD_BATCH_ID_FROM_SMOKE_RUN>';

-- 5.3 Row
DELETE FROM "ShipmentUploadRow"
WHERE "uploadBatchId" = '<UPLOAD_BATCH_ID_FROM_SMOKE_RUN>';

-- 5.4 Upload Batch
DELETE FROM "ShipmentUploadBatch"
WHERE id = '<UPLOAD_BATCH_ID_FROM_SMOKE_RUN>'
  AND "userId" = '<SMOKE_USER_ID>'
  AND "integrationAccountId" = 'acc-smoke-test-001';

-- 5.5 Orders
DELETE FROM "OrderSyncOrder"
WHERE "userId" = '<SMOKE_USER_ID>'
  AND "mallOrderNo" IN (
    'TEST-MALL-ORDER-001',
    'TEST-MALL-ORDER-002',
    'TEST-MALL-ORDER-003',
    'TEST-MALL-ORDER-004',
    'TEST-MALL-ORDER-005'
  );

-- 5.6 Batch
DELETE FROM "OrderSyncBatch"
WHERE id = 'batch-smoke-001'
  AND "userId" = '<SMOKE_USER_ID>';

-- 5.7 Account
DELETE FROM "OrderIntegrationAccount"
WHERE id = 'acc-smoke-test-001'
  AND "userId" = '<SMOKE_USER_ID>';

-- §8 count 검증 후 이상 없으면:
COMMIT;
-- 이상 있으면: ROLLBACK;
```

### 7.2 pseudo Prisma (예시 — script 파일 생성 금지)

```typescript
// ⚠️ 실행 전 승인 필요 — 일회성만, 레포 커밋 금지
await prisma.$transaction(async (tx) => {
  const uploadBatchId = '<UPLOAD_BATCH_ID_FROM_SMOKE_RUN>';
  const smokeUserId = '<SMOKE_USER_ID>';

  await tx.shipmentMatch.deleteMany({ where: { uploadBatchId } });
  await tx.shipmentUploadRow.deleteMany({ where: { uploadBatchId } });
  await tx.shipmentUploadBatch.deleteMany({
    where: { id: uploadBatchId, userId: smokeUserId, integrationAccountId: 'acc-smoke-test-001' },
  });
  await tx.orderSyncOrder.deleteMany({
    where: {
      userId: smokeUserId,
      mallOrderNo: { in: ['TEST-MALL-ORDER-001', /* ... */ 'TEST-MALL-ORDER-005'] },
    },
  });
  await tx.orderSyncBatch.deleteMany({
    where: { id: 'batch-smoke-001', userId: smokeUserId },
  });
  await tx.orderIntegrationAccount.deleteMany({
    where: { id: 'acc-smoke-test-001', userId: smokeUserId },
  });
});
```

**Prisma script 파일(`scripts/`, `prisma/seed.ts`) 작성·커밋 금지.**

---

## 8. cleanup 후 확인

승인된 cleanup 실행 직후 read-only로 확인:

| 항목 | 기대 |
|------|------|
| `ShipmentUploadBatch` (smoke scope) | **0건** |
| `ShipmentUploadRow` (smoke upload batch) | **0건** |
| `ShipmentMatch` (smoke upload batch) | **0건** |
| `OrderSyncOrder` (`TEST-MALL-ORDER-*`) | **0건** (smoke 5건 삭제됨) |
| `OrderIntegrationAccount` (`acc-smoke-test-001`) | **0건** |
| `OrderSyncBatch` (`batch-smoke-001`) | **0건** |
| 샘플 CSV/문서 (`smoke-samples/`) | **삭제하지 않음** (레포 유지) |
| git working tree | **변경 없음** (DB cleanup만 수행) |

```sql
-- cleanup 후 검증 예시 (승인 후 테스트 DB만)
SELECT COUNT(*) FROM "ShipmentUploadBatch"
WHERE "userId" = '<SMOKE_USER_ID>' AND "integrationAccountId" = 'acc-smoke-test-001';

SELECT COUNT(*) FROM "OrderSyncOrder"
WHERE "mallOrderNo" LIKE 'TEST-MALL-ORDER-%';

SELECT COUNT(*) FROM "OrderIntegrationAccount"
WHERE id = 'acc-smoke-test-001';
```

---

## 9. 중단 조건

| 조건 | 조치 |
|------|------|
| 테스트 DB인지 **확신 불가** | cleanup 중단 |
| **운영 `DATABASE_URL`**로 보임 | 즉시 중단 |
| 삭제 대상 **count > 예상** | 중단 — scope 재확인 |
| smoke 전용 **`userId` 불명확** | 중단 |
| `provider` / `acc-smoke-test-001` **불일치** | 중단 |
| FK 관계·cascade **불명확** | schema 재확인 |
| migration **drift** | 중단 |
| **송장전송** 또는 쇼핑몰 API 호출 필요 | **중단** — 범위 밖 |
| `non_smoke_orders` > 0 이고 삭제 대상에 포함될 위험 | 중단 |

---

## 10. 다음 단계

```
D-4h-4 smoke  →  [승인] cleanup 실행  →  결과 보고  →  D-4 최종 판정
```

| 단계 | 내용 |
|------|------|
| **D-4h-5 문서** | 본 runbook (실행 없음) |
| **cleanup 실행** | 사용자 승인 후, 테스트 DB만 |
| **결과 보고** | [result-template](./shipment-upload-export-smoke-result-template.md) — D-4 smoke PASS/FAIL·cleanup 완료 요약 |
| **D-4 최종 판정** | smoke + cleanup 완료 후 Phase D-4 종료 여부 결정 |
| **이후** | provider별 업로드 양식 고도화, 다음 Phase 검토 |
| **송장전송** | **별도 Phase** — smoke/cleanup과 분리 |

**지금 할 일 (D-4h-5 문서 단계)**  
- 본 runbook 검토·승인 요청  

**지금 하지 않을 일**  
- SQL 실행, delete, env 변경, smoke 재실행, 송장전송  

---

## 부록 — 문서 흐름 (D-4h)

| 단계 | 문서 |
|------|------|
| D-4h-2 | [setup-runbook](./shipment-upload-export-test-db-setup-runbook.md) |
| D-4h-3 | [insert-runbook](./shipment-upload-export-smoke-data-insert-runbook.md) |
| D-4h-4 | [execution-runbook](./shipment-upload-export-smoke-execution-runbook.md) |
| D-4h-5 | **본 runbook** |
| D-4h-6 | [result-template](./shipment-upload-export-smoke-result-template.md) |
