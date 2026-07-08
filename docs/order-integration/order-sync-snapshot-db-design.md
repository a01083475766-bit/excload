# 주문 스냅샷 DB 설계 (Phase C-0)

> **상태**: 조사·설계 초안 + Phase C-1a 구현 반영 (2026-07) — **Prisma/migration 미적용**  
> **범위**: `fetch-orders` 결과를 DB 스냅샷으로 저장하기 위한 사전 점검 및 **스냅샷 1행 변환 순수 함수**  
> **이번 단계 제외**: schema 수정, migration, fetch-orders route 변경, API/UI 구현, DB persist  
> **관련 문서**  
> - [shipment-upload-matching-design.md](./shipment-upload-matching-design.md) — 송장 업로드·매칭 전체 설계  
> - [order-sync-shipment-roadmap.md](./order-sync-shipment-roadmap.md) — 1~4차 로드맵  
> - Phase A/B 구현: `app/lib/order-integration/shipments/` (커밋 `500516f`)  
> - Phase C-1a 구현: `app/lib/order-integration/snapshots/` (미커밋)

---

## 1. 현재 구조 확인 결과

### 1.1 Prisma — 주문연동 관련 모델

현재 Prisma에는 **주문 본문을 저장하는 모델이 없다**. 주문연동 관련 모델은 `OrderIntegrationAccount` 단독이다.

| 모델 | 역할 |
|------|------|
| `User` | `orderIntegrationAccounts` 1:N 관계 |
| `OrderIntegrationAccount` | 쇼핑몰별 credential·연동 메타 |
| `OrderIntegrationProvider` (enum) | 11개 provider |
| `OrderIntegrationAccountStatus` (enum) | `ACTIVE` / `INACTIVE` / `ERROR` |

**`OrderIntegrationAccount` 주요 필드**

| 필드 | 용도 |
|------|------|
| `id` | cuid — 스냅샷 `accountId` FK 후보 |
| `userId` | 소유자 — **모든 스냅샷·매칭의 1차 격리 키** |
| `provider` | `OrderIntegrationProvider` enum (문자열 enum, Prisma client 타입) |
| `accountName` | 사용자 표시명 |
| `vendorId` | 쿠팡 업체코드 등 |
| `sellerId` | 11번가 판매자 ID 등 |
| `accessKeyCiphertext` / `secretKeyCiphertext` / `apiKeyCiphertext` + iv/authTag | AES-256-GCM 암호화 (`encryption.ts`) |
| `encryptionKeyVersion` | 키 버전 (기본 1) |
| `expiresAt` | 토큰/API 키 만료 (OAuth·스마트스토어 등) |
| `status` | 연동 활성 상태 |
| `lastTestedAt` / `lastSyncedAt` / `lastErrorMessage` | 연동 테스트·**fetch 성공 시각** 메타만 갱신 |

**제약**

- `@@unique([userId, provider, vendorId])` — 동일 user·provider·vendorId 조합 1계정
- `@@index([userId, provider])`

**토큰 저장 방식**

- 평문 저장 없음 — `encryptIntegrationSecret` / `decryptIntegrationSecret` (`app/lib/order-integration/encryption.ts`)
- 환경변수 `EXCLOAD_INTEGRATION_ENCRYPTION_KEY` (base64 32바이트) 필수
- Shopify는 `shopify-account.ts`에서 access token 별도 암호화 필드 사용 (동일 계열)

**갭**

- `OrderSyncBatch` / `OrderSyncOrder` **없음**
- `ShipmentUploadBatch` / `ShipmentMatch` **없음**
- `excloadOrderNo` 발급·시퀀스 테이블 **없음**

### 1.2 fetch-orders — 공통 패턴

11개 route (`app/api/order/integration/{provider}/fetch-orders/route.ts`) 공통:

| 항목 | 내용 |
|------|------|
| 인증 | `requireOrderIntegrationAdmin()` — 관리자/테스트 계정 정책 |
| 계정 조회 | `get{Provider}AccountForUser(userId)` |
| API 호출 | provider client → raw orders |
| 변환 | `map*OrdersToOrderStandardFile` + `map*OrdersToPreviewRows` |
| DB 저장 | **주문 본문 없음** — 성공 시 `mark*AccountSyncResult`로 `lastSyncedAt`만 갱신 |
| 응답 | JSON in-memory 반환 (클라이언트/UI가 소비) |

