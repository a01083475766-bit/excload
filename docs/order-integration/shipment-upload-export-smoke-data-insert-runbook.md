# 송장 업로드·export smoke test — 데이터 Insert Runbook

> **상태**: insert runbook (2026-07-10) — **실행 전 승인 필요**  
> **단계**: D-4h-3  
> **목적**: 별도 **테스트 DB**에 smoke 전용 user / account / order snapshot 데이터를 **안전하게 준비**하기 위한 절차  
> **선행 문서**  
> - [shipment-upload-export-test-db-setup-runbook.md](./shipment-upload-export-test-db-setup-runbook.md) — D-4h-2 (테스트 DB setup)  
> - [shipment-upload-export-test-db-plan.md](./shipment-upload-export-test-db-plan.md) — D-4h-1  
> - [shipment-upload-export-smoke-data-preparation-plan.md](./shipment-upload-export-smoke-data-preparation-plan.md) — D-4h-준비  
> - [smoke-samples/shipment-upload-smoke-orders.md](./smoke-samples/shipment-upload-smoke-orders.md)  
> - [smoke-samples/shipment-upload-smoke-file.csv](./smoke-samples/shipment-upload-smoke-file.csv)

**본 문서는 insert 전 승인용 runbook입니다.**  
**D-4h-3 문서 작성 단계에서 수행하지 않는 것**: 실제 DB insert/update/delete, SQL 실행, Prisma seed 파일 작성, env 변경, migration 실행, smoke test 실행, 쇼핑몰 API 호출, 송장전송.

**검증 목표 (데이터 준비 후)**  
- 송장파일 업로드 → 매칭 → 확정/제외/연결 → READY → **xlsx 다운로드** (파일 다운로드까지만)

**검증 목표 아님**  
- 쇼핑몰 API **송장전송**

> ⚠️ 아래 SQL·Prisma 예시는 **문서 내 pseudo 코드**입니다. **실행 전 사용자 승인**이 필요하며, 본 D-4h-3 단계에서는 **실행하지 않습니다**.  
> ⚠️ `prisma/schema.prisma`와 **다르면 실행 전 반드시 schema를 재확인**하세요.

---

## 1. 목적

| 항목 | 설명 |
|------|------|
| 무엇을 | smoke test용 **테스트 데이터 insert 절차** 문서화 |
| 왜 | D-4g **보류** — 테스트 DB에 `OrderSyncOrder` / `COUPANG` account 없음 |
| 무엇이 아님 | 실제 insert 실행, seed script 파일, smoke 실행 (→ D-4h-4) |

---

## 2. 전제 조건

insert **시작 전** 모두 충족:

| # | 조건 |
|---|------|
| P1 | [D-4h-2 setup runbook](./shipment-upload-export-test-db-setup-runbook.md) **실행 완료** (승인 후) |
| P2 | 연결 DB가 **운영 DB와 분리**된 테스트 DB |
| P3 | `.env.smoke.local` 등 **별도 env** 준비·적용 완료 |
| P4 | migration이 **테스트 DB에만** 적용 (`migrate status` up to date) |
| P5 | smoke 전용 **`userId` 확정** (운영 user 아님) |
| P6 | **사용자 승인** — 승인 전 DB write **금지** |

---

## 3. 필요한 데이터 요약

| 대상 | 수량 | 식별 |
|------|------|------|
| smoke 전용 `User` | 1 | NextAuth 로그인 가능 |
| `OrderIntegrationAccount` | 1 | `COUPANG`, id: `acc-smoke-test-001` |
| `OrderSyncBatch` | 1 | 예: `batch-smoke-001` |
| `OrderSyncOrder` | **5건** | `TEST-MALL-ORDER-*` / `EX-SMOKE-*` |
| 송장 CSV (파일) | 1 | [shipment-upload-smoke-file.csv](./smoke-samples/shipment-upload-smoke-file.csv) |

**공통 scope**

| 필드 | 값 |
|------|-----|
| `userId` | `<SMOKE_USER_ID>` (placeholder) |
| `provider` | `COUPANG` |
| `integrationAccountId` | `acc-smoke-test-001` |

---

