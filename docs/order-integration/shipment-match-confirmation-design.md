# 송장 매칭 확정·저장 설계 (Phase D-3a)

> **상태**: 설계 문서 (2026-07) — **구현 전**  
> **범위**: 송장파일 매칭 결과를 DB에 저장하고, 사용자가 검토·확정·제외한 뒤 **전송 준비 목록**까지 만드는 중간 저장 구조  
> **이번 단계 제외**: Prisma schema/migration, API route 구현, UI 수정, 송장전송, 외부 API 호출  
> **관련 문서**  
> - [shipment-upload-matching-design.md](./shipment-upload-matching-design.md) — 송장 업로드·매칭 전체 설계 (Phase A~E)  
> - [order-sync-snapshot-db-design.md](./order-sync-snapshot-db-design.md) — `OrderSyncBatch` / `OrderSyncOrder` 설계·구현  
> - [snapshot-persist-smoke-test.md](./snapshot-persist-smoke-test.md) — 주문 스냅샷 저장 smoke test  
> - [order-sync-shipment-roadmap.md](./order-sync-shipment-roadmap.md) — 1~4차 로드맵  
> **구현 완료 (본 문서 기준점)**  
> - Phase D-1: `POST /api/order/integration/shipments/match` — in-memory 매칭 JSON 반환 (`407f89e`)  
> - Phase D-2: `/order/integration/shipments` UI — 매칭 결과 표시 (`1e72427`)  
> - Phase C: `OrderSyncBatch` / `OrderSyncOrder` / `ExcloadOrderNoSequence` — Prisma schema·migration 존재 (persist는 feature flag OFF 기본)

---

## 1. 목적

택배사 송장파일을 업로드한 뒤 생성되는 **매칭 결과를 바로 쇼핑몰에 전송하지 않는다**.

사용자가 다음을 할 수 있는 **중간 저장 구조**가 필요하다.

| 사용자 필요 | 설명 |
|-------------|------|
| 검토 | 자동 매칭·확인 필요·실패 항목을 나중에 다시 열어보기 |
| 확정 | 올바른 주문과 송장번호 연결을 사용자가 승인 |
| 수정 | 송장번호·택배사·연결 주문을 수동 변경 |
| 제외 | 중복·오류·전송 불가 항목을 전송 대상에서 빼기 |
| 전송 준비 | 이후 단계(몰별 엑셀 다운로드 또는 API 송장전송)에 넘길 목록 생성 |

**이번 Phase D-3a는 위 구조의 설계만 다룬다.**  
코드·schema·migration·API·UI 변경은 **하지 않는다**.

---

## 2. 전체 흐름

### 2.1 현재 (Phase D-1 / D-2)

```
송장파일 업로드 (UI 또는 API)
  → parseUploadedShipmentFile
  → extractNormalizedShipmentRows
  → loadOrderSyncSnapshotsForMatching (OrderSyncOrder DB)
  → matchShipmentRows
  → JSON 응답 + 화면 표시
  → (세션 종료 시 결과 소멸)
```

**갭**

- 매칭 결과가 **DB에 저장되지 않음**
- 사용자 확정/제외/수정 상태 **없음**
- 전송 준비 목록 **없음**
- 동일 파일 재업로드 시 이전 검토 이력 **없음**

### 2.2 목표 (Phase D-3b 이후)

```
송장파일 업로드
  → 파싱·정규화
  → OrderSyncOrder 스냅샷 조회
  → matchShipmentRows (알고리즘 판정)
  → ShipmentUploadBatch 저장
  → ShipmentUploadRow 저장 (원본 송장 행)
  → ShipmentMatch 저장 (행별 매칭·확정 상태)
  → UI에서 검토
  → 사용자: 확정 / 수동연결 / 수정 / 제외
  → transmissionStatus = READY 인 항목만 전송 준비 목록
  → [별도 Phase] 몰별 송장 업로드 엑셀 다운로드 또는 API 송장전송
```

