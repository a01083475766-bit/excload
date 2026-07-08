# 송장파일 업로드·매칭 설계

> **상태**: 설계 문서 (2026-07) — **구현 전**  
> **범위**: 주문조회 스냅샷 보존 → 택배 송장파일 업로드 → 주문·송장번호 매칭 → 전송 준비 데이터  
> **이번 단계 제외**: 쇼핑몰 API 송장전송, 배송조회, 주문상태 변경, 자동 전체 전송, Production migration 적용  
> **관련 문서**  
> - [order-sync-shipment-roadmap.md](./order-sync-shipment-roadmap.md) — 전체 1~4차 로드맵  
> - [../송장번호변환-설계.md](../송장번호변환-설계.md) — 기존 엑셀 주문+송장 1차 병합 UI  
> - [shopify-oauth-design.md](./shopify-oauth-design.md) / [shopify-test-runbook.md](./shopify-test-runbook.md)  
> - [remaining-malls-roadmap.md](./remaining-malls-roadmap.md)

---

## 1. 목적

엑클로드 주문연동의 **2차 핵심 기능**은 택배사 프로그램에서 받은 **송장파일**을 업로드한 뒤, **이전에 조회·다운로드한 주문 스냅샷**과 송장번호를 **안전하게 매칭**하는 것이다.

이번 설계의 산출물은 **전송 준비 데이터**까지이다. 쇼핑몰 API로 송장을 실제 전송하는 것은 **3차**이며, 배송조회는 **4차**다.

### 현재 전제

| 항목 | 상태 |
|------|------|
| 직접 API 주문조회 10곳 | 쿠팡·스마트스토어·11번가·카페24·롯데ON·SSG·CJ온스타일·샵바이·고도몰·메이크샵 — `fetch-orders` 구현 |
| Shopify | 11번째 후보 — 1차 MVP 완료, feature flag false, 실제 테스트 대기 |
| 승인대기/문의필요 몰 | 장기적으로 주문조회·송장전송·배송조회 대상이나 **승인 전 구현 금지** |
| `fetch-orders` | **주문 본문 DB 미저장** — JSON `orderStandardFile` + `previewRows`만 반환 |
| `OrderIntegrationAccount` | 연동 credential·`lastSyncedAt` 등 **메타만** Prisma 저장 |

---

## 2. 현재 제외 범위

| 제외 | 사유 |
|------|------|
| 쇼핑몰 송장전송 API | 주문·배송 상태 변경 — 3차 |
| Shopify fulfillment / `write_fulfillments` | scope·설계 별도 |
| 배송조회 API | 송장번호 확보 후 4차 |
| 자동 전체 송장전송 | 사용자 확인 없는 전송 금지 |
| Production DB migration **적용** | 본 문서는 **초안만** 제안 |
| Lightsail / 프록시 변경 | 해당 없음 |
| 실제 외부 API 호출 | 설계·순수 함수·테스트 mock만 |

---

## 3. 전체 흐름

```
[1차 완료/진행] 쇼핑몰 주문조회
  → 미리보기 (주문 1건 = 1행)
  → 택배사 양식 다운로드
  → 사용자: 택배사 프로그램 업로드 → 송장 출력

[2차 — 본 설계] 택배사 송장파일 업로드
  → 파싱·정규화
  → 기존 주문 스냅샷과 매칭
  → 전송 전 검증·사용자 확인
  → 쇼핑몰 송장 업로드용 엑셀 다운로드
  → (전송 준비 데이터 저장)

[3차 — 미구현] API 연동 몰: 사용자 선택 송장전송
[4차 — 미구현] 배송조회
```

**기존 엑셀 흐름과의 관계**: [송장번호변환-설계.md](../송장번호변환-설계.md)의 「주문 엑셀 + 택배 송장 엑셀」은 **동일 세션** 1차 병합이다. 주문연동 후에는 **주문 소스가 API 스냅샷**으로 바뀌므로, 송장파일만 나중에 업로드해도 매칭할 수 있도록 **스냅샷 영속화**가 필요하다.

---

## 4. 기존 코드 재사용 지점