## 4. insert 대상 테이블 (schema 기준)

`prisma/schema.prisma` 기준 (2026-07). **실행 전 diff 확인 필수.**

| 테이블 | 역할 | FK / 관계 |
|--------|------|-----------|
| `User` | 로그인 사용자 | — (`email` unique) |
| `OrderIntegrationAccount` | 연동 계정 메타 | `userId` → `User.id` |
| `OrderSyncBatch` | 주문 snapshot 묶음 | `userId` → `User`, `integrationAccountId` → `OrderIntegrationAccount` (optional) |
| `OrderSyncOrder` | 주문 snapshot 1건 | `batchId` → `OrderSyncBatch`, `userId` → `User`, `integrationAccountId` → account |

**이번 smoke insert에서 보통 불필요** (업로드 smoke **전**):  
`ShipmentUploadBatch`, `ShipmentMatch`, `Account`(NextAuth OAuth) — OAuth provider 사용 시 `Account` row는 앱 로그인으로 생성될 수 있음.

### 주요 제약 (schema)

| 모델 | 제약 |
|------|------|
| `OrderIntegrationAccount` | `@@unique([userId, provider, vendorId])` — COUPANG smoke는 `vendorId` null 또는 전용 더미 |
| `OrderSyncOrder` | `@@unique([userId, excloadOrderNo])` — `EX-SMOKE-0001`~`0005` 중복 불가 |
| `OrderSyncOrder` | 필수: `batchId`, `userId`, `provider`, `excloadOrderNo`, `mallOrderNo` |

**Credential 필드** (`accessKeyCiphertext` 등): **NULL 허용** — 쿠팡 API key/secret **입력 금지**.

---

## 5. smoke 전용 userId 확정 방법

| 옵션 | 설명 |
|------|------|
| A. 기존 테스트 유저 | smoke 전용으로 **미리 만든** 계정의 `User.id` 사용 |
| B. 새 테스트 유저 | 앱 회원가입/관리자 생성 후 `userId` 확인 |

| 규칙 | |
|------|--|
| ✅ | smoke 전용 이메일 (예: `smoke-test@example.invalid`) |
| ❌ | **운영 사용자** `userId` |
| ❌ | `userId` 미확정 상태에서 insert |

### 확인 (승인 후 read-only 예시)

```sql
-- 실행 전 승인 필요 — 테스트 DB에서만
SELECT id, email FROM "User" WHERE email = '<SMOKE_TEST_EMAIL>';
```

`userId`가 없으면 **insert 중단** → 계정 생성 후 재시도.

---

## 6. OrderIntegrationAccount 준비 기준

| 필드 | 값 (예시) |
|------|-----------|
| `id` | `acc-smoke-test-001` *(명시 id — 샘플 scope와 일치)* |
| `userId` | `<SMOKE_USER_ID>` |
| `provider` | `COUPANG` |
| `accountName` | `SMOKE-TEST-COUPANG` |
| `vendorId` | `null` 또는 `smoke-vendor` (unique 제약 주의) |
| `status` | `ACTIVE` (또는 `INACTIVE` — 매칭 scope만 맞으면 smoke 가능, 팀 정책에 따름) |
| API credential 컬럼 | **전부 NULL** |

**금지**  
- 실제 쿠팡 API key/secret  
- 외부 API 호출 목적의 credential  

**목적**: 업로드 시 `provider` + `integrationAccountId` **scope 매칭**만.

---

## 7. OrderSyncOrder 5건 데이터 기준

[shipment-upload-smoke-orders.md](./smoke-samples/shipment-upload-smoke-orders.md) / CSV 연계:

