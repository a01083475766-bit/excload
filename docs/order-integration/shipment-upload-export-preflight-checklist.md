# 송장 업로드·export smoke test Preflight Checklist

> **상태**: 실행 전 점검 문서 (2026-07) — **체크리스트만** (실제 smoke 실행은 별도 단계)  
> **목적**: D-4 smoke test를 **시작하기 전** 환경·데이터·안전 조건을 점검  
> **관련 문서**  
> - [shipment-upload-export-smoke-test-runbook.md](./shipment-upload-export-smoke-test-runbook.md) — smoke test 절차 (D-4d)  
> - [smoke-samples/README.md](./smoke-samples/README.md) — 샘플 데이터 안내 (D-4e)  
> - [smoke-samples/shipment-upload-smoke-orders.md](./smoke-samples/shipment-upload-smoke-orders.md) — 주문 snapshot 예시  
> - [smoke-samples/shipment-upload-smoke-file.csv](./smoke-samples/shipment-upload-smoke-file.csv) — 송장 CSV 샘플  
> - [snapshot-persist-smoke-test.md](./snapshot-persist-smoke-test.md) — snapshot persist 정책 참고

**이 문서는 preflight 점검만 다룹니다.**  
아래 작업은 **본 문서 작성·점검 단계에서 수행하지 않습니다**: 실제 smoke test 실행, DB insert/update/delete, env 변경, seed script 작성, 외부 쇼핑몰 API 호출, 송장전송.

**검증 범위가 아닌 것 (명시)**  
- 쇼핑몰 API **송장전송**  
- 배송조회·주문상태 변경 API 호출  
- Production env / `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED` 임의 변경  
- smoke **결과 기록** (별도 단계 D-4g 또는 실행 보고서)

---

## 1. 목적

D-4 smoke test를 실행하기 **전에** 다음을 확인합니다.

| 확인 항목 | 설명 |
|-----------|------|
| 환경 안정성 | 레포·브랜치·의도치 않은 코드 변경 없음 |
| 데이터 안전 | 운영 주문·실제 고객 데이터와 분리 |
| 테스트 준비 | 전용 계정·snapshot·샘플 CSV·scope 일치 |
| 범위 명확화 | **송장전송이 아니라** 업로드 → 매칭 처리 → **xlsx 다운로드** 흐름 검증 준비 |

smoke test는 **파일 다운로드까지만** 확인합니다. 쇼핑몰 관리자 업로드·API 송장전송은 **이번 Phase 범위 밖**입니다.

---

## 2. 현재 완료된 범위 (D-4 기준)

구현·문서가 준비된 항목:

| 영역 | 내용 |
|------|------|
| 업로드 저장 | `POST /api/order/integration/shipments/uploads` |
| 상세 조회 | `GET /api/order/integration/shipments/uploads/:batchId` |
| 확정 | `POST .../matches/:matchId/confirm` |
| 제외 | `POST .../matches/:matchId/exclude` |
| 주문 연결 후보 | `GET .../linkable-orders` |
| 주문 연결 | `POST .../matches/:matchId/link` |
| READY 승격 | confirm/exclude/link 후 자동 평가 |
| export DTO | READY 배치 export row 생성 |
| 다운로드 API | `GET .../export?format=xlsx` (CSV API도 존재, UI는 xlsx) |
| UI | `ShipmentMatchPanel` — 업로드·확정·제외·연결·엑셀 다운로드 |
| 문서·샘플 | runbook (D-4d), smoke samples (D-4e), 본 preflight (D-4f) |

**아직 하지 않는 것**: 실제 smoke 실행, smoke 결과 보고서, 송장전송.

---

## 3. 실행 전 필수 확인

smoke test **시작 전** 아래를 모두 체크합니다.

### 3.1 Git / 레포 상태

- [ ] 현재 브랜치가 **`main`**
- [ ] `git fetch` 후 **`origin/main`과 동기화** (`Your branch is up to date with 'origin/main'`)
- [ ] `git status`에 **의도치 않은 `app/` 변경 없음**
- [ ] `next-env.d.ts` — 수정되어도 **커밋·smoke 전제로 사용하지 않음** (로컬 생성 파일, 커밋 제외)
- [ ] `scripts/capture-hero-gif.mjs` — **untracked 유지**, 커밋 제외

### 3.2 테스트 계정·데이터

- [ ] **smoke test 전용** 로그인 계정 존재 (NextAuth 세션 가능)
- [ ] 해당 계정 `userId`로 **테스트용 `OrderSyncOrder` snapshot** 준비 계획 수립  
  (본 preflight 단계에서는 **insert 하지 않음** — 준비 여부만 확인)