| 기존 자산 | 경로 | 재사용 방식 |
|-----------|------|-------------|
| `OrderStandardFile` | `app/pipeline/order/order-pipeline.ts` | 주문 스냅샷·다운로드 행의 표준 형식 |
| 76 기준헤더 | `app/pipeline/base/base-headers.ts` | `운송장번호`, `택배사`, `택배사코드` 등 |
| 별칭 사전 | `app/pipeline/base/alias-dictionary.ts`, `HeaderAlias` | 송장파일 헤더 → 표준 필드 인식 |
| 1차 병합 로직 | `app/pipeline/invoice/merge-order-invoice-standard.ts` | 조인·개인정보 폴백·1:N 참고 (점수 상수 분리) |
| Stage3 미리보기 | `app/pipeline/merge/merge-pipeline.ts` | 몰별 송장 업로드 엑셀 생성 패턴 |
| 송장변환 UI | `app/invoice-file-convert/page.tsx` | 이중 업로드·미리보기 UX 참고 |
| fetch-orders 응답 | `app/api/order/integration/*/fetch-orders/route.ts` | `orderStandardFile` 브릿지 (현재 UI는 `previewRows`만 사용) |
| 관리자 인증 | `app/lib/order-integration/admin-api-auth.ts` | route 소유권 검증 패턴 |
| 몰 스펙 | `app/lib/order-integration/mall-integration-specs.ts` | provider·`invoice_upload` action 확장 |

### 핵심 갭

- **주문 스냅샷 DB 없음** → `OrderSyncBatch` / `OrderSyncOrder` 신규 필요  
- **내부 관리번호 없음** → `excloadOrderNo` 설계·택배 양식 출력 시 포함 권장  
- **송장 업로드 이력 없음** → `ShipmentUploadBatch` / `ShipmentMatch` 신규 필요  

---

## 5. 데이터 모델 초안 (Prisma — 적용 전 제안)

> **주의**: 아래는 migration **초안**이다. 승인·스키마 리뷰 후 적용한다.

### 5.1 ER 개요

```
User
  ├── OrderSyncBatch (1회 주문조회)
  │     └── OrderSyncOrder (주문 스냅샷 1건)
  ├── ShipmentTemplateDownloadBatch (1회 택배 양식 다운로드)
  │     └── ShipmentTemplateDownloadRow
  ├── ShipmentUploadBatch (1회 송장파일 업로드)
  │     ├── ShipmentUploadRow (원본 행)
  │     └── ShipmentMatch (매칭 결과)
  └── CarrierCodeMap (몰별 택배사 코드 — 시드/관리)
```

### 5.2 `OrderSyncBatch`

주문조회 1회 단위.

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | String @id | cuid |
| `userId` | String | 소유자 |
| `provider` | OrderIntegrationProvider | 쇼핑몰 |
| `accountId` | String? | `OrderIntegrationAccount.id` |
| `sourceType` | enum | `api` / `excel` / `manual` |
| `fetchedAt` | DateTime | 조회 시각 |
| `orderCount` | Int | 스냅샷 주문 수 |
| `status` | enum | `active` / `archived` / `error` |
| `createdAt` | DateTime | |

### 5.3 `OrderSyncOrder`

주문 1건 스냅샷. **정책: 주문 1건 = 1행**, `productSummary`에 line item 합침.

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | String @id | |
| `batchId` | String | FK → OrderSyncBatch |
| `userId` | String | denormalized 소유권 검증 |
| `provider` | OrderIntegrationProvider | |
| `accountId` | String? | |
| `excloadOrderNo` | String | **내부 관리번호** (unique per user 권장) |
| `mallOrderNo` | String | 쇼핑몰 표시 주문번호 |
| `mallOrderId` | String? | API 원본 주문 ID |
| `mallLineItemId` | String? | 2차 상품별 송장용 — 1차 nullable |
| `receiverName` | String? | |
| `receiverPhone` | String? | 원본 |
| `receiverPhoneNormalized` | String? | 숫자만 |
| `receiverAddress` | String? | |
| `receiverAddressNormalized` | String? | |
| `productSummary` | String? | |
| `quantity` | Int? | 합계 수량 |
| `deliveryMemo` | String? | |
| `orderedAt` | DateTime? | |
| `orderStatus` | String? | 조회 시점 스냅샷 |
| `rawPayloadJson` | Json? | API 원본 (PII 최소화 검토) |
| `normalizedPayloadJson` | Json? | 송장전송용 식별자만 추출 |
| `trackingNumber` | String? | 이미 등록된 송장 (있으면) |
| `transmissionStatus` | enum | `none` / `ready` / `sent` / `failed` / `skipped` |
| `createdAt` | DateTime | |

