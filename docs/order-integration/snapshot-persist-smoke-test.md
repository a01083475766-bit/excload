# Snapshot 저장 smoke test Runbook

> **상태**: 운영 준비 문서 (2026-07)  
> **목적**: `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED=true`로 snapshot DB 저장을 **로컬에서만** 검증하기 전 절차·성공 기준·복구 방법을 정리  
> **관련 문서**  
> - [order-sync-snapshot-db-design.md](./order-sync-snapshot-db-design.md) — 스냅샷 DB 설계  
> - [order-sync-shipment-roadmap.md](./order-sync-shipment-roadmap.md) — 전체 로드맵  
> - Phase C-3b: 11개 `fetch-orders` route에 `snapshotPersist` 응답 연결 완료

**이 문서는 절차만 다룹니다.**  
아래 작업은 **별도 승인 전까지 금지**: Vercel Production env 변경, `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED=true` 운영 설정, `prisma migrate deploy`, DB 데이터 직접 수정, 일반 사용자 대상 오픈.

---

## 1. 목적

주문조회(`fetch-orders`) 성공 후 snapshot DTO가 `OrderSyncBatch` / `OrderSyncOrder`에 **정상 저장되는지** 로컬에서 검증합니다.

검증 범위:

- feature flag ON 시 `maybePersistOrderFetchResult` → `persistOrderSyncBatch` 흐름
- 응답 `snapshotPersist` 필드
- EXC 번호 발급 (`EXC-YYYYMMDD-######`)
- 저장 실패 시에도 주문조회 success 유지

검증 범위 **외**:

- 송장 업로드·매칭 (Phase D)
- UI 표시
- Vercel Production 동작

---

## 2. 전제조건

| # | 항목 | 기대 상태 |
|---|------|-----------|
| P1 | Prisma schema | `npx prisma validate` 통과 |
| P2 | DB migration | `npx prisma migrate status` → **pending 없음**, `Database schema is up to date!` |
| P3 | DB 연결 | 로컬 `.env`의 `DATABASE_URL` / `DIRECT_URL` 설정 (Supabase 등) |
| P4 | 테이블 존재 | `OrderSyncBatch`, `OrderSyncOrder`, `ExcloadOrderNoSequence` |
| P5 | route 연결 | 11개 `fetch-orders`에 `snapshotPersist` 응답 필드 포함 (커밋 `0ded7c9`) |
| P6 | feature flag | **기본 OFF** — smoke test 시에만 로컬에서 일시 ON |
| P7 | 테스트 계정 | 주문조회 가능한 provider **1개** + 저장된 `OrderIntegrationAccount` |
| P8 | 관리자 인증 | `fetch-orders`는 관리자 API 인증 필요 (`requireOrderIntegrationAdmin`) |

### 현재 확인된 DB 상태 (2026-07 점검)

- Vercel Production `DATABASE_URL`과 로컬 `.env`가 **동일 Supabase DB**로 확인됨
- migration **pending 없음** (`add_order_sync_snapshots` 포함 28개 적용됨)
- 따라서 smoke test도 **이미 migration이 적용된 DB**에 row가 생성됨 — 테스트 데이터 정리·flag OFF 복구 필수

### DB password 교체

현재 **보류**. 보안상 필요 시 별도 작업으로 진행.

---

## 3. Feature flag 설명

| 환경 변수 | 기본값 | 동작 |
|-----------|--------|------|
| `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED` | `false` (미설정 포함) | DB 저장 **시도 안 함** → `{ persisted: false, reason: 'disabled' }` |
| `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED` | `true` | `buildOrderSyncSnapshots` → `persistOrderSyncBatch` 실행 |

코드: `app/lib/order-integration/snapshots/persist-order-fetch-result.ts` — `isOrderSyncSnapshotPersistEnabled()`

`.env.example` 참고:

```text
# ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED=false
```

**원칙**

- `false`일 때: DB 접근 없음, 기존 `previewRows` / `orderStandardFile` 응답 유지
- 저장 실패 시: throw 없음, `snapshotPersist.reason = 'persist_failed'`
- 주문조회 success는 유지

---

## 4. 테스트 전 확인사항

### 4.1 Prisma / migration

```bash
npx prisma validate
npx prisma migrate status
```

**기대값**

- `The schema at prisma\schema.prisma is valid`
- `Database schema is up to date!`
- pending migration **0건**

`prisma migrate deploy`는 **이미 up to date이면 실행하지 않음** (no-op).

### 4.2 로컬 환경

- [ ] `.env`에 `DATABASE_URL`, `DIRECT_URL` 설정
- [ ] `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED` **아직 없거나 `false`**
- [ ] 테스트할 provider의 연동 계정이 DB에 존재 (`OrderIntegrationAccount`)
- [ ] 해당 provider에 필요한 프록시/OAuth env가 로컬에 설정됨 (provider별 상이)
- [ ] **Shopify는 테스트 스토어 없으면 제외** (`SHOPIFY_INTEGRATION_ENABLED` 등 별도 flag)