- [ ] 업로드 scope: `provider` = **`COUPANG`**, `integrationAccountId` = **`acc-smoke-test-001`** (샘플 기준)
- [ ] snapshot이 **운영 주문·실제 고객 데이터와 ID/주문번호가 겹치지 않음**

### 3.3 샘플 파일 경로

- [ ] [smoke-samples/shipment-upload-smoke-orders.md](./smoke-samples/shipment-upload-smoke-orders.md) — 주문 5건 예시 확인
- [ ] [smoke-samples/shipment-upload-smoke-file.csv](./smoke-samples/shipment-upload-smoke-file.csv) — 송장 CSV 5행 확인
- [ ] CSV 인코딩 **UTF-8**, 헤더·행 수(헤더 1 + 데이터 5) 확인

### 3.4 범위·금지 재확인

- [ ] smoke test는 **송장전송 검증이 아님**
- [ ] UI/API에 **송장전송 버튼·외부 쇼핑몰 API 호출 없음** (기존 안내 문구만 존재)
- [ ] export 확인은 **브라우저/HTTP 파일 다운로드**까지만

---

## 4. DB / env 주의사항

### 4.1 Production DB 공유 가능성

[snapshot-persist-smoke-test.md](./snapshot-persist-smoke-test.md)와 동일하게:

- 로컬 `.env`의 `DATABASE_URL` / `DIRECT_URL`이 **Vercel Production과 동일 Supabase**일 수 있음
- smoke 실행 시 `ShipmentUploadBatch` 등 **테스트 row가 Production DB에 생성될 수 있음**
- 따라서 **실제 운영 주문 데이터로 테스트 금지**, 테스트 전용 식별자(`TEST-MALL-ORDER-*`, `EX-SMOKE-*`)만 사용

### 4.2 본 preflight 단계 금지

| 금지 | 이유 |
|------|------|
| DB insert / update / delete | smoke **실행 단계**에서만, 별도 승인 후 |
| env 변경 | Production·로컬 정책 유지 |
| Prisma schema / migration 변경 | 범위 외 |
| seed script / Prisma seed 작성 | 운영 DB 오염·정책 위반 위험 |
| `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED` 임의 변경 | snapshot persist 별도 승인 절차 |

### 4.3 커밋 제외 파일 (레포 정책)

- `next-env.d.ts` — **커밋하지 않음**
- `scripts/capture-hero-gif.mjs` — **커밋하지 않음**

---

## 5. 테스트 데이터 준비 상태 확인

샘플 기준: **`COUPANG` / `acc-smoke-test-001`**

| # | 용도 | `mallOrderNo` | `excloadOrderNo` | `receiverName` | `receiverPhone` | `receiverAddress` | CSV 송장번호 | 준비 |
|---|------|---------------|------------------|----------------|-----------------|-------------------|--------------|------|
| 1 | 자동 매칭 → confirm | `TEST-MALL-ORDER-001` | `EX-SMOKE-0001` | 테스트일 | `010-0000-0001` | 테스트시 테스트구 테스트로 1 | `91000000001` | [ ] |
| 2 | MATCHED_WARNING → confirm | `TEST-MALL-ORDER-002` | `EX-SMOKE-0002` | 테스트이 | `010-0000-0002` | 테스트시 테스트구 테스트로 2 | `92000000002` (CSV 전화 `010-0000-0099`) | [ ] |
| 3 | NOT_MATCHED → link | `TEST-MALL-ORDER-003` | `EX-SMOKE-0003` | 테스트삼 | `010-0000-0003` | 테스트시 테스트구 테스트로 3 | `93000000003` (CSV 주문번호 없음) | [ ] |
| 4 | 제외 exclude | `TEST-MALL-ORDER-004` | `EX-SMOKE-0004` | 테스트사 | `010-0000-0004` | 테스트시 테스트구 테스트로 4 | `94000000004` | [ ] |
| 5 | 앞자리 0 보존 | `TEST-MALL-ORDER-005` | `EX-SMOKE-0005` | 테스트오 | `010-0000-0005` | 테스트시 테스트구 테스트로 5 | **`000123456789`** | [ ] |

**snapshot 준비 체크**

- [ ] 위 5건이 동일 `userId`·`provider`·`integrationAccountId`로 존재할 **계획**이 있음
- [ ] `orderStatus` 등 취소·이미발송 상태가 시나리오를 깨지 않음 (`PAID` 권장)
- [ ] 송장번호 `000123456789` — export·UI에서 **앞자리 `0` 유실 없음**을 smoke에서 확인할 예정