**인덱스 제안**: `(userId, excloadOrderNo)` unique, `(batchId)`, `(userId, mallOrderNo, provider)`

### 5.4 `ShipmentTemplateDownloadBatch` / `ShipmentTemplateDownloadRow`

택배사 양식 **다운로드 1회**와보낸 행 추적.

| DownloadBatch | 설명 |
|---------------|------|
| `orderSyncBatchId` | 어떤 조회 결과에서 내렸는지 |
| `carrierCode`, `carrierName` | 택배사 |
| `templateType` | 양식 식별자 |
| `rowCount` | |

| DownloadRow | 설명 |
|-------------|------|
| `orderSyncOrderId` | 스냅샷 FK |
| `excloadOrderNo` | 양식에 포함 권장 |
| `exportedRowIndex` | 엑셀 행 번호 |
| `mallOrderNo`, 수취인, 주소, `productSummary` | 당시 출력값 스냅샷 |

→ 송장파일에 내부관리번호가 없어도 「어떤 다운로드 batch에서 나갔는지」로 보조 매칭 가능.

### 5.5 `ShipmentUploadBatch` / `ShipmentUploadRow`

| UploadBatch | 설명 |
|-------------|------|
| `provider`, `accountId` | 매칭 대상 몰 (선택) |
| `originalFileName`, `fileHash` | 중복 업로드 감지 |
| `rowCount`, `matchedCount`, `warningCount`, `failedCount`, `duplicateCount` | 집계 |
| `status` | `parsed` / `matched` / `confirmed` / `exported` |

| UploadRow | 설명 |
|-----------|------|
| `originalRowIndex` | 원본 행 |
| `rawRowJson` | 파싱 전 (보존 기간 정책 별도) |
| `trackingNumber`, `trackingNumberNormalized` | **문자열 유지**, 앞자리 0 보존 |
| `detectedCarrierName`, `standardCarrierCode` | |
| `receiverName`, `receiverPhone`, `receiverAddress` | |
| `mallOrderNo`, `excloadOrderNo` | 파싱 결과 |
| `productText` | |
| `shippedAt` | |
| `parseStatus`, `parseErrorMessage` | |

### 5.6 `ShipmentMatch`

| 필드 | 설명 |
|------|------|
| `uploadRowId`, `orderSyncOrderId` | 1 upload row : 0~1 확정 주문 (후보는 JSON) |
| `matchStatus` | §8 상태 enum |
| `matchScore` | Int |
| `matchReason` | String |
| `mismatchFieldsJson` | 불일치 필드 목록 |
| `candidateOrdersJson` | MULTIPLE_CANDIDATES 시 후보 |
| `finalTrackingNumber`, `finalCarrierCode` | 사용자 확정값 |
| `isUserConfirmed`, `confirmedAt`, `confirmedByUserId` | |
| `transmissionStatus` | `NOT_READY` / `READY` / `SENT` / `FAILED` / `SKIPPED` — **이번 SENT 미구현** |

### 5.7 `CarrierCodeMap`

| 필드 | 설명 |
|------|------|
| `standardCarrierCode` | 엑클로드 표준 (예: `CJ`, `LOTTE`) |
| `standardCarrierName` | CJ대한통운, 롯데택배, … |
| `provider` | OrderIntegrationProvider |
| `providerCarrierCode` | 몰 API 값 |
| `providerCarrierName` | 표시명 |
| `isActive` | |

**Shopify 3차**: `providerCarrierCode` → tracking company **문자열** 매핑만 준비. 실제 API 호출 없음.

---

## 6. 내부 관리번호 설계

### 6.1 형식

```
EXC-{YYYYMMDD}-{seq6}
예: EXC-20260709-000001
```

| 규칙 | 내용 |
|------|------|
| 발급 시점 | 주문 스냅샷 생성 시 (`OrderSyncOrder` insert) |
| 범위 | `userId` + 일자별 sequence (또는 global per user) |
| 노출 | 택배사 양식 다운로드 시 **전용 열** 포함 권장 (`엑클로드관리번호`) |

### 6.2 용도