**공통 응답 필드 (성공 시)**

```typescript
{
  success: true,
  message: string,
  count: number,              // previewRows.length
  previewHeaders?: readonly string[],  // 대부분 포함 (쿠팡은 미포함)
  previewRows: PreviewRow[],
  orderStandardFile: OrderStandardFile,
  debug?: { ... }             // provider별 상이
}
```

`OrderStandardFile` 구조 (`app/pipeline/order/order-pipeline.ts`):

```typescript
{
  baseHeaders: readonly string[],  // BASE_HEADERS 76개
  rows: Record<string, string>[],
  unknownHeaders: string[]
}
```

### 1.3 previewRows vs orderStandardFile

| 구분 | previewRows | orderStandardFile |
|------|-------------|-------------------|
| 용도 | UI 미리보기 (고정 열) | Stage2 파이프라인·택배 양식 다운로드 브릿지 |
| 열 수 | 10~12개 (몰별 `*_PREVIEW_HEADERS`) | 76 기준헤더 전체 |
| 저장 가치 | 표시용 — **DB 1차 소스로는 부족** | **스냅샷 1차 소스 권장** |
| 원본 ID | preview에 없는 경우多 | `상품주문번호`, `묶음배송번호`, `옵션ID` 등 포함 |

**스냅샷 persist 시 권장 브릿지**: `orderStandardFile.rows[]` → `OrderSyncOrder` 매핑 함수 (신규 `persist-order-sync-batch.ts` 등).

### 1.4 행 단위 정책 — **확정 (Phase C-1a)**

| 원칙 | 내용 |
|------|------|
| **OrderSyncOrder 1건** | 상품 라인 1개가 **아님** — **송장 매칭·택배 양식 1행** 단위 |
| 정의 | 택배사 양식 다운로드 1행 = 송장번호가 붙을 수 있는 **배송/수취인 기준 1건** |
| 상품 다건 | `productSummary` 문자열로 합침 (`상품A x1 / 상품B x2`) |
| line item 다행 | fetch-orders mapper가 다행을 반환해도 **DB 저장 전 merge** — `groupOrderRowsForShipment` |
| 행 index | 그룹핑 키에 **사용 금지** |

**예시** — 주문번호 `1001`, 반팔티·바지·모자 각 1개, 동일 수취인/전화/주소:

```
mallOrderNo: 1001
productSummary: 반팔티 x1 / 바지 x1 / 모자 x1
quantity: 3
```

**현재 fetch-orders vs persist 목표**

| Provider | fetch-orders 행 단위 | persist 시 |
|----------|---------------------|------------|
| Shopify | 1 order = 1 row | 그대로 1 snapshot |
| Coupang / Smartstore / 기타 | line·productOrder 다행 | **merge 후 1 snapshot** (동일 배송 키) |

**구현 위치**: `app/lib/order-integration/snapshots/build-order-sync-snapshots.ts`

### 1.4.1 부분배송·상품별 송장 (향후)

- 1차는 배송 단위 1 snapshot
- line item 식별자는 **`mallLineItemIds` 배열** + `normalizedPayloadJson.mallLineItemIds`에 보존
- Coupang `묶음배송번호`는 `bundle:{id}` 형태로 `mallLineItemIds`에 포함 가능
- 2차 이후 상품별 송장 API 전송 시 `normalizedPayloadJson` 확장

### 1.5 Phase A/B shipments 모듈과의 관계

`app/lib/order-integration/shipments/types.ts`의 `OrderSyncOrderSnapshot`은 **DB 도입 전 in-memory DTO**로 이미 정의됨.

