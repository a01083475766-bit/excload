# 쇼핑몰 API 송장전송 설계 (D-6b)

> **상태**: 공통 DTO·eligibility·상태 전이 구현 (2026-07-10)  
> **범위**: 순수 함수 + 단위 테스트 + adapter 계약 타입  
> **비범위**: Prisma migration, API route, UI, 외부 몰 API, Attempt 로그 테이블

관련:

- [order-sync-shipment-roadmap.md](./order-sync-shipment-roadmap.md) — 3차 API 송장전송
- [shipment-match-confirmation-design.md](./shipment-match-confirmation-design.md) — 확정·READY
- 코드: `app/lib/order-integration/transmission/`

---

## 1. ShipmentMatch가 개별 전송 상태의 기준인 이유

송장전송 단위는 **업로드 행 1건 ↔ 확정된 매칭 1건**입니다.

- 동일 `OrderSyncOrder`에 여러 송장 행이 연결될 수 있는 확장에 대비
- 확정·제외·수정(`userConfirmationStatus`, `finalTracking*`)이 match에 있음
- export 대상과 동일한 단위 (`CONFIRMED` / `MANUALLY_LINKED` / `EDITED`)

따라서 **`ShipmentMatch.transmissionStatus`** 가 개별 전송 가능·성공·실패의 SSOT입니다.

---

## 2. OrderSyncOrder.transmissionStatus의 역할

| 역할 | 설명 |
|------|------|
| 주문 단위 요약 | 해당 주문에 연결된 전송 결과 동기화(향후) |
| 이미 발송 표시 | 매칭 시 `ALREADY_SHIPPED` 힌트 등과 연계 가능 |
| **비역할** | 개별 행 전송 eligibility의 **단독 기준이 아님** |

D-6b eligibility는 **match.transmissionStatus만** 봅니다.

---

## 3. 송장전송 DTO 필드와 출처

타입: `ShipmentTransmissionCandidate`

| 필드 | 출처 | 필수 |
|------|------|------|
| `provider` | match → order → batch | ✅ |
| `integrationAccountId` | match → order → batch | ✅ |
| `uploadBatchId` | batch.id | ✅ |
| `matchId` | match.id | ✅ |
| `orderSyncOrderId` | order.id | ✅ |
| `mallOrderNo` | order | ✅ |
| `excloadOrderNo` | order | ✅ (아래 참고) |
| `mallLineItemIds` | order.mallLineItemIds (배열만) | optional → `null` |

**excloadOrderNo가 필수인 이유**

- Prisma `OrderSyncOrder.excloadOrderNo` 는 `String` (non-null), `@@unique([userId, excloadOrderNo])`
- snapshot 생성(`buildOrderSyncSnapshots`)·persist(`reserveExcloadOrderNos`)에서 항상 `EXC-YYYYMMDD-######` 발급
- 몰 API 식별의 1차 키는 `mallOrderNo`(+ line items)이지만, 엑클로드 내부 추적·감사·재매칭을 위해 candidate에도 필수
- 빈 문자열은 `EXCLOAD_ORDER_NO_MISSING` 으로 차단
| `trackingNumber` | `finalTrackingNumber` \|\| uploadRow | ✅ |
| `courierCode` | `finalCarrierCode` \|\| uploadRow | code\|name 중 1+ |
| `courierName` | `finalCarrierName` \|\| uploadRow | code\|name 중 1+ |

**포함 금지:** credential, 수취인 이름/전화/주소, `normalizedPayloadJson` 원문.

---

## 4. eligibility 규칙

함수: `evaluateShipmentTransmissionEligibility`

1. batch `status === READY`
2. confirmation ∈ {CONFIRMED, MANUALLY_LINKED, EDITED} — export와 동일 (`isExportableShipmentMatchStatus` 재사용)
3. `orderSyncOrderId` + order 데이터 존재, userId scope 일치
4. provider / integrationAccountId 필수 + batch·match·order 일치
5. `mallOrderNo`, `excloadOrderNo`, tracking, courier(code\|name) 필수
6. transmissionStatus:
   - `NONE` / `READY` → 데이터 완전하면 eligible
   - `FAILED` → `retryFailed === true` 만
   - `SENT` / `SKIPPED` → 제외

