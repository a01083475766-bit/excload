# 송장 업로드·export smoke test — 실행 Runbook (D-4h-4)

> **상태**: 실행 runbook (2026-07-10) — **실행 전 승인·선행 완료 필요**  
> **단계**: D-4h-4  
> **목적**: **별도 테스트 DB** + smoke insert 데이터가 준비된 환경에서 D-4 smoke test를 **실제로 실행**하기 위한 절차·기대 결과·실패 기록  
> **관련 문서**  
> - [shipment-upload-export-smoke-test-runbook.md](./shipment-upload-export-smoke-test-runbook.md) — D-4d (일반 smoke 체크리스트)  
> - [shipment-upload-export-test-db-setup-runbook.md](./shipment-upload-export-test-db-setup-runbook.md) — D-4h-2  
> - [shipment-upload-export-smoke-data-insert-runbook.md](./shipment-upload-export-smoke-data-insert-runbook.md) — D-4h-3  
> - [shipment-upload-export-preflight-checklist.md](./shipment-upload-export-preflight-checklist.md) — D-4f  
> - [smoke-samples/README.md](./smoke-samples/README.md) — D-4e  
> - [smoke-samples/shipment-upload-smoke-file.csv](./smoke-samples/shipment-upload-smoke-file.csv)  
> - [shipment-upload-export-smoke-cleanup-runbook.md](./shipment-upload-export-smoke-cleanup-runbook.md) — D-4h-5  
> - [shipment-upload-export-smoke-result-template.md](./shipment-upload-export-smoke-result-template.md) — D-4h-6

**본 문서는 D-4h-4 문서 작성 단계입니다.**  
**이번 단계에서 수행하지 않는 것**: 실제 smoke 실행, 송장파일 업로드, API 호출, export 다운로드, DB write, env 변경, 쇼핑몰 API 호출, 송장전송.

**검증 범위**  
- 송장파일 업로드 → 매칭 → 확정/제외/연결 → READY → **쇼핑몰 업로드용 xlsx 다운로드** (파일 다운로드까지만)

**검증 범위 아님**  
- 쇼핑몰 API **송장전송**  
- 운영 DB에서의 smoke

> ⚠️ **실제 실행**은 D-4h-2 setup·D-4h-3 insert **완료** 및 **사용자 승인** 후, `.env.smoke.local`로 앱을 띄운 뒤 본 runbook 체크리스트를 따릅니다.

---

## 1. 목적

| 항목 | 설명 |
|------|------|
| 무엇을 | 테스트 DB 환경에서 **end-to-end smoke 실행 절차**·기대 결과·실패 기록 항목 |
| 왜 | D-4 구현(업로드~다운로드)이 실제 환경에서 동작하는지 검증 |
| 무엇이 아님 | 송장전송, 쇼핑몰 관리자 업로드 자동화, provider별 실제 API 연동 |

---

## 2. 실행 전 전제 조건

아래 **모두** 충족 후 실행 시작:

| # | 조건 | 확인 문서 |
|---|------|-----------|
| P1 | [D-4h-2 setup](./shipment-upload-export-test-db-setup-runbook.md) **완료** | 테스트 DB·migrate·`.env.smoke.local` |
| P2 | [D-4h-3 insert](./shipment-upload-export-smoke-data-insert-runbook.md) **완료** | user / account / order 5건 |
| P3 | 연결 DB = **테스트 DB** (운영과 분리) | URL·프로젝트명 |
| P4 | **`.env.smoke.local`** 로 dev 실행 (운영 `.env` 미사용) | setup runbook §5 |
| P5 | smoke 전용 **`userId` 확정** | insert runbook §5 |
| P6 | `OrderIntegrationAccount` **1건** (`acc-smoke-test-001`, `COUPANG`) | insert runbook §6 |
| P7 | `OrderSyncOrder` **5건** (`TEST-MALL-ORDER-*`) | insert runbook §7 |
| P8 | 샘플 CSV 준비 | [shipment-upload-smoke-file.csv](./smoke-samples/shipment-upload-smoke-file.csv) |
| P9 | [preflight](./shipment-upload-export-preflight-checklist.md) §6 test/lint 통과 (권장) | 회귀 |
| P10 | **사용자 실행 승인** | — |

### 앱 기동 (예시 — 실행 전 승인 필요)

```bash
# ⚠️ D-4h-4 문서 작성 단계에서는 실행하지 않음
# DATABASE_URL이 테스트 DB인지 확인 후
npx dotenv -e .env.smoke.local -- npm run dev
```