| DTO 필드 | DB `OrderSyncOrder` 대응 | fetch-orders 공급 여부 |
|----------|--------------------------|------------------------|
| `id` | `OrderSyncOrder.id` | persist 시 생성 |
| `userId` | denormalized | auth에서 |
| `provider` | enum | route/provider |
| `accountId` | FK | `OrderIntegrationAccount.id` |
| `batchId` | FK | persist 시 |
| `excloadOrderNo` | unique per user | **없음 — persist 시 발급** |
| `mallOrderNo` | `주문번호` | ✅ orderStandardFile |
| `mallOrderId` | API 원본 ID | ⚠️ mapper/raw에 분산 |
| `receiverName/Phone/Address` | 정규화 필드 | ✅ 기준헤더 |
| `productSummary` | `상품명` 합침 | ⚠️ 다행이면 persist 전 merge 필요 |
| `quantity` | 합계 | ✅ `수량` |
| `orderStatus` | 스냅샷 시점 | ✅ `주문상태` |
| `existingTrackingNumber` | `운송장번호` | 보통 빈 값 (조회 시점) |
| `exportedRowIndex` | 다운로드 batch 연동 | Phase D 이후 |

`matchShipmentRow` / `matchShipmentRows`는 `ShipmentMatchScope { userId, provider?, accountId? }`로 후보를 제한한다. DB 스냅샷에도 **동일 3필드가 반드시 저장**되어야 한다.

### 1.6 주문연동 미리보기 meta vs 택배사 다운로드 exportRow (Phase C-1a 확장)

**원칙: 화면용 meta와 택배사 다운로드용 exportRow를 분리한다.**

| 구분 | 용도 | 포함 필드 예 |
|------|------|-------------|
| `OrderPreviewDisplayMeta` | UI 미리보기·내부 추적 | `provider`, `providerLabel`, `accountId`, `accountLabel`, `mallOrderNo`, `excloadOrderNo` |
| `exportRow` | 택배사 양식 엑셀 다운로드 | `받는사람`, `받는사람전화1`, `받는사람주소1`, `상품명`, `수량`, `배송메시지`, (있을 때) `운송장번호` |

**UI 미리보기**

- `OrderPreviewDisplayRow = { meta, exportRow }` 형태로 표시 가능
- 사용자에게 쇼핑몰·계정·주문번호·엑클로드 관리번호를 **화면에서** 구분해 보여줄 수 있음

**택배사 다운로드**

- **기본적으로 `exportRow`만** Stage3/다운로드 파이프라인에 전달
- `provider` / `accountId` / `mallOrderNo` / `excloadOrderNo`는 **택배사 양식 헤더에 기본 포함하지 않음**
- 이 값들은 DB 스냅샷·송장 매칭(`matchShipmentRow`)·내부 추적용

**선택적 예외 (향후)**

- 특정 택배사 양식에 「관리번호」「비고」「고객관리번호」 등 **허용 컬럼**이 있을 때만
- `includeExcloadOrderNoInExport: true`로 `엑클로드관리번호` 열을 **선택 매핑**
- 기본값은 `false`

**구현 위치**

| 파일 | 역할 |
|------|------|
| `snapshots/types.ts` | `OrderPreviewDisplayMeta`, `OrderPreviewDisplayRow` |
| `snapshots/build-order-preview-display.ts` | `buildCourierExportRowFromSnapshot`, `buildOrderPreviewDisplayRows` |

**이번 단계에서 하지 않은 것**: 실제 다운로드 UI/route 수정, 택배사 템플릿 매핑 적용

---

## 2. fetch-orders route별 반환 구조 요약

| Provider | Route | previewHeaders | 특이 응답 | previewRows 주요 열 | 행 단위 |
|----------|-------|----------------|-----------|---------------------|---------|
| COUPANG | `coupang/fetch-orders` | ❌ 미반환 | `failedStatuses`, `debug.queriedStatuses` | 주문번호, **묶음배송번호**, 주문상태, 받는사람, 전화, 주소, 상품명, 수량, 결제일시, 배송메시지 | orderItem |
| SMARTSTORE | `smartstore/fetch-orders` | ✅ | proxy 필수, `days: 7` | 주문번호, **상품주문번호**, … | productOrder |
| ELEVEN | `eleven/fetch-orders` | ✅ | — | 주문번호, 상품주문번호, … | line |
| CAFE24 | `cafe24/fetch-orders` | ✅ | — | 주문번호, 상품주문번호, … | line |
| LOTTEON | `lotteon/fetch-orders` | ✅ | — | 동일 패턴 | line |
| SSG | `ssg/fetch-orders` | ✅ | — | 동일 패턴 | line |
| CJONSTYLE | `cjonstyle/fetch-orders` | ✅ | **배송타입** 열 추가 | 동일 + 배송타입 | line |
| SHOPBY | `shopby/fetch-orders` | ✅ | — | 동일 패턴 | line |
| GODOMALL | `godomall/fetch-orders` | ✅ | — | 동일 패턴 | line |
| MAKESHOP | `makeshop/fetch-orders` | ✅ | — | 동일 패턴 | line |
| SHOPIFY | `shopify/fetch-orders` | ✅ | `SHOPIFY_INTEGRATION_ENABLED` gate, `shopDomain` 열 | 상품옵션, **shopDomain** 추가 | **1 order** |