결과는 `{ eligible, candidate|null, reasonCode|null, reasonMessage }`.

---

## 5. 상태 전이표

함수: `evaluateShipmentTransmissionTransition`  
대상: **ShipmentMatch.transmissionStatus** (`OrderSyncTransmissionStatus`)

| From \ To | NONE | READY | SENT | FAILED | SKIPPED |
|-----------|------|-------|------|--------|---------|
| NONE | ❌ | ✅ | ❌ | ❌ | ❌ |
| READY | ❌ | ❌ | ✅ | ✅ | ✅ `policySkip` |
| SENT | ❌ | ❌ | ❌ | ❌ | ❌ |
| FAILED | ❌ | ✅ `retryRequested` | ❌ | ❌ | ❌ |
| SKIPPED | ❌ | ❌ | ❌ | ❌ | ❌ |

동일 상태 전이(`SENT→SENT` 포함)도 거부합니다.

---

## 6. provider adapter 책임

인터페이스: `ShipmentTransmissionAdapter`

- 입력: `ShipmentTransmissionCandidate` (credential 없음)
- `buildPayload`: 공통 DTO → 몰 payload (택배사 **몰 전용 코드** 변환은 여기)
- `transmit?`: 실제 호출은 이후 Phase — D-6b는 타입만
- 결과: `ShipmentTransmissionAdapterResult`
- `responseSummary`: `ShipmentTransmissionResponseSummary` 만 허용  
  - **아님**: API 응답 원문 전체, Authorization/token/secret, 수취인 PII  
  - **허용**: `httpStatus`, `providerStatusCode`, `providerRequestId`, 비민감 `message`

---

## 7. 공통 택배사 정보 vs provider 전용 코드

| 계층 | 내용 |
|------|------|
| 공통 DTO | `courierCode` = 엑클로드 정규화(`CJ`, `HANJIN` …), `courierName` |
| adapter | 몰 API가 요구하는 코드/명칭으로 변환 |

공통 eligibility는 몰 전용 코드를 생성하지 않습니다.

---

## 8. SENT 재전송 금지 / FAILED 재시도

- **SENT:** eligibility·전이 모두 재전송 불가
- **FAILED:** `retryFailed` / `retryRequested` 명시 시에만 다시 READY·전송 후보

---

## 9. 현재 DB만으로 가능한 중복 방지의 한계

가능:

- match `transmissionStatus === SENT` 이면 재전송 거부
- 조건부 업데이트로 동시성 완화(향후 route)

한계:

- 시도별 request/response 감사 없음
- 부분 성공 배치 집계 enum 없음 (의도적 — D-6b 미추가)
- 멱등키·attemptNo 없음 → 네트워크 타임아웃 후 재시도 시 몰 측 중복 위험
- OrderSyncOrder와 Match 상태 불일치 가능 (동기화 미구현)

---

## 10. Attempt 로그 모델이 필요한 이유 (이후)

- 시도 이력·멱등키·providerRequestId
- 운영 감사·고객 문의 대응
- 타임아웃 후 안전한 재시도 판단

D-6b에서는 **migration 없음**. 기존 `transmissionErrorMessage`만 실패 메시지 후보.

---

## 11. 이번 단계에서 구현하지 않은 항목 (D-6b 시점)

- API route / UI
- Prisma schema·migration
- provider adapter 구현·외부 API
- OrderSyncOrder.transmissionStatus 동기화
- CarrierCodeMap 테이블
- 배치 부분성공 enum
- dry-run transmit 오케스트레이션

---

## 12. D-6c — mock executor / registry

### adapter registry 역할

- `ShipmentTransmissionAdapterRegistry`: provider → adapter 맵
- **전역 singleton 아님** — 테스트·호출측이 인스턴스 생성
- 중복 등록 시 `ADAPTER_ALREADY_REGISTERED` throw
- 미등록 조회는 `null` (executor가 `ADAPTER_NOT_REGISTERED`로 정규화)