### 2.3 기존 `match` route와의 관계

| Route | 역할 | Phase D-3 이후 |
|-------|------|----------------|
| `POST /api/order/integration/shipments/match` (기존) | 빠른 미리보기·smoke test용 in-memory 매칭 | **유지** — 저장 없이 즉시 결과 확인 |
| `POST /api/order/integration/shipments/uploads` (신규) | 업로드 + 매칭 + **DB 저장** | D-3b 구현 대상 |

권장: UI의 「송장파일 매칭하기」는 D-3b부터 `uploads` API를 호출하고, 저장된 `batchId`로 상세 화면을 연다.  
기존 `match` route는 개발·디버그·저장 없는 빠른 확인용으로 남긴다.

### 2.4 주문 스냅샷과의 선행 조건

매칭 저장 구조는 **`OrderSyncOrder`가 존재할 때** 의미가 있다.

| 선행 | 상태 |
|------|------|
| `OrderSyncBatch` / `OrderSyncOrder` schema | ✅ migration 존재 |
| fetch-orders persist | feature flag OFF 기본 — smoke test 보류 |
| 송장 매칭 UI | snapshot 0건 시 안내 배너 처리 완료 (D-2) |

D-3b 구현 전에 **로컬 smoke test로 OrderSyncOrder 1건 이상** 확보하는 것을 권장한다.

---

## 3. DB 모델 초안 (미적용)

> **주의**: 아래는 Prisma **초안**이다. schema 수정·migration 생성은 **별도 승인 후** D-3b에서 진행한다.  
> 필드명은 기존 `OrderSyncOrder.integrationAccountId`와 **동일 체계**를 따른다 (`accountId` 아님).

### 3.1 ER 개요

```
User
  ├── OrderSyncBatch (기존)
  │     └── OrderSyncOrder (기존)
  └── ShipmentUploadBatch (신규)
        ├── ShipmentUploadRow (신규 — 원본 송장 1행)
        └── ShipmentMatch (신규 — 매칭·확정 1건)
              └── orderSyncOrderId? → OrderSyncOrder (확정 연결)
```

**1 upload row : 0~1 ShipmentMatch** (1:1).  
`MULTIPLE_CANDIDATES` 후보 목록은 `candidateOrdersJson`에 보관.

### 3.2 Enum 제안

```prisma
/// 업로드 batch 전체 진행 상태
enum ShipmentUploadBatchStatus {
  PARSED          // 파일 파싱 완료, 매칭 전
  MATCHED         // 매칭 완료, 사용자 검토 대기
  REVIEWING       // 일부 확정/제외 진행 중
  READY           // 전송 준비 항목 존재 (READY match 1건 이상)
  ARCHIVED        // 보관/폐기
  ERROR           // 파싱·매칭 실패
}

/// 원본 송장 행 파싱 상태
enum ShipmentUploadRowParseStatus {
  OK
  WARNING
  ERROR
}

/// 알고리즘 매칭 판정 (Phase A ShipmentMatchStatus와 동일)
enum ShipmentAlgorithmMatchStatus {
  MATCHED_CONFIDENT
  MATCHED_WARNING
  MULTIPLE_CANDIDATES
  NOT_MATCHED
  DUPLICATE_TRACKING_NUMBER
  ALREADY_SHIPPED
  CANCELLED_OR_INVALID_ORDER
}

/// 사용자 검토·확정 상태 (신규)
enum ShipmentUserConfirmationStatus {
  UNCONFIRMED       // 아직 사용자 조치 없음
  CONFIRMED         // 알고리즘 매칭 그대로 확정
  MANUALLY_LINKED   // 다른 OrderSyncOrder로 수동 연결
  EDITED            // 송장번호/택배사 등 사용자 수정 후 확정
  EXCLUDED          // 전송 제외 (사용자 명시 또는 자동 제외 권장 항목)
}

/// 전송 준비·전송 결과 (Phase A TransmissionStatus와 동일 계열)
enum ShipmentTransmissionStatus {
  NOT_READY
  READY
  SENT
  FAILED
  SKIPPED
}
```

