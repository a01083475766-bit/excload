# 송장 업로드·export smoke test 데이터 준비 계획

> **상태**: 준비 계획 문서 (2026-07-09) — **실행·DB write 없음**  
> **단계**: D-4h-준비  
> **목적**: D-4 실제 smoke test **전** smoke 전용 사용자·연동계정·`OrderSyncOrder` snapshot 5건을 **어떻게 안전하게 준비할지** 정리  
> **관련 문서**  
> - [shipment-upload-export-smoke-readiness-report.md](./shipment-upload-export-smoke-readiness-report.md) — D-4g read-only 점검 (판정: **보류**)  
> - [shipment-upload-export-preflight-checklist.md](./shipment-upload-export-preflight-checklist.md) — 실행 전 preflight (D-4f)  
> - [shipment-upload-export-smoke-test-runbook.md](./shipment-upload-export-smoke-test-runbook.md) — smoke 실행 절차 (D-4d)  
> - [smoke-samples/README.md](./smoke-samples/README.md) — 샘플 데이터 (D-4e)  
> - [smoke-samples/shipment-upload-smoke-orders.md](./smoke-samples/shipment-upload-smoke-orders.md)  
> - [smoke-samples/shipment-upload-smoke-file.csv](./smoke-samples/shipment-upload-smoke-file.csv)

**이 문서는 준비 계획만 다룹니다.**  
수행하지 않는 것: 실제 smoke test, DB insert/update/delete, seed script 작성, env 변경, 외부 쇼핑몰 API 호출, 송장전송.

**검증 범위가 아닌 것**  
- 쇼핑몰 API **송장전송** 준비  
- smoke **실행 결과** 기록 (D-4h-2 예정)  
- 본 문서 단계에서의 **실제 데이터 생성**

**이번 Phase가 검증하는 것**  
- 송장 업로드 → 매칭 → 확정/제외/연결 → READY → **쇼핑몰 업로드용 xlsx 다운로드** (파일 다운로드까지만)

---

## 1. 목적

| 항목 | 설명 |
|------|------|
| 무엇을 | smoke test에 필요한 **테스트 데이터 준비 방법**을 문서화 |
| 왜 | D-4g readiness **보류** — DB에 snapshot·계정이 없어 D-4h 즉시 실행 불가 |
| 무엇이 아님 | smoke 실행 runbook, DB write runbook, 송장전송 준비 |

smoke test는 **운영 송장전송 검증이 아닙니다**.  
업로드·매칭 처리 후 **다운로드 파일**만 확인합니다.

---

## 2. 현재 보류 사유 (D-4g 기준)

[D-4g readiness report](./shipment-upload-export-smoke-readiness-report.md) 요약:

| 항목 | 상태 |
|------|------|
| `OrderSyncOrder` 전체 | **0건** |
| `COUPANG` 연동 계정 | **0건** |
| `acc-smoke-test-001` | **없음** |
| smoke 전용 `userId` | **확인 불가** |
| 샘플 문서·CSV | ✅ 준비됨 |
| D-4h 실제 smoke 실행 | **불가 (보류)** |

로컬 `.env`가 **Production과 동일 Supabase**일 수 있음 — 데이터 준비 시에도 운영 주문·실제 PII와 **절대 섞지 않음**.

---

## 3. 필요한 테스트 데이터

| # | 대상 | 수량 | 기준·비고 |
|---|------|------|-----------|
| 1 | smoke **전용** 사용자 (`User` + NextAuth 로그인) | 1 | 운영 사용자 `userId` **사용 금지** |
| 2 | `OrderIntegrationAccount` | 1 | `provider`: `COUPANG`, id/scope: `acc-smoke-test-001` (또는 업로드 scope와 **일치하는 실제 account id**) |
| 3 | `OrderSyncBatch` | 1+ | snapshot 5건을 묶는 테스트용 batch (예: `batch-smoke-001`) |
| 4 | `OrderSyncOrder` snapshot | **5건** | [shipment-upload-smoke-orders.md](./smoke-samples/shipment-upload-smoke-orders.md) |
| 5 | 송장 샘플 CSV | 1 | [shipment-upload-smoke-file.csv](./smoke-samples/shipment-upload-smoke-file.csv) |