### executor와 adapter 책임 분리

| 계층 | 책임 |
|------|------|
| eligibility (D-6b) | 전송 **대상** 여부 |
| state-machine (D-6b) | 허용 전이 |
| adapter | 몰 payload·전송 시도 (mock/실) |
| executor (D-6c) | adapter 선택·호출·예외 정규화·`nextStatus` 힌트 |

**executor는 READY에서만 adapter를 호출합니다.**

| 상태 | executor 동작 |
|------|----------------|
| `READY` | adapter 호출 → 성공 시 `SENT`, 실패 시 `FAILED` |
| `NONE` | adapter 미호출 (`TRANSMISSION_NOT_ALLOWED`). `NONE→READY`는 eligibility/준비 단계 책임 |
| `FAILED` | adapter 미호출. `FAILED→READY`는 명시적 retry 준비 단계 책임 |
| `SENT` / `SKIPPED` | adapter 미호출 |

executor는 `NONE`/`FAILED`를 내부에서 자동으로 `READY`로 바꾸지 않습니다.

### 배치 부분성공 집계

- DB enum 추가 없음
- `totalCount === successCount + failureCount + skippedCount`

| 집계 | 포함 |
|------|------|
| `successCount` | adapter 성공 + `nextStatus=SENT` |
| `failureCount` | adapter `success=false`, `ADAPTER_EXECUTION_ERROR`(throw), `ADAPTER_NOT_REGISTERED` |
| `skippedCount` | `DUPLICATE_MATCH_ID`, `TRANSMISSION_NOT_ALLOWED` (SENT/SKIPPED/NONE 등) |
| `retryableFailureCount` | failure 중 `retryable=true` 만 |

같은 결과는 failure와 skipped에 동시에 들어가지 않습니다.

### executor가 DB를 직접 변경하지 않는 이유

- 실행 계약과 persist를 분리해 단위 테스트·dry-run·감사 로그를 독립적으로 붙이기 위함
- 반환의 `previousStatus` / `nextStatus` 만 persist 계층이 적용

### mock adapter 사용 목적·보안

- 외부 API·credential 없이 성공/실패/재시도 흐름 검증
- 결정적 `providerRequestId`(`requestIdFactory`만) · `ShipmentTransmissionResponseSummary`
- candidate 전체·trackingNumber·mallOrderNo를 summary message에 복사하지 않음
- credential / token / Authorization / secret / PII / normalizedPayloadJson / 외부 응답 원문 금지

### adapter 예외 정규화

- `transmit` throw → `ADAPTER_EXECUTION_ERROR`, `nextStatus=FAILED`, `retryable=true`
- 배치에서는 한 건 예외가 다른 건 실행을 막지 않음

### duplicate matchId

- 배치 입력에서 **첫 번째만 실행**
- 이후 동일 `matchId` → `DUPLICATE_MATCH_ID`, `adapterCalled=false`
- 이유: 실수로 동일 행을 두 번 보내 몰 측 중복 전송하는 것을 방지

### D-6c 검증 범위

- registry / mock adapter / 단건·배치 executor
- READY→SENT|FAILED 힌트, SENT/SKIPPED/NONE 시 adapter 미호출

### 아직 미구현

- DB persist (`ShipmentMatch.transmissionStatus` 갱신)
- Attempt 로그 테이블
- API route / UI
- 실 쿠팡·스마트스토어 adapter

---

## 13. 코드 위치

| 파일 | 역할 |
|------|------|
| `transmission/types.ts` | DTO·reason·adapter·executor 결과 타입 |
| `transmission/eligibility.ts` | 대상 판정 |
| `transmission/state-machine.ts` | 상태 전이 |
| `transmission/adapter-registry.ts` | provider → adapter |
| `transmission/mock-adapter.ts` | 결정적 mock |
| `transmission/executor.ts` | 단건·배치 실행 |
| `transmission/__tests__/*` | 단위 테스트 |