**이름 분리 이유**

| 구분 | 필드 | 의미 |
|------|------|------|
| 알고리즘 | `algorithmMatchStatus` | `matchShipmentRows` 출력 — **재계산 시 덮어쓸 수 있음** |
| 사용자 | `userConfirmationStatus` | UI에서 사용자가 내린 결정 — **우선** |
| 전송 | `transmissionStatus` | D-3a에서는 `NOT_READY` / `READY`만 사용 |

### 3.3 `ShipmentUploadBatch`

송장파일 업로드 **1회** 단위.

```prisma
model ShipmentUploadBatch {
  id                   String                     @id @default(cuid())
  userId               String
  /// 매칭 scope — optional (통합 매칭 시 null)
  provider             OrderIntegrationProvider?
  integrationAccountId String?
  /// 주문 스냅샷 scope — optional (특정 OrderSyncBatch만 대상으로 할 때)
  orderSyncBatchId     String?

  originalFileName     String
  originalFileType     String?
  originalFileSize     Int
  fileHash             String?                    // SHA-256 — 중복 업로드 감지

  rowCount             Int                        @default(0)
  parseWarningCount    Int                        @default(0)
  matchedConfidentCount Int                       @default(0)
  matchedWarningCount  Int                        @default(0)
  notMatchedCount      Int                        @default(0)
  duplicateCount       Int                        @default(0)
  excludedCount        Int                        @default(0)
  readyForTransmitCount Int                       @default(0)

  status               ShipmentUploadBatchStatus  @default(PARSED)
  errorMessage         String?                    @db.Text

  createdAt            DateTime                   @default(now())
  updatedAt            DateTime                   @updatedAt

  user                 User                       @relation(...)
  integrationAccount   OrderIntegrationAccount?   @relation(...)
  orderSyncBatch       OrderSyncBatch?            @relation(...)
  rows                 ShipmentUploadRow[]

  @@index([userId, createdAt])
  @@index([userId, status])
  @@index([integrationAccountId])
}
```

**집계 필드**: batch 조회 시 UI 요약 카드용. `ShipmentMatch` 변경 시 트랜잭션 내 갱신.

### 3.4 `ShipmentUploadRow`

파싱된 송장파일 **원본 1행**.

```prisma
model ShipmentUploadRow {
  id                        String                       @id @default(cuid())
  batchId                   String
  userId                    String                       // denormalized 소유권

  originalRowIndex          Int                          // 0-based
  rawRowJson                Json?                        // 원본 열 map — 보관기간 정책 별도

  trackingNumber            String
  trackingNumberNormalized  String
  carrierName               String?
  standardCarrierCode       String?

  receiverName              String?
  receiverPhone             String?
  receiverAddress           String?                      @db.Text
  mallOrderNo               String?
  excloadOrderNo            String?
  productText               String?
  shippedAt                 String?

  parseStatus               ShipmentUploadRowParseStatus @default(OK)
  parseWarningsJson         Json?                        // ShipmentParseWarning[]

  createdAt                 DateTime                     @default(now())
  updatedAt                 DateTime                     @updatedAt

  batch                     ShipmentUploadBatch          @relation(...)
  match                     ShipmentMatch?

  @@unique([batchId, originalRowIndex])
  @@index([batchId])
  @@index([userId])
  @@index([batchId, trackingNumberNormalized])
}
```

**PII**: DB 저장은 업무상 필요. 로그·API 응답·UI는 D-2와 동일하게 **마스킹** (`shipment-match-ui.ts` 재사용).

### 3.5 `ShipmentMatch`

업로드 행 1건에 대한 **알고리즘 매칭 + 사용자 확정 + 전송 준비** 상태.