### 공통 scope (샘플 기준)

| 필드 | 값 |
|------|-----|
| `provider` | `COUPANG` |
| `integrationAccountId` | `acc-smoke-test-001` |
| 주문번호 prefix | `TEST-MALL-ORDER-*` |
| 엑클로드관리번호 prefix | `EX-SMOKE-*` |

---

## 4. 준비 방식 후보

### A안: 주문조회(`fetch-orders`)로 snapshot 생성

| | |
|---|---|
| **내용** | 실제 테스트 연동 계정으로 관리자 주문조회 API 실행 → `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED=true` 시 DB persist |
| **장점** | 운영에 가까운 end-to-end snapshot 생성 흐름 |
| **단점** | 현재 `COUPANG` 연동 계정 **0건** → **지금은 불가** |
| **주의** | **외부 쇼핑몰 API 호출 금지** 조건에서는 진행 불가. 쿠팡 API·프록시·credential 필요 |
| **D-4h-준비 판단** | ❌ 현재 상태에서는 **선택 불가** |

### B안: smoke 전용 데이터 **수동 insert** (승인 후)

| | |
|---|---|
| **내용** | 확정된 smoke `userId` 아래에 `OrderIntegrationAccount` 1건 + `OrderSyncBatch` + `OrderSyncOrder` 5건만 insert |
| **장점** | 샘플 문서·CSV와 **1:1 일치** 가능, API 호출 없음 |
| **단점** | Production DB 연결 시 **오염·삭제 누락** 위험 |
| **필수 조건** | smoke 전용 `userId` **명확** |
| | 운영 데이터와 **ID·주문번호 충돌 없음** (`TEST-MALL-ORDER-*`만) |
| | insert **전 사용자 승인** |
| | insert 후 **rollback/delete 계획** 문서화 |
| **D-4h-준비 판단** | ⚠️ **조건부 가능** (userId 확정 + DB 위험 승인 후) |

### C안: **별도 테스트 DB**에서 smoke

| | |
|---|---|
| **내용** | 로컬 `.env`의 `DATABASE_URL`을 테스트 전용 Supabase/Postgres로 분리 후 B안과 동일 데이터 준비 |
| **장점** | 운영 DB 위험 **최소화** |
| **단점** | env·DB 인프라 확인·분리 작업 필요, migration 적용 상태 맞춤 필요 |
| **필수 조건** | `DATABASE_URL` / `DIRECT_URL` 변경은 **별도 승인** |
| **D-4h-준비 판단** | ✅ **장기적으로 가장 안전** |

### 추천안 (본 문서 — **선택만**, 실행 없음)

| 우선순위 | 방안 | 이유 |
|----------|------|------|
| **1순위** | **C안** (별도 테스트 DB) | D-4g에서 Production DB 가능성 확인됨 |
| **2순위** | **B안** (smoke 전용 userId + 수동 insert) | C안 불가 시, **명시적 승인·삭제 계획** 하에만 |
| **비추천 (현재)** | **A안** | 연동 계정 없음 + 외부 API 호출 금지 |

**기본 권고 문장**  
> Production DB 가능성이 있으므로, **별도 테스트 DB(C안)** 또는 **smoke 전용 userId 확보 후 제한적 수동 insert(B안)** 중 하나를 사용자와 합의한 뒤, **D-4h-1**에서 insert runbook을 작성한다.  
> **본 D-4h-준비 단계에서는 어떤 안도 실행하지 않는다.**

---

## 5. smoke 전용 userId 확정 절차