- 조회 batch ↔ 택배 다운로드 ↔ 송장 업로드 **3점 추적**
- 쇼핑몰 주문번호만으로 부족한 경우 **1순위 매칭 키**
- 중복 송장전송 방지
- 동일 주문 재다운로드 구분

### 6.3 주의

- 택배사 프로그램이 내부관리번호 열을 **유지하지 않을 수 있음** → 보조 키(주문번호+전화 등) 필수
- **행 순서만**으로 자동 확정 **금지** (확인필요로만)

---

## 7. 송장파일 파싱 설계

### 7.1 지원 형식

- `xlsx`, `xls`, `csv`
- Stage2 파이프라인 재사용 검토: 업로드 → `OrderStandardFile` 변환 후 송장 필드 추출

### 7.2 표준 필드 (파싱 출력)

| 필드 | 설명 |
|------|------|
| `trackingNumber` | 원본 문자열 |
| `trackingNumberNormalized` | 공백·하이픈 제거 (숫자 변환 **금지**) |
| `carrierName` / `standardCarrierCode` | |
| `receiverName`, `receiverPhone`, `receiverAddress` | |
| `mallOrderNo`, `excloadOrderNo` | |
| `productText`, `shippedAt` | |
| `originalRowIndex` | |

### 7.3 헤더 별칭

**1차**: `alias-dictionary.ts` + Stage2 헤더 매핑 재사용.

추가 별칭 (송장파일 전용 — `ShipmentHeaderAlias` 또는 사전 확장):

| 표준 | 별칭 예 |
|------|---------|
| 운송장번호 | 송장번호, 운송장, 택배번호, Invoice No, Tracking Number, … (기존 사전에 다수 존재) |
| 수취인 | 수취인, 받는분, 받는사람, 수령인 |
| 전화 | 받는분전화번호, 수취인전화, 연락처, … |
| 주소 | 주소, 받는분주소, 배송지주소 |
| 주문번호 | 주문번호, 쇼핑몰주문번호, 주문ID |
| 내부관리번호 | 엑클로드관리번호, 내부관리번호, EXC관리번호, 고객관리번호 |

### 7.4 정규화 규칙

**송장번호**

- 항상 **string** — `Number()` 변환 금지, 앞자리 `0` 보존
- `normalizedTrackingNumber`: 공백·하이픈 제거본 별도 보관
- 길이 이상 짧/김 → `parseStatus=warning`
- 동일 upload batch 내 중복 → `DUPLICATE_TRACKING_NUMBER`
- 기존 `OrderSyncOrder.trackingNumber`와 중복 → `ALREADY_SHIPPED` 후보

**전화번호**

- `normalizedPhone`: 숫자만 (`merge-order-invoice-standard.ts`와 동일 계열)
- 없으면 이름·주소 보조만 — **자동 확정 금지**

**주소**

- 공백 정리, 일부 특수문자 제거 → `normalizedAddress`
- 포함/유사도 매칭용 — 단독 자동 확정 금지

---

## 8. 매칭 알고리즘

### 8.1 후보 주문 범위

- **반드시** `userId` 일치
- `provider` / `accountId` — UI에서 선택한 몰·계정으로 **필터** (타 사용자·타 몰 주문 제외)
- 기본: 최근 `OrderSyncBatch` 또는 사용자가 선택한 batch
- `orderStatus` 취소/반품 → `CANCELLED_OR_INVALID_ORDER`

### 8.2 우선순위 (매칭 키)

| 순위 | 조건 | 자동 확정 |
|------|------|-----------|
| 1 | `excloadOrderNo` exact | ✅ MATCHED_CONFIDENT |
| 2 | `mallOrderNo` + `receiverName` + `receiverPhone` | ✅ (충돌 없을 때) |
| 3 | `mallOrderNo` + `receiverPhone` | ⚠️ MATCHED_WARNING 가능 |
| 4 | `receiverName` + `receiverPhone` + `address` 일부 | ⚠️ |
| 5 | `receiverName` + `address` + `productSummary` 유사 | ⚠️ |
| 6 | `exportedRowIndex` / 행 순서 | ❌ 확인필요만 |

### 8.3 점수표 (초안 — 상수 분리)