```prisma
model ShipmentMatch {
  id                       String                         @id @default(cuid())
  uploadRowId              String                         @unique
  batchId                  String
  userId                   String

  algorithmMatchStatus     ShipmentAlgorithmMatchStatus
  matchScore               Int                            @default(0)
  matchReason              String?                        @db.Text
  mismatchFieldsJson       Json?

  /// 확정 연결 주문 — MANUALLY_LINKED / CONFIRMED / EDITED 시 설정
  orderSyncOrderId         String?
  candidateOrdersJson      Json?                          // MULTIPLE_CANDIDATES 상위 N건

  userConfirmationStatus   ShipmentUserConfirmationStatus @default(UNCONFIRMED)
  confirmedAt              DateTime?
  confirmedByUserId        String?

  /// 사용자 확정 후 최종 전송값 (EDITED 시 uploadRow와 다를 수 있음)
  finalTrackingNumber      String?
  finalCarrierName         String?
  finalStandardCarrierCode String?

  transmissionStatus       ShipmentTransmissionStatus     @default(NOT_READY)
  transmissionReadyAt      DateTime?
  /// 3차 이후: sentAt, transmissionErrorMessage 등 추가

  createdAt                DateTime                       @default(now())
  updatedAt                DateTime                       @updatedAt

  uploadRow                ShipmentUploadRow              @relation(...)
  batch                    ShipmentUploadBatch            @relation(...)
  orderSyncOrder           OrderSyncOrder?                @relation(...)

  @@index([batchId])
  @@index([userId])
  @@index([batchId, algorithmMatchStatus])
  @@index([batchId, userConfirmationStatus])
  @@index([batchId, transmissionStatus])
  @@index([orderSyncOrderId])
}
```

**관계**

- `ShipmentMatch.uploadRowId` → `ShipmentUploadRow` (1:1)
- `ShipmentMatch.orderSyncOrderId` → `OrderSyncOrder` (optional FK)
- `OrderSyncOrder`에 `shipmentMatches ShipmentMatch[]` 역관계 추가 검토

### 3.6 기존 모델과의 정합성

| 기존 | 신규 연결 |
|------|-----------|
| `OrderSyncOrder` | `ShipmentMatch.orderSyncOrderId` — 확정된 주문 |
| `OrderSyncBatch` | `ShipmentUploadBatch.orderSyncBatchId` — 매칭 대상 조회 batch (optional) |
| `OrderIntegrationAccount` | `ShipmentUploadBatch.integrationAccountId` — scope |
| `User` | 모든 테이블 `userId` denormalized + FK |

**추가하지 않는 것 (D-3a)**

- `ShipmentTemplateDownloadBatch` / `ShipmentTemplateDownloadRow` — 택배 양식 다운로드 추적은 별도 Phase
- `CarrierCodeMap` — 몰별 택배사 코드 변환은 export/전송 Phase

### 3.7 migration 전 검토 사항

| # | 항목 | 제안 |
|---|------|------|
| 1 | `rawRowJson` 보관기간 | 90일 TTL 또는 batch ARCHIVED 시 삭제 |
| 2 | `fileHash` unique | `(userId, fileHash)` unique 여부 — 동일 파일 재업로드 허용 vs 차단 |
| 3 | cascade delete | User 삭제 시 upload batch 전부 삭제 — `onDelete: Cascade` |
| 4 | OrderSyncOrder 삭제 | 확정된 match가 있으면 `SetNull` + `userConfirmationStatus=EXCLUDED` |
| 5 | 인덱스 | `(userId, batchId)` 복합 — 모든 조회의 기본 WHERE |
| 6 | enum 중복 | `ShipmentAlgorithmMatchStatus` vs TS `ShipmentMatchStatus` — 구현 시 단일 SSOT 유지 |

---

## 4. 상태 설계

### 4.1 알고리즘 매칭 상태 (`algorithmMatchStatus`)

Phase A/D-1과 **동일**. `matchShipmentRows` 출력을 그대로 저장.