**공통 저장 가능 필드 (orderStandardFile.rows → 스냅샷)**

| 스냅샷 필드 | 기준헤더 / 출처 |
|-------------|----------------|
| `mallOrderNo` | `주문번호` |
| `mallLineItemId` | `상품주문번호` (없으면 Coupang `묶음배송번호` 등 provider 규칙) |
| `receiverName` | `받는사람` |
| `receiverPhone` | `받는사람전화1` (원본) |
| `receiverPhoneNormalized` | persist 시 `normalizePhoneDigits` |
| `receiverAddress` | `받는사람주소1` + `받는사람주소2` join |
| `receiverAddressNormalized` | persist 시 `normalizeAddressForMatch` |
| `productSummary` | `상품명` (+ 다행 merge 시 합침) |
| `quantity` | `수량` (합계) |
| `deliveryMemo` | `배송메시지` |
| `orderedAt` | `결제일시` 또는 `주문일시` parse |
| `orderStatus` | `주문상태` |
| `trackingNumber` | `운송장번호` (조회 시점 값) |

**provider별 추가 식별자 (normalizedPayloadJson 후보)**

| Provider | mallOrderId / fulfillment ID 출처 |
|----------|-----------------------------------|
| Coupang | `orderId`, `shipmentBoxId`, `vendorItemId` |
| Smartstore | `order.orderId`, `productOrder.productOrderId` |
| Cafe24 | `order_id`, `order_item_code` |
| Shopify | GraphQL `order.id`, `lineItems[].id` — `rawPayloadJson`에 보관 |
| 기타 | 각 `map-*-orders.ts` + client raw record |

---

## 3. Prisma 모델 초안 (미적용)

> 아래는 **초안**이다. schema 리뷰·승인 후 migration 한다.

### 3.1 Enum 제안

```prisma
enum OrderSyncBatchSourceType {
  API
  EXCEL
  MANUAL
}

enum OrderSyncBatchStatus {
  ACTIVE
  ARCHIVED
  ERROR
}

enum OrderSyncTransmissionStatus {
  NONE
  READY
  SENT
  FAILED
  SKIPPED
}
```

### 3.2 `OrderSyncBatch`

주문조회 **1회** 단위. fetch-orders 성공 1회 = batch 1건 (권장).

```prisma
model OrderSyncBatch {
  id          String                   @id @default(cuid())
  userId      String
  provider    OrderIntegrationProvider
  accountId   String?
  sourceType  OrderSyncBatchSourceType @default(API)
  fetchedAt   DateTime                 @default(now())
  orderCount  Int                      @default(0)
  status      OrderSyncBatchStatus     @default(ACTIVE)
  /// fetch-orders 요청 파라미터 요약 (days, status filter 등) — PII 금지
  fetchMetaJson Json?
  errorMessage  String?                @db.Text
  createdAt   DateTime                 @default(now())
  updatedAt   DateTime                 @updatedAt

  user    User                     @relation(fields: [userId], references: [id], onDelete: Cascade)
  account OrderIntegrationAccount? @relation(fields: [accountId], references: [id], onDelete: SetNull)
  orders  OrderSyncOrder[]

  @@index([userId, fetchedAt])
  @@index([userId, provider])
  @@index([accountId])
}
```

**`OrderIntegrationAccount` relation 추가 필요** — `orderSyncBatches OrderSyncBatch[]`

### 3.3 `OrderSyncOrder`

주문 스냅샷 **1건** (목표: 배송/송장 매칭 1행).