| # | `mallOrderNo` | `excloadOrderNo` | `receiverName` | `receiverPhone` | smoke 처리 | export |
|---|---------------|------------------|----------------|-----------------|------------|--------|
| 1 | `TEST-MALL-ORDER-001` | `EX-SMOKE-0001` | 테스트일 | `010-0000-0001` | **confirm** | ✅ |
| 2 | `TEST-MALL-ORDER-002` | `EX-SMOKE-0002` | 테스트이 | `010-0000-0002` | **warning → confirm** | ✅ |
| 3 | `TEST-MALL-ORDER-003` | `EX-SMOKE-0003` | 테스트삼 | `010-0000-0003` | **link** | ✅ |
| 4 | `TEST-MALL-ORDER-004` | `EX-SMOKE-0004` | 테스트사 | `010-0000-0004` | **exclude** | ❌ |
| 5 | `TEST-MALL-ORDER-005` | `EX-SMOKE-0005` | 테스트오 | `010-0000-0005` | **confirm** (`000123456789`) | ✅ |

**공통 컬럼 (각 row)**  
- `userId`: `<SMOKE_USER_ID>`  
- `batchId`: `<BATCH_SMOKE_ID>` (예: `batch-smoke-001`)  
- `provider`: `COUPANG`  
- `integrationAccountId`: `acc-smoke-test-001`  
- `orderStatus`: `PAID`  
- `receiverAddress`: `테스트시 테스트구 테스트로 N`  
- `productSummary`: `스모크테스트상품X x1`  
- `transmissionStatus`: `NONE` (기본)

**id 예시** (선택): `smoke-order-sync-001` ~ `005` — cuid 자동 생성도 가능하나 **문서·삭제 시 식별 용이**하도록 고정 id 권장.

---

## 8. 예시 insert 순서 (pseudo — 실행 금지)

> **실제 SQL/Prisma 실행 금지** — 승인 후 담당자가 테스트 DB에서만 수행.

### 8.1 순서

1. **smoke user 확인** — §5  
2. **`OrderIntegrationAccount` 1건**  
3. **`OrderSyncBatch` 1건** (`orderCount` = 5, `sourceType` = `MANUAL` 권장)  
4. **`OrderSyncOrder` 5건**  
5. **read-only 검증** — §9  

### 8.2 pseudo SQL (예시)

```sql
-- ⚠️ 실행 전 승인 필요 · 테스트 DATABASE_URL 확인

-- 2) Account (id 고정 — 샘플 scope)
INSERT INTO "OrderIntegrationAccount" (
  id, "userId", provider, "accountName", status, "createdAt", "updatedAt"
) VALUES (
  'acc-smoke-test-001',
  '<SMOKE_USER_ID>',
  'COUPANG',
  'SMOKE-TEST-COUPANG',
  'ACTIVE',
  NOW(), NOW()
);

-- 3) Batch
INSERT INTO "OrderSyncBatch" (
  id, "userId", provider, "integrationAccountId",
  "sourceType", "orderCount", status, "fetchedAt", "createdAt", "updatedAt"
) VALUES (
  'batch-smoke-001',
  '<SMOKE_USER_ID>',
  'COUPANG',
  'acc-smoke-test-001',
  'MANUAL',
  5,
  'ACTIVE',
  NOW(), NOW(), NOW()
);

-- 4) Orders (1건 예시 — 나머지 4건은 §7 표 참고)
INSERT INTO "OrderSyncOrder" (
  id, "batchId", "userId", provider, "integrationAccountId",
  "excloadOrderNo", "mallOrderNo",
  "receiverName", "receiverPhone", "receiverAddress",
  "productSummary", "orderStatus", "transmissionStatus",
  "createdAt", "updatedAt"
) VALUES (
  'smoke-order-sync-001',
  'batch-smoke-001',
  '<SMOKE_USER_ID>',
  'COUPANG',
  'acc-smoke-test-001',
  'EX-SMOKE-0001',
  'TEST-MALL-ORDER-001',
  '테스트일',
  '010-0000-0001',
  '테스트시 테스트구 테스트로 1',
  '스모크테스트상품A x1',
  'PAID',
  'NONE',
  NOW(), NOW()
);
-- ... smoke-order-sync-002 ~ 005 동일 패턴
```

### 8.3 pseudo Prisma (예시 — seed 파일 생성 금지, 문서 참고용)

```typescript
// ⚠️ 실행 전 승인 필요 — 별도 일회성 스크립트로만, 레포 커밋 금지
await prisma.orderIntegrationAccount.create({
  data: {
    id: 'acc-smoke-test-001',
    userId: '<SMOKE_USER_ID>',
    provider: 'COUPANG',
    accountName: 'SMOKE-TEST-COUPANG',
    status: 'ACTIVE',
  },
});
// ... batch, orders
```