| 값 | 의미 | UI 탭 (D-2) |
|----|------|-------------|
| `MATCHED_CONFIDENT` | 강한 키 일치, 자동 확정 후보 | 자동 매칭 |
| `MATCHED_WARNING` | 유사 매칭, 불일치 필드 있음 | 확인 필요 |
| `MULTIPLE_CANDIDATES` | 동점 후보 2개 이상 | 확인 필요 / 중복·오류 |
| `NOT_MATCHED` | 점수 미달 | 매칭 실패 |
| `DUPLICATE_TRACKING_NUMBER` | 동일 파일 내 송장번호 중복 | 중복/오류 |
| `ALREADY_SHIPPED` | OrderSyncOrder에 송장 이미 존재 | 이미 발송 |
| `CANCELLED_OR_INVALID_ORDER` | 취소·반품·전송 불가 | 취소/불가 |

**재매칭 정책**: 사용자가 아직 `UNCONFIRMED`인 행만 알고리즘 결과 덮어쓰기 허용. `CONFIRMED` 이상은 보호.

### 4.2 사용자 확정 상태 (`userConfirmationStatus`)

| 값 | 의미 | 전송 준비 가능 |
|----|------|----------------|
| `UNCONFIRMED` | 초기 — 알고리즘 결과만 반영 | ❌ |
| `CONFIRMED` | 알고리즘 매칭 승인 | ✅ (알고리즘 제외 상태 아닐 때) |
| `MANUALLY_LINKED` | 사용자가 다른 `OrderSyncOrder` 선택 | ✅ |
| `EDITED` | 송장번호·택배사 수정 후 확정 | ✅ |
| `EXCLUDED` | 전송 제외 | ❌ |

**초기값 규칙 (제안)**

| algorithmMatchStatus | 초기 userConfirmationStatus | 비고 |
|----------------------|------------------------------|------|
| `MATCHED_CONFIDENT` | `UNCONFIRMED` | UI에서 일괄 확정 가능 |
| `MATCHED_WARNING` | `UNCONFIRMED` | 반드시 사용자 확인 |
| `MULTIPLE_CANDIDATES` | `UNCONFIRMED` | 수동 선택 필요 |
| `NOT_MATCHED` | `UNCONFIRMED` | 수동 연결 또는 제외 |
| `DUPLICATE_TRACKING_NUMBER` | `EXCLUDED` (자동) 또는 `UNCONFIRMED` | 제품 정책 선택 |
| `ALREADY_SHIPPED` | `EXCLUDED` (자동 권장) | |
| `CANCELLED_OR_INVALID_ORDER` | `EXCLUDED` (자동 권장) | |

자동 `EXCLUDED`는 D-3b 구현 시 **설정 가능**하게 하되, 기본은 자동 제외를 권장한다.

### 4.3 전송 준비 상태 (`transmissionStatus`)

| 값 | Phase D-3a | 이후 |
|----|------------|------|
| `NOT_READY` | ✅ 기본값 | 확정 전 |
| `READY` | ✅ 사용자 「전송 준비」 후 | export/API 대기 |
| `SENT` | ❌ 설계만 | 3차 API 송장전송 |
| `FAILED` | ❌ 설계만 | 전송 실패 |
| `SKIPPED` | ❌ 설계만 | 사용자 스킵 |

**READY 승격 조건 (제안)**

```
userConfirmationStatus IN (CONFIRMED, MANUALLY_LINKED, EDITED)
AND userConfirmationStatus != EXCLUDED
AND algorithmMatchStatus NOT IN (DUPLICATE_TRACKING_NUMBER, CANCELLED_OR_INVALID_ORDER)
AND finalTrackingNumber IS NOT NULL
AND orderSyncOrderId IS NOT NULL
```

`ALREADY_SHIPPED`는 기본 **READY 불가** — 예외는 관리자 정책으로만.

### 4.4 Batch 상태 전이

```
PARSED → MATCHED → REVIEWING ⇄ READY → ARCHIVED
   ↓
 ERROR
```