```prisma
model OrderSyncOrder {
  id                        String                      @id @default(cuid())
  batchId                   String
  userId                    String
  provider                  OrderIntegrationProvider
  accountId                 String?

  excloadOrderNo            String
  mallOrderNo               String
  mallOrderId               String?
  /// 부분배송·상품별 송장 대비 — line item ID 배열 (Prisma Json 또는 String[])
  mallLineItemIds           Json?

  receiverName              String?
  receiverPhone             String?
  receiverPhoneNormalized   String?
  receiverAddress           String?                     @db.Text
  receiverAddressNormalized String?

  productSummary            String?                     @db.Text
  quantity                  Int?
  deliveryMemo              String?                     @db.Text
  orderedAt                 DateTime?
  orderStatus               String?

  /// API 원본 — PII 최소화·보관기간 정책 별도 (§7)
  rawPayloadJson            Json?
  /// 송장전송용 식별자만 (fulfillment ID, productOrderId 등)
  normalizedPayloadJson     Json?

  trackingNumber            String?
  transmissionStatus        OrderSyncTransmissionStatus @default(NONE)

  createdAt                 DateTime                    @default(now())
  updatedAt                 DateTime                    @updatedAt

  batch OrderSyncBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)

  @@unique([userId, excloadOrderNo])
  @@index([batchId])
  @@index([userId, provider, mallOrderNo])
  @@index([userId, accountId])
  @@index([userId, provider, accountId, mallOrderNo])
}
```

### 3.4 `excloadOrderNo` 시퀀스 (선택)

일자별 sequence 경합 방지용 별도 테이블 또는 DB sequence.

```prisma
model ExcloadOrderNoSequence {
  id        String   @id @default(cuid())
  userId    String
  dateKey   String   // YYYYMMDD
  lastSeq   Int      @default(0)

  @@unique([userId, dateKey])
}
```

발급 형식: `EXC-{YYYYMMDD}-{seq6}` — [shipment-upload-matching-design.md §6](./shipment-upload-matching-design.md)과 동일.

---

## 4. 필드별 역할

| 필드 | 역할 | 송장 매칭 | API 송장전송 (3차) |
|------|------|-----------|-------------------|
| `excloadOrderNo` | 엑클로드 내부 추적·택배 양식 열 | **1순위 exact match** | 중복 전송 방지 |
| `provider` | 몰 구분 | `ShipmentMatchScope.provider` 필터 | adapter 선택 |
| `accountId` | 연동 계정 구분 (동일 몰 복수 계정) | scope 필터 | credential 조회 |
| `mallOrderNo` | 쇼핑몰 표시 주문번호 | 2순위 + phone/name | 몰 양식 출력 |
| `mallOrderId` | API 주문 ID | 보조 | fulfillment API |
| `mallLineItemId` | 상품주문/라인 ID | 2차 상품별 송장 | item-level 전송 |
| `receiverName/Phone/Address` | 수취인 매칭 | 점수 매칭 키 | 양식 출력 |
| `productSummary` | 상품 요약 | 보조 점수 20 | UI 표시 |
| `orderStatus` | 취소/반품 판별 | `CANCELLED_OR_INVALID_ORDER` | 전송 제외 |
| `trackingNumber` | 이미 등록된 송장 | `ALREADY_SHIPPED` | 기등록 감지 |
| `rawPayloadJson` | 디버그·재매핑 | 직접 사용 안 함 | 필요 시 ID 재추출 |
| `normalizedPayloadJson` | 전송용 ID만 | 사용 안 함 | 3차 API 입력 |

---

## 5. 송장 매칭 Phase A/B와 연결 방식

### 5.1 데이터 흐름 (목표)

```
fetch-orders (기존)
  → [신규] persist OrderSyncBatch + OrderSyncOrder
  → 택배 양식 다운로드 (excloadOrderNo 열 포함)
  → 택배사 송장파일
  → parseShipmentFile (Phase B)
  → matchShipmentRows (Phase A)
  → ShipmentMatch 저장 (Phase D)
```

### 5.2 DB → DTO 변환

persist된 `OrderSyncOrder`를 `OrderSyncOrderSnapshot`으로 변환하는 순수 함수 권장:

```typescript
// 제안: app/lib/order-integration/orders/to-order-sync-snapshot.ts
function toOrderSyncOrderSnapshot(order: OrderSyncOrder): OrderSyncOrderSnapshot
```