### 4.3 provider 선택 가이드

smoke test는 **주문조회가 실제로 되는 provider 1개만** 사용합니다.

| provider | 로컬 smoke test | 비고 |
|----------|-----------------|------|
| Shopify | **제외 권장** | 테스트 스토어·OAuth·`SHOPIFY_INTEGRATION_ENABLED` 필요 |
| 스마트스토어·쿠팡 등 | 조건부 가능 | `INTEGRATION_PROXY_BASE_URL` 등 프록시 설정 필요 |
| (없음) | **문서화만** | 호출 가능한 route/계정이 없으면 실행 단계 생략 |

호출 가능한 provider가 없으면 **이 runbook 작성까지만** 진행하고, 계정·env 준비 후 실행합니다.

### 4.4 Supabase 백업 (권장)

smoke test 전 Supabase 대시보드에서:

- [ ] 최근 자동 백업 존재 여부 확인
- [ ] 필요 시 수동 스냅샷 생성 가능 여부 확인

이번 smoke test는 소량 row INSERT이지만, Production 공유 DB이므로 백업 확인을 권장합니다.

---

## 5. 테스트 순서 (로컬)

> **주의**: 아래는 절차 문서입니다. 승인·계정 준비 후 실행하세요.  
> Vercel Production env는 **변경하지 않습니다**.

```text
1. 테스트 전 확인 (섹션 4) 완료
2. 로컬 .env에 ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED=true 추가 (로컬만)
3. 개발 서버 재시작 (npm run dev 등)
4. 관리자 세션으로 주문조회 가능한 provider 1개 선택
5. POST /api/order/integration/{provider}/fetch-orders 실행
6. HTTP 200 + success:true 응답 확인
7. 응답 JSON에서 snapshotPersist 확인
8. persisted=true이면 batchId, orderCount, excloadOrderNos 확인
9. DB에서 OrderSyncBatch / OrderSyncOrder row 생성 여부 확인 (섹션 7 쿼리)
10. 테스트 종료 후 ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED=false 로 되돌리거나 해당 줄 삭제
11. 개발 서버 재시작
```

### 5.1 fetch-orders 응답 예시

기존 필드 유지 + `snapshotPersist` 추가:

```json
{
  "success": true,
  "message": "...",
  "count": 3,
  "previewRows": [],
  "orderStandardFile": { "rows": [] },
  "snapshotPersist": {
    "persisted": true,
    "batchId": "clxx...",
    "orderCount": 3,
    "excloadOrderNos": ["EXC-20260709-000001", "EXC-20260709-000002"]
  }
}
```

flag OFF 시:

```json
{
  "snapshotPersist": {
    "persisted": false,
    "reason": "disabled"
  }
}
```

저장 실패 시 (주문조회는 success 유지):

```json
{
  "snapshotPersist": {
    "persisted": false,
    "reason": "persist_failed",
    "errorMessage": "..."
  }
}
```

### 5.2 rawOrders

현재 route는 `rawOrders: undefined`로 통일 — 원본 API 응답은 DB에 저장하지 않음.

---

## 6. 성공 기준

| # | 기준 |
|---|------|
| S1 | `fetch-orders` 기존 응답 필드 유지 (`success`, `message`, `count`, `previewRows`, `orderStandardFile`, `previewHeaders`, `debug` 등) |
| S2 | 응답에 `snapshotPersist` 필드 존재 |
| S3 | `snapshotPersist.persisted === true` |
| S4 | `batchId` 존재 (non-empty) |
| S5 | `orderCount`가 snapshot 저장 건수와 일치 (배송 단위 그룹 기준) |
| S6 | `excloadOrderNos`가 `EXC-YYYYMMDD-######` 형식, 중복 없음 |
| S7 | DB `OrderSyncBatch` 1건 생성 (`orderCount` 일치) |
| S8 | DB `OrderSyncOrder` N건 생성 (N = orderCount) |
| S9 | `userId`, `provider`, `integrationAccountId`가 batch/order에 정상 저장 |
| S10 | `mark*AccountSyncResult` 등 기존 lastSyncedAt 갱신 로직 유지 |
| S11 | 저장 실패해도 주문조회 자체는 **실패하지 않음** |

---

## 7. 실패 기준

| # | 증상 | 조치 |
|---|------|------|
| F1 | 주문조회가 snapshot 저장 실패로 5xx/400 | bridge/route 버그 — 즉시 flag OFF, 로그 확인 |
| F2 | `snapshotPersist` 필드 없음 | route 배포/코드 버전 확인 |
| F3 | `persisted: true`인데 DB row 없음 | transaction/commit 이슈 — Prisma 로그 확인 |
| F4 | EXC 번호 중복 | `ExcloadOrderNoSequence` / unique 제약 확인 |
| F5 | `provider` / `integrationAccountId` 누락 | route input·persist 매핑 확인 |
| F6 | 개인정보가 서버 로그에 그대로 출력 | `toSafePersistErrorMessage`·로그 정책 확인 |
| F7 | `reason: 'empty_rows'` | 주문 0건 — 정상 스킵 (저장 안 함) |
| F8 | `reason: 'disabled'` | flag 미적용 또는 서버 미재시작 |