| 단계 | 작업 | 비고 |
|------|------|------|
| 1 | 현재 **로그인 가능한 테스트 계정** 존재 여부 확인 | 운영 계정 사용 금지 |
| 2 | 없으면 **사용자에게 테스트 계정 생성·지정 여부 확인** | 이메일/계정명만 기록, 비밀번호 문서화 금지 |
| 3 | `userId`는 DB **read-only** 조회로만 기록 | D-4g 시점에는 snapshot 없어 **확인 불가** |
| 4 | readiness report에 `userId`(또는 마스킹 prefix) 반영 | write 후 D-4h-1에서 참조 |
| 5 | 해당 `userId`로만 account·order 준비 | 타 사용자 데이터 접근 금지 |

**금지**  
- 운영 사용자 `userId`로 smoke 데이터 생성  
- 문서에 credential·API key·실제 전화번호 기록

---

## 6. OrderIntegrationAccount 준비 기준

| 필드 | 기준 |
|------|------|
| `userId` | §5에서 확정한 smoke 전용 사용자 |
| `provider` | `COUPANG` |
| `id` | `acc-smoke-test-001` **또는** 업로드 UI/API scope에 넣을 실제 cuid — 샘플과 **반드시 일치** |
| `accountName` | 예: `SMOKE-TEST-COUPANG` (운영명과 구분) |
| API key / secret | **넣지 않음** — 실제 쿠팡 API 호출 목적 아님 |
| 목적 | 업로드 scope·매칭 필터·export 그룹 **일치** |

**주의**  
- Prisma `OrderIntegrationAccount`는 credential 필드가 있으나, smoke용은 **스코프 매칭만** 필요  
- `fetch-orders` 실행(A안)과 무관하게 B/C안에서는 **더미 계정 메타**만으로 충분할 수 있음 (스키마 필수 컬럼은 별도 확인)

---

## 7. OrderSyncOrder 5건 준비 기준

[shipment-upload-smoke-orders.md](./smoke-samples/shipment-upload-smoke-orders.md) 및 [shipment-upload-smoke-file.csv](./smoke-samples/shipment-upload-smoke-file.csv) 기준:

| # | 시나리오 | `mallOrderNo` | smoke 처리 | export |
|---|----------|---------------|------------|--------|
| 1 | 자동 매칭 성공 | `TEST-MALL-ORDER-001` | **confirm** | ✅ 포함 |
| 2 | 확인 필요 (`MATCHED_WARNING`) | `TEST-MALL-ORDER-002` | **confirm** (전화 불일치 검토 후) | ✅ 포함 |
| 3 | 매칭 실패 | `TEST-MALL-ORDER-003` | **link** | ✅ 포함 (연결 후) |
| 4 | 제외 | `TEST-MALL-ORDER-004` | **exclude** | ❌ 제외 |
| 5 | 송장번호 앞자리 0 | `TEST-MALL-ORDER-005` | **confirm** | ✅ 포함 (`000123456789`) |

**공통 필드** (각 row)  
- `userId`: smoke 전용  
- `provider`: `COUPANG`  
- `integrationAccountId`: §6과 동일  
- `excloadOrderNo`: `EX-SMOKE-0001` ~ `0005`  
- `receiverName` / `receiverPhone` / `receiverAddress`: 샘플 더미 값만  
- `orderStatus`: `PAID` 등 취소·이미발송 아닌 값  

**export·PII**  
- snapshot에 PII가 있어도 export 파일에는 수취인명·전화·주소 **미포함** (D-4b/c 구현 기준)  
- `rawPayloadJson` 등은 smoke 문서에 **기록하지 않음**

---

## 8. 실행 전 승인 체크리스트

DB write를 **시작하기 전** (D-4h-1 이후, 사용자 승인 필수):