```typescript
// app/lib/order-integration/shipments/match-constants.ts (구현 시)
export const MATCH_SCORE = {
  EXCLOAD_ORDER_NO: 100,
  MALL_ORDER_NO: 80,
  PHONE: 60,
  RECEIVER_NAME: 40,
  ADDRESS_STRONG: 40,
  PRODUCT_SUMMARY: 20,
  DOWNLOAD_BATCH_LINK: 30,
} as const;

export const MATCH_PENALTY = {
  ALREADY_SHIPPED: -100,
  CANCELLED: -100,
} as const;

export const MATCH_THRESHOLD = {
  CONFIDENT: 100,
  WARNING: 70,
} as const;
```

### 8.4 판정

| 상태 | 조건 |
|------|------|
| `MATCHED_CONFIDENT` | score ≥ 100, 핵심 필드 충돌 없음, 후보 1개 |
| `MATCHED_WARNING` | score ≥ 70, 일부 불일치 또는 관리번호 없음 |
| `MULTIPLE_CANDIDATES` | 동점·유사 후보 2개 이상 |
| `NOT_MATCHED` | score < 70 |
| `DUPLICATE_TRACKING_NUMBER` | 동일 파일 내 송장번호 중복 |
| `ALREADY_SHIPPED` | 스냅샷에 송장 이미 존재 |
| `CANCELLED_OR_INVALID_ORDER` | 취소·전송 불가 상태 |

**행 순서만 일치** → 최대 `MATCHED_WARNING` 또는 별도 `ROW_ORDER_HINT` — **자동 CONFIDENT 금지**.

### 8.5 기존 병합 로직과의 관계

`merge-order-invoice-standard.ts`:

- 조인: `주문번호` → `상품주문번호` 폴백
- 개인정보 폴백: score ≥ 80 (`PERSONAL_MATCH_MIN_SCORE`)
- **동시 세션** 주문+송장 엑셀용

신규 매칭:

- **비동기** — 조회 후 시간 경과, API 스냅샷 DB 기준
- `excloadOrderNo` 1순위 추가
- 상태 머신·사용자 확인·전송 준비 필드 추가

---

## 9. 매칭 상태 정의

| `matchStatus` | UI 탭 | 전송 준비 |
|---------------|-------|-----------|
| `MATCHED_CONFIDENT` | 자동 매칭 | 검토 후 READY 가능 |
| `MATCHED_WARNING` | 확인 필요 | 사용자 확인 후 |
| `MULTIPLE_CANDIDATES` | 확인 필요 | 수동 선택 |
| `NOT_MATCHED` | 매칭 실패 | 수동 연결 또는 제외 |
| `DUPLICATE_TRACKING_NUMBER` | 중복/오류 | 제외 |
| `ALREADY_SHIPPED` | 전송 제외 | 제외 |
| `CANCELLED_OR_INVALID_ORDER` | 전송 제외 | 제외 |

`transmissionStatus` (ShipmentMatch):

- 이번: `NOT_READY` → 사용자 확인 후 `READY`까지만
- 3차: `SENT` / `FAILED` / `SKIPPED`

---

## 10. 사용자 검증 UI 흐름 (문서화 — 구현은 다음 승인 후)

### 10.1 송장파일 업로드

- 택배사 선택 (또는 자동 인식)
- 파일 업로드 (xlsx/xls/csv)
- 안내: 「택배사에서 받은 송장번호 파일」「아직 쇼핑몰에 전송되지 않음」

### 10.2 파싱 결과

- 총 행 수, 송장번호/주문번호/내부관리번호 인식 수, 오류·중복 행 수

### 10.3 매칭 결과 탭

| 탭 | 내용 |
|----|------|
| 자동 매칭 | MATCHED_CONFIDENT |
| 확인 필요 | WARNING, MULTIPLE_CANDIDATES |
| 매칭 실패 | NOT_MATCHED |
| 중복/오류 | DUPLICATE, parse error |
| 전송 제외 | ALREADY_SHIPPED, CANCELLED |

**컬럼**: 상태, 엑클로드 관리번호, 쇼핑몰, 주문번호, 수취인, 전화, 주소 일부, 상품요약, 택배사, 송장번호, 매칭 사유, 사용자 확인 여부

### 10.4 사용자 동작

- 이 매칭 사용 / 다른 주문으로 연결 / 제외
- 송장번호·택배사 수정
- 안전한 자동매칭만 일괄 선택