`matchShipmentRows({ shipments, orders: snapshots, scope })`에 그대로 전달.

### 5.3 Scope 정렬

| UI 시나리오 | `ShipmentMatchScope` | DB 쿼리 |
|-------------|----------------------|---------|
| 단일 몰 송장 업로드 | `{ userId, provider, accountId }` | 3필드 WHERE |
| 통합 송장 (여러 몰) | `{ userId }` only | `userId` + 최근 batch들 |
| 특정 조회 batch만 | batchId 목록 추가 (Phase D) | `batchId IN (...)` |

**원칙**: DB에는 provider/accountId가 **항상 명확**; UI에서 통합 매칭은 scope 생략으로 Phase A와 동일하게 동작.

### 5.4 `exportedRowIndex`

`ShipmentTemplateDownloadRow` (향후)에서 택배 양식 행 번호 저장 → `OrderSyncOrderSnapshot.exportedRowIndex`로 매칭 힌트. **행 순서만으로 자동 확정 금지** (Phase A 구현 반영됨).

---

## 6. 중복 조회·재조회 처리 방향

### 6.1 같은 주문을 다시 fetch했을 때

| 전략 | 설명 | 권장 |
|------|------|------|
| **A. 매 조회마다 신규 batch** | 이력 보존, batch로 시점 구분 | ✅ 1차 권장 |
| B. upsert 동일 mallOrderNo | 최신만 유지 | 이력 손실 |
| C. 동일 batch 갱신 | 덮어쓰기 | 재현성 낮음 |

**1차 권장 (A)**:

- fetch-orders 성공 시 **항상 새 `OrderSyncBatch`**
- `OrderSyncOrder`는 batch에 종속 — 과거 batch는 `ARCHIVED`로 표시 가능
- 송장 매칭 UI에서 「최근 조회 batch」또는 사용자 선택 batch 목록

### 6.2 동일 provider/accountId/mallOrderNo 중복

- **서로 다른 batch**에 동일 `mallOrderNo` 존재 가능 (재조회)
- 매칭 시 기본: **사용자가 선택한 batch(들)** 의 주문만 후보
- `excloadOrderNo`는 user 전역 unique — **재조회 시 새 번호 발급** (동일 쇼핑몰 주문이라도 batch별 스냅샷은 별도 행)

### 6.3 `excloadOrderNo` 발급

| 항목 | 내용 |
|------|------|
| 시점 | `OrderSyncOrder` insert 직전 |
| 형식 | `EXC-YYYYMMDD-000001` |
| 범위 | `userId` + `dateKey(YYYYMMDD)` 단위 sequence |
| 동시성 | transaction + `ExcloadOrderNoSequence` upsert 또는 advisory lock |
| unique | `@@unique([userId, excloadOrderNo])` |

### 6.4 이미 송장이 있는 주문

- 조회 시점 `운송장번호`가 있으면 `trackingNumber`에 저장
- Phase A `isOrderAlreadyShipped` → `ALREADY_SHIPPED`

---

## 7. 여러 쇼핑몰 통합 처리 방향

### 7.1 사용자 UX

- 송장파일 1개에 여러 몰 주문이 섞여 있을 수 있음
- 매칭 화면은 **통합 목록**; 내부적으로는 provider/accountId로 구분

### 7.2 DB 설계

- `OrderSyncOrder.provider` + `accountId` **필수 저장** (nullable accountId는 단일 계정 몰만)
- 통합 매칭 쿼리: `WHERE userId = ? AND batchId IN (?)` — provider 생략
- provider 지정 매칭: `AND provider = ? AND accountId = ?`

### 7.3 `OrderIntegrationAccount`와의 관계

- `OrderSyncBatch.accountId` → fetch에 사용한 계정
- 한 user가 Coupang 2계정(vendorId 다름) 가능 → `@@unique([userId, provider, vendorId])`
- 스냅샷 매칭 시 **accountId 격리**는 Phase A 테스트로 검증됨

---

## 8. 개인정보·로그 주의사항