| 전이 | 조건 |
|------|------|
| → `MATCHED` | 모든 row에 `ShipmentMatch` 생성 완료 |
| → `REVIEWING` | match 1건 이상 `userConfirmationStatus != UNCONFIRMED` |
| → `READY` | match 1건 이상 `transmissionStatus = READY` |
| → `ARCHIVED` | 사용자 보관 또는 30일 경과 (정책 미정) |

---

## 5. 사용자 동작 설계

D-2 UI 이후 D-3c에서 추가할 동작. **이번 단계는 설계만.**

### 5.1 행 단위 동작

| 동작 | API (초안) | 상태 변화 |
|------|------------|-----------|
| 자동 매칭 항목 확정 | `POST .../matches/:id/confirm` | `CONFIRMED`, `orderSyncOrderId` = 알고리즘 선택 |
| 확인 필요 항목 확정 | 동일 | `CONFIRMED` |
| 다른 주문으로 수동 연결 | `POST .../matches/:id/link` | `MANUALLY_LINKED`, `orderSyncOrderId` = 요청값 |
| 송장번호·택배사 수정 | `POST .../matches/:id/edit` | `EDITED`, `finalTrackingNumber` 등 |
| 매칭 실패 항목 제외 | `POST .../matches/:id/exclude` | `EXCLUDED`, `transmissionStatus=NOT_READY` |
| 중복 송장 제외 | `exclude` | `EXCLUDED` |
| 전송 준비로 보내기 | `POST .../matches/:id/prepare` 또는 batch 단위 | `transmissionStatus=READY` (조건 충족 시) |

### 5.2 일괄 동작 (UI)

| 동작 | 대상 | 설명 |
|------|------|------|
| 자동 매칭만 일괄 확정 | `MATCHED_CONFIDENT` + `UNCONFIRMED` | 위험 낮은 항목만 |
| 확인 필요 탭 일괄 제외 | `DUPLICATE_*`, `ALREADY_SHIPPED` 등 | 오류 정리 |
| 전송 준비 일괄 생성 | 확정된 전체 | `READY` 승격 |

### 5.3 UI 화면 흐름 (D-3c 목표)

```
/order/integration/shipments          — 업로드 (D-2, 이후 uploads API 연동)
/order/integration/shipments/:batchId   — 저장된 batch 상세·검토 (신규)
```

D-2 화면은 업로드 후 `batchId`로 redirect하거나, 같은 페이지에서 저장 결과를 로드한다.

### 5.4 수정 시 검증

| 검증 | 규칙 |
|------|------|
| `orderSyncOrderId` | 반드시 동일 `userId` 소유 |
| `provider` scope | batch에 provider가 있으면 order.provider 일치 |
| `integrationAccountId` scope | batch에 있으면 order.integrationAccountId 일치 |
| `finalTrackingNumber` | string 유지, `Number()` 변환 금지 |
| 중복 송장 | 동일 batch 내 다른 READY 행과 충돌 경고 |

---

## 6. API route 초안 (미구현)

모든 route: **세션 `userId` 필수**. `batchId` / `matchId`만으로 조회 **금지**.

### 6.1 업로드·저장

#### `POST /api/order/integration/shipments/uploads`

**역할**: 송장파일 업로드 + 파싱 + 매칭 + DB 저장 (D-1 `matchUploadedShipmentFile` 확장).

**FormData**

| 필드 | 필수 | 설명 |
|------|------|------|
| `file` | O | csv / xlsx / xls |
| `provider` | X | 매칭 scope |
| `integrationAccountId` | X | 매칭 scope |
| `orderSyncBatchId` | X | 특정 주문 조회 batch만 후보로 |
| `autoExcludeErrors` | X | `true` 시 DUPLICATE/ALREADY_SHIPPED/CANCELLED 자동 EXCLUDED |

**성공 응답 (초안)**

