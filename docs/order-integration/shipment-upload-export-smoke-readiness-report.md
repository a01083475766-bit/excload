# 송장 업로드·export smoke test Readiness Report

> **상태**: read-only 점검 보고서 (2026-07-09)  
> **점검 단계**: D-4g  
> **판정**: **보류** — D-4h 실제 smoke 실행 **불가** (테스트 snapshot·계정 미준비)  
> **관련 문서**  
> - [shipment-upload-export-preflight-checklist.md](./shipment-upload-export-preflight-checklist.md) (D-4f)  
> - [shipment-upload-export-smoke-test-runbook.md](./shipment-upload-export-smoke-test-runbook.md) (D-4d)  
> - [smoke-samples/README.md](./smoke-samples/README.md) (D-4e)

**본 보고서는 read-only 점검 결과만 기록합니다.**  
수행하지 않은 것: 실제 smoke test, 송장파일 업로드, API 호출(`POST /uploads`, confirm/exclude/link, export), DB write, seed 작성, env 변경, 송장전송.

**검증 범위가 아닌 것**  
- 쇼핑몰 API 송장전송  
- UI/API end-to-end smoke **실행 결과** (D-4h에서 수행 예정)

---

## 1. 점검 목적

| 항목 | 내용 |
|------|------|
| 목적 | D-4 smoke test **실행 전** 현재 환경에서 안전하게 진행 가능한지 read-only로 확인 |
| 범위 | git·샘플 파일·명령어 회귀·DB read-only 조회 |
| 아닌 것 | 송장전송 검증, 실제 업로드/다운로드 smoke 실행 |

---

## 2. 점검 결과 요약

### 최종 판정: **보류**

| 구분 | 결과 |
|------|------|
| 레포·문서·샘플 | ✅ 준비됨 |
| 명령어 회귀 (test/lint) | ✅ 통과 |
| TypeScript | ⚠️ 기존 5건 실패만 (shipments 무관) |
| 테스트 snapshot (DB) | ❌ **0 / 5건** — 미존재 |
| 테스트 연동 계정 | ❌ `acc-smoke-test-001` 없음, `COUPANG` 계정 0건 |
| smoke test 전용 userId | ❌ **확인 불가** (snapshot 없음) |
| D-4h 즉시 실행 | **불가** |

**권고**: 테스트 전용 사용자·`OrderIntegrationAccount`·`OrderSyncOrder` snapshot 5건을 **별도 준비**한 뒤 preflight 재확인 후 D-4h 진행.

---

## 3. git 상태

| 항목 | 결과 |
|------|------|
| 현재 branch | `main` |
| `origin/main` 동기화 | ✅ `HEAD` = `origin/main` = `c4c116d` |
| `app/` 코드 변경 | ✅ **없음** |
| 남은 변경 | `next-env.d.ts` (modified, 커밋 제외) |
| untracked | `scripts/capture-hero-gif.mjs` (커밋 제외) |

**제외 파일 정책**: `next-env.d.ts`, `scripts/capture-hero-gif.mjs` — 이번·향후 smoke 관련 커밋에 **포함하지 않음**.

---

## 4. 샘플 파일 확인

| 항목 | 결과 |
|------|------|
| [smoke-samples/README.md](./smoke-samples/README.md) | ✅ 존재 |
| [smoke-samples/shipment-upload-smoke-orders.md](./smoke-samples/shipment-upload-smoke-orders.md) | ✅ 존재 |
| [smoke-samples/shipment-upload-smoke-file.csv](./smoke-samples/shipment-upload-smoke-file.csv) | ✅ 존재 |
| CSV 헤더 | `주문번호,받는분,수취인전화,수취인주소,택배사,송장번호` |
| CSV 데이터 행 수 | **5행** (+ 헤더 1행) |
| 앞자리 0 송장번호 | ✅ 5행 `000123456789` |
| 인코딩 | UTF-8 (BOM 없음, 로컬 확인) |

**scope (샘플 기준)**

| 항목 | 값 |
|------|-----|
| `provider` | `COUPANG` |
| `integrationAccountId` | `acc-smoke-test-001` |

---

## 5. 테스트 데이터 준비 상태

### 5.1 필요 snapshot (5건)

| # | `mallOrderNo` | `excloadOrderNo` | 기대 action |
|---|---------------|------------------|-------------|
| 1 | `TEST-MALL-ORDER-001` | `EX-SMOKE-0001` | confirm |
| 2 | `TEST-MALL-ORDER-002` | `EX-SMOKE-0002` | confirm (warning) |
| 3 | `TEST-MALL-ORDER-003` | `EX-SMOKE-0003` | link |
| 4 | `TEST-MALL-ORDER-004` | `EX-SMOKE-0004` | exclude |
| 5 | `TEST-MALL-ORDER-005` | `EX-SMOKE-0005` | confirm (송장 `000123456789`) |

### 5.2 DB read-only 조회 결과

**조회 방법**: 로컬 `.env`의 `DATABASE_URL`로 Prisma **SELECT only** (write 없음).  
**DB**: PostgreSQL (Supabase pooler, `aws-1-ap-northeast-2`) — Production과 **동일 DB일 수 있음** (preflight 문서와 동일 주의).

| 조회 항목 | 결과 |
|-----------|------|
| `OrderSyncOrder` 테이블 접근 | ✅ 가능 |
| 샘플 `TEST-MALL-ORDER-*` 5건 (`COUPANG`) | ❌ **0건** |
| `TEST-MALL-ORDER-` prefix 전체 | **0건** |
| `OrderIntegrationAccount` id `acc-smoke-test-001` | ❌ **없음** |
| `COUPANG` 연동 계정 수 | **0건** |
| `OrderSyncOrder` 전체 건수 | **0건** |
| `OrderIntegrationAccount` 전체 건수 | **0건** |
| smoke test 전용 `userId` | ❌ **확인 불가** (해당 snapshot·계정 없음) |