| 항목 | 방침 |
|------|------|
| 로그 | 전화·주소·송장번호 **전체 출력 금지** (기존 `HeaderMappingAuditLog` 패턴 참고) |
| `rawPayloadJson` | 가능하면 **식별자·상태만** 저장; 전체 PII 저장 지양 |
| `normalizedPayloadJson` | fulfillment에 필요한 ID만 |
| 보관기간 | batch/주문 스냅샷 TTL 정책 미정 — migration 전 결정 |
| 마스킹 | 장기 보관 시 `receiverPhone` 마스킹·암호화 검토 |
| fetch `debug` | route 응답의 debug는 persist 대상 **아님** |

---

## 9. migration 전 검토 필요사항

| # | 결정 항목 | 상태 |
|---|-----------|------|
| 1 | 스냅샷 행 단위 | ✅ **확정** — 배송/수취인 1건, line item merge (`Phase C-1a`) |
| 2 | batch 생성 시점 | 미정 — fetch 자동 vs 별도 snapshots API opt-in |
| 3 | 재조회 batch 정책 | 항상 신규 vs dedup |
| 4 | `rawPayloadJson` 범위 | 전체 raw vs trimmed |
| 5 | 보관기간 / GDPR | TTL·삭제 cron |
| 6 | 일반 사용자 vs 관리자 | `requireOrderIntegrationAdmin` 유지 여부 |
| 7 | Production migration | 스테이징 선적용·롤백 |
| 8 | Shopify enum | `SHOPIFY` 이미 schema에 존재 — prod migration 적용 여부 별도 |
| 9 | Coupang previewHeaders | route 응답 일관성 (부가 개선) |
| 10 | `User` relation | cascade delete 시 스냅샷 전부 삭제 — 의도 확인 |

---

## 10. 다음 구현 단계 제안 (Phase C)

**Phase C-1a** ✅ (순수 함수 — DB 없음)

| 파일 | 역할 |
|------|------|
| `snapshots/types.ts` | `OrderSyncOrderSnapshotForPersist` |
| `snapshots/build-order-sync-snapshots.ts` | merge·productSummary·snapshot 빌드 |
| `snapshots/excload-order-no.ts` | 테스트용 `generateExcloadOrderNo` |
| `snapshots/build-order-preview-display.ts` | 미리보기 meta + 택배사 exportRow 분리 |
| `snapshots/__tests__/build-order-sync-snapshots.test.ts` | 단위 테스트 |
| `snapshots/__tests__/build-order-preview-display.test.ts` | display/export 분리 테스트 |

**Phase C-1** (schema — 별도 승인)

1. `schema.prisma`에 `OrderSyncBatch`, `OrderSyncOrder`, (선택) `ExcloadOrderNoSequence` 추가
2. migration 생성 — **스테이징만** 적용
3. `prisma generate`

**Phase C-2** (persist + route — 별도 승인)

1. `persist-order-sync-batch.ts` — `buildOrderSyncSnapshots` 호출 후 DB insert
2. `POST /api/order/integration/orders/snapshots` 또는 fetch-orders opt-in
3. `GET .../snapshots/:batchId` — userId 소유권 검증
4. `to-order-sync-snapshot.ts` — DB row → Phase A `OrderSyncOrderSnapshot`

**Phase D 이후**: 송장 업로드 API, UI, `ShipmentUploadBatch` / `ShipmentMatch` 모델

---

## 11. 참고 파일 목록

| 경로 | 용도 |
|------|------|
| `prisma/schema.prisma` | 현재 `OrderIntegrationAccount` only |
| `app/api/order/integration/*/fetch-orders/route.ts` | 11개 route 공통 응답 |
| `app/lib/*/map-*-orders.ts` | preview + OrderStandardFile 변환 |
| `app/lib/order-integration/shipments/types.ts` | `OrderSyncOrderSnapshot` DTO |
| `app/lib/order-integration/shipments/match-shipment-row.ts` | 매칭 scope·상태 |
| `docs/order-integration/shipment-upload-matching-design.md` | ER·excloadOrderNo·Shipment 모델 |
| `docs/order-integration/order-sync-shipment-roadmap.md` | 전체 로드맵 |

---

## 12. 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-07-09 | Phase C-0 초안 작성 — 조사만, schema 미적용 |
| 2026-07-09 | Phase C-1a — 스냅샷 1행 기준 확정, `snapshots/` 순수 함수 구현 |
| 2026-07-09 | Phase C-1a 확장 — 미리보기 meta / 택배사 exportRow 분리 |