```json
{
  "success": true,
  "batch": {
    "id": "cuid",
    "status": "MATCHED",
    "rowCount": 10,
    "summary": { "...": "D-1 match summary와 동일" }
  },
  "redirectPath": "/order/integration/shipments/{batchId}"
}
```

**기존 `match`와 차이**: `ShipmentUploadBatch` + rows + matches **persist**.

### 6.2 조회

#### `GET /api/order/integration/shipments/uploads/:batchId`

**역할**: 저장된 업로드 batch + rows + matches + displayRows 조회.

**검증**: `batch.userId === session.userId`

**응답**: D-2 UI가 소비하는 구조와 호환 — `match.displayRows`, `userConfirmationStatus`, `transmissionStatus` 포함.

#### `GET /api/order/integration/shipments/uploads`

**역할**: 사용자의 최근 upload batch 목록 (페이지네이션).

Query: `status`, `limit`, `cursor`

### 6.3 행 단위 조작

#### `POST /api/order/integration/shipments/matches/:matchId/confirm`

Body: `{ "orderSyncOrderId"?: string }` — 생략 시 알고리즘 `matchedOrderId` 사용.

→ `userConfirmationStatus=CONFIRMED`, `confirmedAt`, `confirmedByUserId`

#### `POST /api/order/integration/shipments/matches/:matchId/link`

Body: `{ "orderSyncOrderId": string }` (필수)

→ `MANUALLY_LINKED`, 소유권·scope 검증

#### `POST /api/order/integration/shipments/matches/:matchId/edit`

Body:

```json
{
  "finalTrackingNumber"?: string,
  "finalCarrierName"?: string,
  "finalStandardCarrierCode"?: string,
  "orderSyncOrderId"?: string
}
```

→ `EDITED`, final* 필드 갱신

#### `POST /api/order/integration/shipments/matches/:matchId/exclude`

Body: `{ "reason"?: string }`

→ `EXCLUDED`, `transmissionStatus=NOT_READY`

#### `POST /api/order/integration/shipments/matches/:matchId/prepare`

**역할**: 단일 행 `transmissionStatus=READY` 승격 (조건 검증).

#### `POST /api/order/integration/shipments/uploads/:batchId/prepare`

**역할**: batch 내 확정된 모든 eligible 행을 일괄 `READY`.

### 6.4 기존 route 유지

| Route | 변경 |
|-------|------|
| `POST /api/order/integration/shipments/match` | **유지** — 저장 없는 미리보기 |

### 6.5 향후 route (본 Phase 범위 외)

| Route | Phase |
|-------|-------|
| `GET /api/order/integration/shipments/export` | D-4 — 몰별 송장 업로드 엑셀 |
| `POST /api/order/integration/{provider}/shipments/send` | 3차 — API 송장전송 |

---

## 7. 보안·격리

| 원칙 | 내용 |
|------|------|
| **userId 필수** | 모든 INSERT/SELECT/UPDATE에 `userId` 조건 |
| **복합 키 조회** | `WHERE id = ? AND userId = ?` — `batchId`·`matchId` 단독 조회 금지 |
| **OrderSyncOrder 연결** | link/confirm 시 `orderSyncOrder.userId === session.userId` |
| **scope 격리** | batch `provider`/`integrationAccountId`가 있으면 연결 주문도 일치 검증 |
| **PII 로그** | 전화·주소·송장번호 전체 로그 금지 — `toSafeShipmentMatchLogMessage` 패턴 |
| **rawRowJson** | API 응답 기본 제외 또는 마스킹 |
| **자동 송장전송** | **금지** — `SENT`는 3차까지 코드 경로 없음 |
| **외부 API** | D-3a/b에서 호출 없음 |

**인증 정책 (제안)**

| Route | 인증 |
|-------|------|
| `uploads`, `matches/*` | 일반 로그인 사용자 (`getServerSession`) — D-1 `match`와 동일 |
| 주문연동 UI | 현재 `/order/integration/*`는 관리자 middleware — **제품 정책 확정 필요** |