---

## 3. 실행 금지 조건

다음 중 하나면 **실행하지 않음**:

| 조건 |
|------|
| 운영 DB 여부 **불명확** |
| env가 **운영 `.env`** 또는 Production `DATABASE_URL`로 보임 |
| smoke 전용 **`userId` 불명확** |
| `OrderSyncOrder` **5건 없음** |
| `COUPANG` / `acc-smoke-test-001` scope **불일치** |
| **송장전송** 또는 **외부 쇼핑몰 API** 호출이 필요한 상황 |
| D-4h-2 / D-4h-3 **미완료** |

---

## 4. 실행 대상 샘플

**CSV 경로**: [smoke-samples/shipment-upload-smoke-file.csv](./smoke-samples/shipment-upload-smoke-file.csv)

**업로드 scope**: `provider=COUPANG`, `integrationAccountId=acc-smoke-test-001`

| CSV 행 | `mallOrderNo` | 예상 algorithm | smoke 처리 | export |
|--------|---------------|----------------|------------|--------|
| 1 | `TEST-MALL-ORDER-001` | `MATCHED_CONFIDENT` | **confirm** | ✅ |
| 2 | `TEST-MALL-ORDER-002` | `MATCHED_WARNING` | **confirm** (warning 검토 후) | ✅ |
| 3 | *(없음)* | `NOT_MATCHED` | **link** → order 003 | ✅ |
| 4 | `TEST-MALL-ORDER-004` | `MATCHED_CONFIDENT` | **exclude** | ❌ |
| 5 | `TEST-MALL-ORDER-005` | `MATCHED_CONFIDENT` | **confirm** | ✅ (`000123456789`) |

---

## 5. UI smoke 실행 순서

**진입**: `/order/integration/shipments`  
**계정**: smoke 전용 NextAuth 로그인

체크리스트 (실행 시 순서대로):

### 5.1 환경·접속

- [ ] `.env.smoke.local`로 앱 실행 중
- [ ] smoke **테스트 계정** 로그인
- [ ] 안내: 「아직 쇼핑몰에 송장전송되지 않습니다」표시

### 5.2 업로드

- [ ] [shipment-upload-smoke-file.csv](./smoke-samples/shipment-upload-smoke-file.csv) 선택
- [ ] scope: `COUPANG` / `acc-smoke-test-001`
- [ ] 네트워크: `POST /api/order/integration/shipments/uploads` → **200**
- [ ] `uploadBatchId` 수신 — **기록** (§9)
- [ ] UI: 5행 파싱·주문 스냅샷 5건 로드 표시

### 5.3 상세·매칭 상태

- [ ] `GET /api/order/integration/shipments/uploads/:batchId` → **200**
- [ ] `batchStatus` ≠ `READY` (초기)
- [ ] 행별 algorithm 상태가 §4 표와 **대체로 일치**

### 5.4 행 처리

- [ ] 행 1 (`001`): **확정** → `POST .../confirm` **200**
- [ ] 행 2 (`002`): **확정** (warning 검토 후) → **200**
- [ ] 행 3 (매칭 실패): **주문 연결** → `GET .../linkable-orders` **200** → `POST .../link` **200**
- [ ] 행 4 (`004`): **제외** → `POST .../exclude` **200**
- [ ] 행 5 (`005`): **확정** → **200**
- [ ] 모든 행 `UNCONFIRMED` 아님

### 5.5 READY·다운로드

- [ ] `batchStatus` → **`READY`**
- [ ] 「쇼핑몰 업로드용 엑셀 다운로드」 버튼 **활성화**
- [ ] 클릭 → `GET .../export?format=xlsx` → **200**, xlsx 저장
- [ ] 주의 문구: 「이 파일은 쇼핑몰에 **직접 전송되지 않습니다**…」

### 5.6 네트워크 부정 확인

- [ ] **쇼핑몰 송장전송 API** 호출 **없음**
- [ ] 쿠팡 등 **외부 주문/배송 API** 호출 **없음**

---

## 6. API smoke 확인 순서

NextAuth 세션 필요. 미로그인 **401**.