---

## 6. smoke 실행 전 명령어 체크

smoke **시작 직전** (또는 preflight 문서화 시 참고용) 아래를 실행합니다.  
**본 D-4f 단계에서는 실행 필수가 아니나**, runbook §4.4와 동일한 회귀 기준입니다.

### 6.1 Git

```bash
git status
git branch --show-current
git fetch origin
git status
```

**기대**: `main`, `origin/main`과 동기화, `app/` 의도치 않은 변경 없음.

### 6.2 테스트

```bash
npm test -- --run app/lib/order-integration/shipments app/api/order/integration/shipments
```

**기대**: shipments 관련 테스트 통과 (D-4 시점 기준 224 passed 수준).

### 6.3 Lint

```bash
npm run lint
```

**기대**: 통과.

### 6.4 TypeScript

```bash
npx tsc --noEmit
```

**참고**: 레포에 **기존 5건 tsc 실패**가 알려져 있음 (`shopify-account.test.ts` 1건, `trial-first-preview-format-notice.test.ts` 4건).  
이번 D-4 shipments 변경과 **무관한지** 확인하는 용도이며, **새로운 tsc 오류가 shipments/export 경로에서 발생하면 smoke 시작 보류**.

---

## 7. 실제 smoke test 시작 조건

아래 **모두** 충족 시 [runbook](./shipment-upload-export-smoke-test-runbook.md) §5·§6 실행을 **시작해도 됨**:

- [ ] §3 Git·레포·금지 항목 통과
- [ ] §4 DB/env 주의사항 숙지, 운영 데이터 미사용 확약
- [ ] 테스트 **전용** 사용자 계정 확정
- [ ] 테스트 snapshot **5건 준비 완료** (또는 준비 직후 smoke 시작 승인)
- [ ] 샘플 CSV 경로·내용 확인
- [ ] 주문/송장 샘플이 운영 데이터와 **섞이지 않음**
- [ ] 송장전송 관련 버튼·API 호출 **없음** 확인
- [ ] export는 **파일 다운로드**까지만 검증
- [ ] §6 명령어 체크 통과 (또는 팀이 정한 최소 회귀 통과)

**시작 URL**: `/order/integration/shipments`

---

## 8. 중단 조건

다음 중 **하나라도** 해당하면 smoke test를 **시작하지 않거나 즉시 중단**합니다.

| 조건 | 조치 |
|------|------|
| 운영 DB로 보이는 실주문·실고객 데이터가 섞여 있음 | 중단, 테스트 전용 데이터로 재준비 |
| 테스트 사용자·`userId` 불명확 | 중단, 전용 계정 확정 후 재시도 |
| `provider` / `integrationAccountId` scope 불명확 | 중단, 샘플 scope와 일치시킨 뒤 재시도 |
| env 변경 없이는 진행 불가 | 중단, 별도 승인·문서화 후 진행 |
| 송장전송 또는 외부 쇼핑몰 API 호출이 필요한 상황 | **중단** — D-4 범위 밖 |
| 예상하지 못한 migration pending / schema drift | 중단, `npx prisma migrate status` 등 별도 점검 |
| `app/`에 의도치 않은 로컬 변경 | 중단, 정리 후 재확인 |
| shipments 관련 테스트·lint 실패 또는 **새** tsc 오류 | 중단, 수정 후 preflight 재실행 |

---

## 9. 완료 판정 (preflight)

본 **preflight 문서** 기준 완료 = smoke test를 **시작해도 되는 조건**이 문서화·체크된 상태:

- [ ] §1~§4 내용 숙지
- [ ] §5 테스트 데이터 표 체크 (준비 계획 또는 완료)
- [ ] §7 시작 조건 항목 검토
- [ ] §8 중단 조건 숙지

**실제 smoke PASS/FAIL 결과**는 이 문서에 기록하지 않습니다.  
실행 후 결과는 **별도 보고** 또는 **D-4g** 단계에서 기록합니다.

---

## 부록 — 문서 흐름

```
D-4f preflight (본 문서)  →  실행 승인  →  D-4d runbook 실행  →  D-4g 결과 기록(예정)
         ↑
   D-4e smoke-samples
```

| 단계 | 문서 |
|------|------|
| Preflight | [shipment-upload-export-preflight-checklist.md](./shipment-upload-export-preflight-checklist.md) |
| 샘플 | [smoke-samples/](./smoke-samples/) |
| 실행 | [shipment-upload-export-smoke-test-runbook.md](./shipment-upload-export-smoke-test-runbook.md) |