### 5.3 운영 데이터 혼입 판단

| 항목 | 판단 |
|------|------|
| 샘플 주문번호가 DB에 존재 | ❌ — 운영 데이터와 **충돌 없음** (아직 아무 snapshot도 없음) |
| 운영 주문과 섞여 있는지 | 이번 scope에서는 **판단 불필요** (OrderSyncOrder 0건) |
| smoke 실행 시 위험 | DB가 비어 있어도 **Production 공유 DB**일 수 있으므로, 준비 시 **테스트 전용 식별자만** 사용 |

---

## 6. DB / env 안전성

| 항목 | D-4g 점검 시 상태 |
|------|-------------------|
| Production DB = local `.env` 가능성 | ⚠️ **있음** (Supabase endpoint 확인) |
| env 변경 | ✅ **없음** |
| DB insert/update/delete | ✅ **없음** |
| seed script 작성 | ✅ **없음** |
| Prisma migration 변경/적용 | ✅ **없음** (`migrate status`: up to date, pending 0) |
| `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED` | ✅ **변경 없음** (`.env.example` 기본 주석 `false`) |

---

## 7. 명령어 검증 결과

점검 시각: 2026-07-09 (로컬)

### 7.1 `npm test`

```bash
npm test -- --run app/lib/order-integration/shipments app/api/order/integration/shipments
```

| 결과 | 상세 |
|------|------|
| ✅ 통과 | Test Files **24 passed**, Tests **224 passed** |

### 7.2 `npm run lint`

| 결과 | 상세 |
|------|------|
| ✅ 통과 | eslint 오류 없음 |

### 7.3 `npx tsc --noEmit`

| 결과 | 상세 |
|------|------|
| ⚠️ 실패 5건 | **기존 알려진 오류만**, shipments/export 경로 **신규 오류 없음** |

| 파일 | 건수 |
|------|------|
| `app/lib/order-integration/shopify-account.test.ts` | 1 |
| `app/lib/trial-first-preview-format-notice.test.ts` | 4 |

---

## 8. smoke test 시작 가능 조건 (체크)

| 조건 | 상태 |
|------|------|
| 테스트 user 확인 | ❌ 불명확 |
| `OrderSyncOrder` snapshot 5건 | ❌ 미준비 (0/5) |
| `provider` / `integrationAccountId` scope 일치 | ❌ `acc-smoke-test-001`·`COUPANG` 계정 없음 |
| 샘플 CSV 확인 | ✅ |
| 운영 데이터와 분리 | ✅ (현재 OrderSyncOrder 0건) |
| 송장전송 API/버튼 없음 | ✅ (UI 안내 문구만, shipments API에 전송 route 없음) |
| export는 다운로드만 | ✅ (구현·문서 기준) |

---

## 9. 중단 / 보류 조건 해당 여부

| 중단 조건 | 해당 |
|-----------|------|
| 테스트 `userId` 불명확 | ✅ **해당** |
| snapshot 없음 | ✅ **해당** (0/5) |
| 운영 데이터와 구분 불가 | ❌ 해당 없음 (데이터 0건) |
| env 변경 필요 | ❌ |
| DB write 필요 (snapshot 준비) | ✅ **향후 필요** (D-4g에서는 수행 안 함) |
| migration/drift 경고 | ❌ (schema up to date) |
| 송장전송 필요 | ❌ |

---

## 10. 최종 권고

### D-4h 실제 smoke 실행: **지금은 불가 (보류)**

**이유 요약**

1. DB에 smoke용 `OrderSyncOrder` **0건** — 업로드 매칭에 필요한 주문 snapshot 없음  
2. `COUPANG` / `acc-smoke-test-001` 연동 계정 **없음**  
3. smoke test 전용 로그인 사용자·`userId` **미확정**

### D-4h 전 필요한 준비 (권장 순서)

1. **smoke test 전용** NextAuth 사용자 확정 (`userId` 기록)  
2. 동일 `userId`로 `OrderIntegrationAccount` 생성  
   - `provider`: `COUPANG`  
   - `id`: `acc-smoke-test-001` (또는 샘플 문서·업로드 scope를 **실제 account id**에 맞게 수정)  
3. [shipment-upload-smoke-orders.md](./smoke-samples/shipment-upload-smoke-orders.md) 기준 `OrderSyncOrder` **5건** 준비  
   - `TEST-MALL-ORDER-*`, `EX-SMOKE-*` 더미 식별자만 사용  
   - 운영 주문번호·실제 PII 사용 금지  
4. [preflight checklist](./shipment-upload-export-preflight-checklist.md) §7 재확인  
5. 준비 완료 후 **D-4h**에서 runbook §5·§6 실행 및 결과 별도 기록

### 레포·구현 측면

- D-4 코드·문서·샘플은 smoke **실행 준비는 완료**  
- **데이터·계정 준비만** 남음 — 준비 후 재점검 권장

---

## 부록 — 점검 수행 내역

| 수행 | write | 비고 |
|------|-------|------|
| `git status` / `git fetch` | ❌ | |
| 샘플 파일 읽기 | ❌ | |
| `npm test` / `lint` / `tsc` | ❌ | |
| `npx prisma migrate status` | ❌ | |
| Prisma `findMany` / `count` (read-only) | ❌ | 일시 스크립트, **커밋·유지 안 함** |
| 송장 업로드·API 호출 | ❌ | |
| env / DB 변경 | ❌ | |

**점검 커밋**: `c4c116d` (`docs(order-sync): add shipment export preflight checklist`)