---

## 8. 실패 시 복구 방법

1. **즉시** 로컬 `.env`에서 `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED=false` (또는 삭제)
2. 개발 서버 재시작
3. 이후 `fetch-orders`는 snapshot 저장 없이 기존과 동일하게 동작
4. 잘못 생성된 테스트 batch/order가 있으면 — **운영 DB이므로** 임의 DELETE 전 담당자 승인
5. Vercel Production env는 **건드리지 않음** (로컬 문제면 로컬만 복구)

### 테스트 후 flag 처리

| 환경 | 권장 |
|------|------|
| 로컬 | **반드시 `false`로 되돌림** (또는 변수 삭제) |
| Vercel Production | smoke test 완료·승인 전까지 **설정하지 않음** |
| Vercel Preview/Staging | 별도 승인 후 staging smoke test 시에만 일시 ON |

---

## 9. DB 확인 쿼리 (예시)

> **주의**: 전화번호·주소 전체를 로그·스크린샷에 남기지 마세요.  
> 아래 쿼리는 **확인용**이며, smoke test 실행 시에만 사용합니다.

### 9.1 최근 batch

```sql
SELECT id, "userId", provider, "integrationAccountId", "orderCount", status, "fetchedAt", "createdAt"
FROM "OrderSyncBatch"
ORDER BY "createdAt" DESC
LIMIT 10;
```

### 9.2 최근 order (개인정보 최소)

```sql
SELECT id, "batchId", "excloadOrderNo", provider, "mallOrderNo", quantity, "createdAt"
FROM "OrderSyncOrder"
ORDER BY "createdAt" DESC
LIMIT 10;
```

`receiverName` 등 개인정보 컬럼은 확인용 SELECT에서 **제외**합니다.

### 9.3 EXC 시퀀스

```sql
SELECT "dateKey", "lastNumber", "updatedAt"
FROM "ExcloadOrderNoSequence"
ORDER BY "updatedAt" DESC
LIMIT 5;
```

### 9.4 특정 batch 하위 order

```sql
SELECT "excloadOrderNo", "mallOrderNo", quantity, "transmissionStatus"
FROM "OrderSyncOrder"
WHERE "batchId" = '<batchId-from-response>'
ORDER BY "createdAt" ASC;
```

---

## 10. 개인정보·로그 주의사항

- `console.error('[OrderSyncSnapshotPersist] failed:', ...)` — 마스킹된 `errorMessage`만 출력
- DB 확인 시 `receiverPhone`, `receiverAddress` **SELECT 지양** (필요 시 담당자만, 결과 공유 금지)
- `rawPayloadJson`은 현재 route에서 저장하지 않음 (`rawOrders: undefined`)
- smoke test 결과 공유 시 `batchId`, `orderCount`, `excloadOrderNo` 위주로 보고

---

## 11. 실행 체크리스트 (요약)

### Before

- [ ] `npx prisma validate` OK
- [ ] `npx prisma migrate status` → up to date
- [ ] Supabase 백업 확인 (권장)
- [ ] 테스트 provider·연동 계정 준비
- [ ] Shopify 제외 여부 확인

### During (로컬만)

- [ ] `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED=true` (로컬)
- [ ] `fetch-orders` 1회 실행
- [ ] `snapshotPersist` 응답 확인
- [ ] DB row 확인

### After

- [ ] `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED=false` 복구
- [ ] 서버 재시작
- [ ] Vercel Production env **미변경** 확인
- [ ] 결과 보고 (성공/실패, batchId, orderCount만)

---

## 12. 다음 단계 (smoke test 이후)

1. 로컬 smoke test 성공 보고
2. (선택) Vercel Preview/Staging에서 동일 절차
3. Production `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED=true` — **별도 승인**
4. Phase D — 송장 업로드 API/UI + `toOrderSyncSnapshot` → `matchShipmentRows`

---

## 13. 관련 코드 경로

| 구분 | 경로 |
|------|------|
| Feature flag | `app/lib/order-integration/snapshots/persist-order-fetch-result.ts` |
| Bridge | `maybePersistOrderFetchResult` |
| Persist | `app/lib/order-integration/snapshots/persist-order-sync-batch.ts` |
| EXC 발급 | `app/lib/order-integration/snapshots/reserve-excload-order-nos.ts` |
| fetch-orders | `app/api/order/integration/*/fetch-orders/route.ts` |
| Migration | `prisma/migrations/20260708193439_add_order_sync_snapshots/` |