### 10.5 다음 단계 버튼 (이번 범위)

| 허용 | 금지 |
|------|------|
| 쇼핑몰 송장 업로드용 엑셀 다운로드 | API 송장전송 |
| 매칭 결과 CSV 다운로드 | |
| 전송 준비 데이터 저장 (`transmissionStatus=READY`) | |

---

## 11. 쇼핑몰 송장 업로드용 엑셀 다운로드 구조

### 11.1 중간 데이터

매칭 확정(`isUserConfirmed=true`)된 `ShipmentMatch` + `OrderSyncOrder` 조인:

| 출력 필드 (몰별 가변) | 소스 |
|----------------------|------|
| 주문번호 | `mallOrderNo` |
| 송장번호 | `finalTrackingNumber` |
| 택배사 / 택배사코드 | `CarrierCodeMap` 변환 |
| 수취인 등 | 스냅샷 (몰 양식 필요 시) |

### 11.2 구현 패턴

- 기존 `runMergePipeline` + 사용자 업로드 **쇼핑몰 양식 템플릿** (invoice-file-convert와 동일)
- provider별 컬럼 매핑 테이블 — **초안만** (쿠팡·스마트스토어·카페24 우선)

### 11.3 API 미연동 몰

- 엑셀 다운로드 **만** 제공 (로드맵 §4와 동일)

---

## 12. API 송장전송 확장 연결 지점 (3차)

| 연결 지점 | 내용 |
|-----------|------|
| `ShipmentMatch.transmissionStatus` | `READY` → API 호출 → `SENT`/`FAILED` |
| `OrderSyncOrder.normalizedPayloadJson` | 몰별 fulfillment/order item ID |
| `CarrierCodeMap` | 택배사 코드 → provider API 값 |
| `OrderIntegrationAccount` | credential·scope (`write_fulfillments` 등 **별도 승인**) |
| Route 후보 | `POST /api/order/integration/{provider}/shipments/send` (미구현) |

**Shopify**: GraphQL `fulfillmentCreate` / tracking — `write_fulfillments` scope, tracking company 문자열. **1·2차 제외.**

---

## 13. API Route 설계 제안

기존 `app/api/order/integration/{mall}/` 패턴과 별도 **공통 shipments** 네임스페이스 권장.

| Method | Path | 역할 |
|--------|------|------|
| POST | `/api/order/integration/shipments/upload` | 파일 업로드·파싱·`ShipmentUploadBatch` 생성 |
| POST | `/api/order/integration/shipments/match` | batchId 기준 매칭 실행 |
| GET | `/api/order/integration/shipments/batches/:id` | 업로드 batch 상세 ( **userId 소유권 검증** ) |
| POST | `/api/order/integration/shipments/matches/:id/confirm` | 사용자 매칭 확정 |
| POST | `/api/order/integration/shipments/matches/:id/skip` | 제외 |
| GET | `/api/order/integration/shipments/export` | 몰별 송장 업로드 엑셀 (query: batchId, provider) |

**주문 스냅샷 저장** (fetch-orders 연동 — 별도 승인):

| Method | Path | 역할 |
|--------|------|------|
| POST | `/api/order/integration/orders/snapshots` | fetch-orders 결과 persist → `OrderSyncBatch` |
| GET | `/api/order/integration/orders/snapshots/:batchId` | 스냅샷 목록 |

모든 route: `requireOrderIntegrationAdmin` 또는 일반 사용자 auth — **제품 정책 확정 필요**. `batchId`만으로 조회 금지, **항상 `userId` 검증**.

---

## 14. 모듈 설계 제안

```
app/lib/order-integration/shipments/
  types.ts                    # MatchStatus, TransmissionStatus, 파싱/매칭 DTO
  match-constants.ts          # 점수·임계값 상수
  excload-order-no.ts         # EXC-YYYYMMDD-###### 발급
  normalize-shipment-row.ts   # 송장번호·전화·주소 정규화
  parse-shipment-file.ts      # xlsx/csv → ShipmentUploadRow DTO
  match-shipment-row.ts       # UploadRow × OrderSyncOrder 매칭
  carrier-code-map.ts         # 표준 ↔ provider 코드 (DB/시드)
  export-mall-shipment-excel.ts # 몰별 엑셀 생성 (Stage3 래퍼)

app/lib/order-integration/orders/
  persist-order-sync-batch.ts # OrderStandardFile → OrderSyncOrder (제안)

app/api/order/integration/shipments/
  upload/route.ts
  match/route.ts
  batches/[batchId]/route.ts
  matches/[id]/confirm/route.ts
  matches/[id]/skip/route.ts
  export/route.ts
```