일반 사용자 오픈 시 middleware와 API 인증을 **일치**시켜야 한다.

---

## 8. 다운로드·전송과의 연결

### 8.1 전송 준비 목록

```
ShipmentMatch
  WHERE batchId = ?
    AND userId = ?
    AND transmissionStatus = READY
    AND userConfirmationStatus IN (CONFIRMED, MANUALLY_LINKED, EDITED)
```

조인: `OrderSyncOrder` (몰 주문번호·provider·normalizedPayloadJson)

### 8.2 출력 채널 분기 (향후)

| 채널 | 대상 | Phase |
|------|------|-------|
| 몰별 송장 업로드 **엑셀** | API 미연동·엑셀 업로드 몰 | D-4 export |
| **API 송장전송** | direct API 몰 (쿠팡·스마트스토어 등) | 3차 |
| Shopify fulfillment | `write_fulfillments` scope 별도 | 3차+ |

### 8.3 통합 UI · 분리 전송

- 사용자 화면: **여러 provider 혼합** 목록 (D-2 패턴 유지)
- 내부 전송/export: **`provider`별 그룹** → adapter / 컬럼맵 분리
- `CarrierCodeMap` (향후): `finalStandardCarrierCode` → 몰 API 택배사 코드

### 8.4 OrderSyncOrder와의 동기화

전송 성공(3차) 후:

- `ShipmentMatch.transmissionStatus = SENT`
- `OrderSyncOrder.trackingNumber` / `transmissionStatus` 갱신 검토
- 중복 전송 방지: `ALREADY_SHIPPED` 알고리즘 + DB unique 정책

---

## 9. 구현 단계 제안 (D-3b 이후)

| Phase | 내용 |
|-------|------|
| **D-3a** ✅ | 본 설계 문서 |
| **D-3b** | Prisma 모델 초안 PR → migration (스테이징) → `persist-shipment-upload-batch.ts` → `uploads` POST/GET |
| **D-3c** | UI — batch 상세, confirm/link/edit/exclude/prepare |
| **D-4** | `shipments/export` — READY 항목 몰별 엑셀 |
| **3차** | API 송장전송, `SENT` |

### 9.1 D-3b 모듈 제안

```
app/lib/order-integration/shipments/
  persist-shipment-upload-batch.ts   # match + DB insert
  to-shipment-match-display.ts       # DB row → displayRows
  shipment-match-state.ts            # READY 승격·자동 EXCLUDED 규칙

app/api/order/integration/shipments/
  uploads/route.ts
  uploads/[batchId]/route.ts
  matches/[matchId]/confirm/route.ts
  matches/[matchId]/link/route.ts
  matches/[matchId]/edit/route.ts
  matches/[matchId]/exclude/route.ts
  matches/[matchId]/prepare/route.ts
```

### 9.2 테스트 계획 (D-3b)

| # | 케이스 |
|---|--------|
| 1 | upload → batch/row/match 3테이블 insert |
| 2 | 타 userId batch 조회 404 |
| 3 | confirm 시 orderSyncOrder 소유권 검증 |
| 4 | EXCLUDED 후 READY 승격 거부 |
| 5 | MATCHED_CONFIDENT 일괄 confirm |
| 6 | MANUALLY_LINKED 후 finalTrackingNumber 유지 |
| 7 | batch 집계 카운트 갱신 |
| 8 | PII 로그 미노출 |

---

## 10. 이번에 하지 않은 것 (재확인)

- Prisma schema 수정
- migration 생성·적용
- API route 구현
- UI 수정
- 송장전송·Shopify fulfillment·배송조회
- 외부 API 호출
- `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED` 변경
- 커밋 (본 문서 작성 후 사용자 승인 시 별도)

---

## 11. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-09 | Phase D-3a 초안 — 매칭 확정·저장 구조 설계 (D-1/D-2 완료 반영) |
