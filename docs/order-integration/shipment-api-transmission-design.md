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

## 11. 이번 단계에서 구현하지 않은 항목

- API route / UI
- Prisma schema·migration
- provider adapter 구현·외부 API
- OrderSyncOrder.transmissionStatus 동기화
- CarrierCodeMap 테이블
- 배치 부분성공 enum
- dry-run transmit 오케스트레이션

---

## 12. 코드 위치

| 파일 | 역할 |
|------|------|
| `transmission/types.ts` | DTO·reason·adapter 계약 |
| `transmission/eligibility.ts` | 대상 판정 |
| `transmission/state-machine.ts` | 상태 전이 |
| `transmission/__tests__/*` | 단위 테스트 |