**Prisma seed (`prisma/seed.ts`) 작성 금지** — D-4h-3 정책.

---

## 9. read-only 검증 쿼리

insert **완료 후** (승인된 실행 담당자, **테스트 DB만**):

```sql
-- 실행 전 승인 필요

-- Account 1건
SELECT id, "userId", provider, "accountName"
FROM "OrderIntegrationAccount"
WHERE id = 'acc-smoke-test-001';

-- Orders 5건
SELECT "mallOrderNo", "excloadOrderNo", "integrationAccountId"
FROM "OrderSyncOrder"
WHERE "mallOrderNo" LIKE 'TEST-MALL-ORDER-%'
ORDER BY "mallOrderNo";

-- 건수
SELECT COUNT(*) AS order_count
FROM "OrderSyncOrder"
WHERE "userId" = '<SMOKE_USER_ID>'
  AND provider = 'COUPANG';
```

| 기대 | |
|------|--|
| Account | **1건**, `acc-smoke-test-001` |
| Orders | **5건**, `TEST-MALL-ORDER-001`~`005` |
| Scope | `integrationAccountId` = `acc-smoke-test-001` |
| 운영 혼입 | `TEST-MALL-ORDER-*` 외 실운영 주문번호 **없음** (테스트 DB 전제) |

---

## 10. rollback / delete 계획

smoke **완료 후** 정리 ( **D-4h-5 cleanup runbook** — 별도 승인 후):

| 삭제 대상 | 식별자 |
|-----------|--------|
| `OrderSyncOrder` | `smoke-order-sync-001`~`005` 또는 `TEST-MALL-ORDER-*` |
| `OrderSyncBatch` | `batch-smoke-001` |
| `OrderIntegrationAccount` | `acc-smoke-test-001` |
| `ShipmentUploadBatch` 등 | smoke 실행(D-4h-4) 후 생성된 batch id 기록 |

**User** row: smoke 전용 계정 유지/삭제는 **팀 정책** — 기본은 account·order·upload batch만 삭제.

**D-4h-3**: delete **실행하지 않음**.

---

## 11. 중단 조건

| 조건 | 조치 |
|------|------|
| 테스트 DB인지 **확신 불가** | insert 중단 |
| `userId` **불명확** | 중단 |
| FK 관계·필수 컬럼 **불명확** | schema 재확인 |
| schema가 본 문서와 **다름** | 문서·runbook 갱신 후 재승인 |
| **운영 DB**로 보임 | 즉시 중단 |
| env가 **운영 `.env`** | 중단, `.env.smoke.local` 확인 |
| migration **drift** | 중단 |
| 쇼핑몰 API / **송장전송** 필요 | **중단** — 범위 밖 |

---

## 12. 다음 단계

```
D-4h-3 (본 runbook)  →  [승인] insert 실행  →  D-4h-4 smoke  →  D-4h-5 cleanup
```

| 단계 | 내용 |
|------|------|
| **D-4h-3 문서** | 본 runbook (실행 없음) |
| **insert 실행** | 사용자 승인 후, 테스트 DB만 |
| **D-4h-4** | [smoke-test-runbook](./shipment-upload-export-smoke-test-runbook.md) 실제 실행 |
| **D-4h-5** | cleanup runbook (예정) — delete 별도 승인 |

**지금 할 일**  
1. D-4h-2 setup **완료** 확인  
2. smoke `userId` **확정**  
3. insert **실행 승인** 요청  

**지금 하지 않을 일**  
- SQL 실행, seed 파일, insert, smoke  

---

## 부록 — 문서 흐름 (D-4h)

| 단계 | 문서 |
|------|------|
| D-4h-2 | [setup-runbook](./shipment-upload-export-test-db-setup-runbook.md) |
| D-4h-3 | **본 runbook** |
| D-4h-4 | [smoke-test-runbook](./shipment-upload-export-smoke-test-runbook.md) |
| D-4h-5 | (예정) cleanup runbook |