---

## 15. 테스트 계획

| # | 케이스 |
|---|--------|
| 1 | `excloadOrderNo` 있으면 MATCHED_CONFIDENT |
| 2 | 관리번호 없어도 주문번호+전화 일치 시 매칭 |
| 3 | 주문번호 일치·수취인/전화 불일치 → MATCHED_WARNING |
| 4 | 동일 송장번호 2행 → DUPLICATE_TRACKING_NUMBER |
| 5 | 취소 주문 → CANCELLED_OR_INVALID_ORDER |
| 6 | 이미 송장 등록 → ALREADY_SHIPPED |
| 7 | 전화번호 앞자리 0 보존 |
| 8 | 송장번호 숫자 변환 안 함 (`"012345"` 유지) |
| 9 | 행 순서만 같음 → 자동 CONFIDENT 안 됨 |
| 10 | 후보 다수 → MULTIPLE_CANDIDATES |
| 11 | CarrierCodeMap provider별 변환 |
| 12 | Shopify tracking company 문자열 매핑만 (API 호출 mock 없음) |
| 13 | 타 userId 주문과 매칭 안 됨 |
| 14 | 로그에 전화/주소/송장 전체 미출력 |

**테스트 위치**: `app/lib/order-integration/shipments/*.test.ts` — **순수 함수 우선**, route는 mock DB.

---

## 16. 보안·운영 주의사항

| 항목 | 방침 |
|------|------|
| 업로드 파일 | 필요 최소 기간 보관, `rawRowJson` TTL 검토 |
| PII | 로그·에러 메시지에 전화·주소·송장 전체 출력 금지 |
| Secret | access token / API key 로그 금지 |
| 소유권 | `userId` + `batchId` 복합 검증 |
| 외부 API | 이번 단계 호출 금지 |
| 송장전송 | API 호출 금지 |
| 권한 | 관리자/일반 사용자 정책 확정 후 route 적용 |

---

## 17. 구현 단계별 체크리스트

### Phase A — 설계·순수 함수 (DB 없이)

- [ ] `types.ts`, `match-constants.ts`, `normalize-shipment-row.ts`
- [ ] `match-shipment-row.ts` + 단위 테스트 14건
- [ ] `parse-shipment-file.ts` (fixture xlsx)
- [ ] `carrier-code-map.ts` 시드 초안 (CSV/TS)

### Phase B — DB migration 초안·리뷰

- [ ] Prisma 모델 초안 PR (적용은 승인 후)
- [ ] `excload-order-no` 발급 전략 (race condition)
- [ ] 인덱스·unique·보존 정책

### Phase C — 스냅샷 영속화

- [ ] fetch-orders 후 `OrderSyncBatch` 저장 (opt-in API)
- [ ] 택배 양식 다운로드 시 `excloadOrderNo` 열 출력
- [ ] `ShipmentTemplateDownloadBatch` 연결

### Phase D — 송장 업로드·매칭 API

- [ ] `shipments/upload`, `shipments/match` route
- [ ] 매칭 결과 UI (invoice-file-convert 패턴 참고)
- [ ] confirm / skip

### Phase E — 몰별 송장 엑셀 export

- [ ] `shipments/export` + provider별 컬럼 맵 (10곳 순차)
- [ ] 기존 `merge-pipeline` 연동 검토

### Phase F — 3차 (별도 승인)

- [ ] API 송장전송, `transmissionStatus=SENT`
- [ ] Shopify `write_fulfillments`

---

## 18. 이번에 구현하지 않은 것 (재확인)

- 쇼핑몰 송장전송 API (전 채널)
- Shopify fulfillment API
- 배송조회 API
- 주문상태 쇼핑몰 변경
- 자동 전체 전송
- Production migration 적용
- Lightsail 변경
- 실제 외부 API·curl

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07 | 초안 — 주문연동 2차 송장파일 업로드·매칭 설계 |