- [ ] smoke 전용 `userId` **확정** (운영 user 아님)
- [ ] 대상 DB가 **운영 Supabase인지 / 별도 테스트 DB인지** 확인
- [ ] 준비 방안 **A/B/C 중 하나 합의** (본 문서 추천: C 또는 조건부 B)
- [ ] insert 대상 테이블 목록 확정 (`User`? `OrderIntegrationAccount`, `OrderSyncBatch`, `OrderSyncOrder` 등)
- [ ] insert **row 수** 확정 (최소 account 1 + batch 1 + order 5)
- [ ] `TEST-MALL-ORDER-*` / `EX-SMOKE-*`만 사용, 운영 주문번호와 **충돌 없음** 확인
- [ ] smoke 완료 후 **delete/rollback 계획** (batch id·userId 기준) 문서화
- [ ] **사용자 승인 전 DB write 금지**
- [ ] `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED` **임의 변경 금지** (B안 수동 insert와 별개로 flag 정책 유지)

---

## 9. 금지 사항

| 금지 | 적용 단계 |
|------|-----------|
| 실제 DB write (본 D-4h-준비) | ✅ 금지 |
| seed script / Prisma seed 작성 | ✅ 금지 |
| env 변경 | ✅ 금지 |
| Prisma schema / migration 변경 | ✅ 금지 |
| `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED` 변경 | ✅ 금지 |
| 쇼핑몰 API 호출 | ✅ 금지 |
| 송장전송 구현·실행 | ✅ 금지 |
| `app/` 코드 변경 | ✅ 금지 |
| `next-env.d.ts` 커밋 | ✅ 금지 |
| `scripts/capture-hero-gif.mjs` 커밋 | ✅ 금지 |
| 실제 smoke test 실행 | ✅ 금지 (D-4h-2) |

---

## 10. 다음 단계 제안

```
D-4h-준비 (본 문서)  →  C안 승인  →  D-4h-1 test DB plan  →  D-4h-2 setup  →  D-4h-3 insert  →  D-4h-4 smoke
```

| 단계 | 내용 | 전제 |
|------|------|------|
| **D-4h-준비** | 준비 방식·데이터 기준 문서화 | ✅ 본 문서 |
| **사용자 합의** | 테스트 계정/`userId`, **C안(별도 DB)** 승인 | smoke user 제공 또는 생성 승인 |
| **D-4h-1** | 별도 테스트 DB 준비 **계획** | ✅ [test-db-plan](./shipment-upload-export-test-db-plan.md) |
| **D-4h-2** | 테스트 DB setup runbook | ✅ [setup-runbook](./shipment-upload-export-test-db-setup-runbook.md) — 실행은 승인 후 |
| **D-4h-3** | smoke 데이터 insert runbook | ✅ [insert-runbook](./shipment-upload-export-smoke-data-insert-runbook.md) — 승인 후 실행 |
| **D-4h-4** | [smoke runbook](./shipment-upload-export-smoke-test-runbook.md) 실제 실행 | readiness **재점검** 후 |

**지금 할 일 (팀/사용자)**  
1. smoke test 전용 로그인 계정·`userId` 지정  
2. **C안(별도 테스트 DB)** 승인  
3. D-4h-2 setup runbook — [setup-runbook](./shipment-upload-export-test-db-setup-runbook.md) (실행은 승인 후)

**지금 하지 않을 일**  
- DB 생성, env 변경, migration, insert, smoke 업로드/다운로드 실행

---

## 부록 — 문서 흐름 (D-4)

| 단계 | 문서 |
|------|------|
| D-4d | [smoke-test-runbook](./shipment-upload-export-smoke-test-runbook.md) |
| D-4e | [smoke-samples](./smoke-samples/) |
| D-4f | [preflight-checklist](./shipment-upload-export-preflight-checklist.md) |
| D-4g | [readiness-report](./shipment-upload-export-smoke-readiness-report.md) — **보류** |
| D-4h-준비 | **본 문서** |
| D-4h-1 | [test-db-plan](./shipment-upload-export-test-db-plan.md) |
| D-4h-2 | [setup-runbook](./shipment-upload-export-test-db-setup-runbook.md) |
| D-4h-3 | [insert-runbook](./shipment-upload-export-smoke-data-insert-runbook.md) |
| D-4h-4 | [smoke-test-runbook](./shipment-upload-export-smoke-test-runbook.md) |
| D-4h-5 | (예정) cleanup runbook |