| 순서 | API | 기대 status | 확인 항목 |
|------|-----|-------------|-----------|
| 1 | `POST /api/order/integration/shipments/uploads` | **200** | `success`, `uploadBatchId`, `displayRows` |
| 2 | `GET /api/order/integration/shipments/uploads/:batchId` | **200** | `uploadBatch`, matches, **마스킹** 필드 |
| 3 | `POST .../matches/:matchId/confirm` | **200** | 확정 가능 행만 |
| 4 | `POST .../matches/:matchId/exclude` | **200** | 제외 행 |
| 5 | `GET .../linkable-orders?q=...&limit=30` | **200** | 후보 주문, PII 마스킹 |
| 6 | `POST .../matches/:matchId/link` | **200** | `{ orderSyncOrderId }` |
| 7 | `GET .../export?format=xlsx` | **200** | blob, `Content-Disposition` 파일명 |

**READY 전 export**: **409** (부정 테스트 — 선택)

상세 status·오류 메시지: [D-4d smoke-test-runbook](./shipment-upload-export-smoke-test-runbook.md) §6·§7.

---

## 7. 다운로드 파일 검증

| 항목 | 기대 |
|------|------|
| 파일명 | `excload-shipment-upload-{batchId}.xlsx` 또는 `Content-Disposition` 값 |
| 시트 | provider/account 그룹별 1시트 이상 (단일 그룹이면 1시트) |
| **8개 컬럼** | 쇼핑몰, 연동계정ID, 쇼핑몰주문번호, 엑클로드관리번호, 택배사, 송장번호, 매칭ID, 주문스냅샷ID |
| 행 수 | **4건** (exclude 제외) |
| EXCLUDED (`004`) | **미포함** |
| PII | 수취인명·전화·주소 **컬럼 없음** |
| raw JSON | `rawRowJson`, `candidateOrdersJson` 등 **없음** |
| 송장번호 | `TEST-MALL-ORDER-005` 행 = **`000123456789`** (앞자리 `0` 유지) |

---

## 8. 기대 결과 (PASS 기준)

| 항목 | 기대 |
|------|------|
| `ShipmentUploadBatch` | 생성됨 (`uploadBatchId` 기록) |
| match | **5건** (업로드 행 수) |
| confirm | **3건** (001, 002, 005) |
| link | **1건** (003) |
| exclude | **1건** (004) |
| `batchStatus` | **`READY`** |
| export xlsx | 다운로드 **성공** |
| export rows | **4건** |
| 송장번호 `0` 보존 | `000123456789` |
| 외부 쇼핑몰 API | **호출 없음** |
| 송장전송 | **없음** |

---

## 9. 실패 시 기록 항목

실행 중 FAIL 시 아래를 **별도 결과 메모**에 기록 (레포 커밋은 D-4 결과 보고 시 판단):

| 필드 | 내용 |
|------|------|
| 실패 단계 | 예: 업로드 / confirm / link / export |
| `batchId` | |
| `matchId` | 해당 시 |
| HTTP status | |
| UI 오류 메시지 | |
| 서버 로그 | **PII 원문 노출 여부** (있으면 즉시 중단·보고) |
| 재현 방법 | env·CSV·처리 순서 |
| 중단 여부 | 계속 진행 불가 시 **중단** |

---

## 10. smoke 완료 후 다음 단계

| 단계 | 내용 |
|------|------|
| **D-4h-5** | [cleanup-runbook](./shipment-upload-export-smoke-cleanup-runbook.md) — `OrderSyncOrder`, upload batch 등 **삭제 별도 승인** |
| **결과 보고** | [result-template](./shipment-upload-export-smoke-result-template.md) — PASS/FAIL, §8·§9 요약 기록 |
| **이후 Phase** | provider별 업로드 양식 고도화, **송장전송** — smoke PASS 후 **별도 기획** |

**D-4h-4 문서 단계**: cleanup·결과 보고 **작성/실행 안 함**.

---

## 부록 A — D-4d와의 관계

| 문서 | 역할 |
|------|------|
| [smoke-test-runbook](./shipment-upload-export-smoke-test-runbook.md) (D-4d) | 범용 체크리스트·API status·보안 |
| **본 runbook** (D-4h-4) | **테스트 DB + insert 완료** 전제의 **실행 순서·PASS 기준** |

---

## 부록 B — 문서 흐름 (D-4h)

| 단계 | 문서 |
|------|------|
| D-4h-2 | [setup-runbook](./shipment-upload-export-test-db-setup-runbook.md) |
| D-4h-3 | [insert-runbook](./shipment-upload-export-smoke-data-insert-runbook.md) |
| D-4h-4 | **본 runbook** |
| D-4h-5 | [cleanup-runbook](./shipment-upload-export-smoke-cleanup-runbook.md) |
| D-4h-6 | [result-template](./shipment-upload-export-smoke-result-template.md) |
