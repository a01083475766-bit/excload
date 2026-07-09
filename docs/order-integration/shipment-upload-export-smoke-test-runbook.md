# 송장 업로드·매칭·엑셀 다운로드 smoke test Runbook

> **상태**: 운영 준비 문서 (2026-07) — **체크리스트만** (실행은 별도 승인 후)  
> **목적**: Phase D-4까지 구현된 송장파일 업로드 → 매칭 저장 → 확정/제외/주문 연결 → READY 승격 → 쇼핑몰 업로드용 엑셀 다운로드 흐름을 **안전하게** 검증하기 위한 절차·성공 기준 정리  
> **관련 문서**  
> - [shipment-upload-export-preflight-checklist.md](./shipment-upload-export-preflight-checklist.md) — smoke **실행 전** preflight (D-4f)  
> - [smoke-samples/README.md](./smoke-samples/README.md) — 테스트 샘플 데이터 (D-4e)  
> - [shipment-upload-matching-design.md](./shipment-upload-matching-design.md) — 송장 업로드·매칭 전체 설계  
> - [shipment-match-confirmation-design.md](./shipment-match-confirmation-design.md) — 확정·제외·연결 설계  
> - [snapshot-persist-smoke-test.md](./snapshot-persist-smoke-test.md) — 주문 스냅샷 저장 smoke test  
> - [order-sync-shipment-roadmap.md](./order-sync-shipment-roadmap.md) — 1~4차 로드맵

**이 문서는 절차·체크리스트만 다룹니다.**  
실행 전에는 [shipment-upload-export-preflight-checklist.md](../shipment-upload-export-preflight-checklist.md) (D-4f)를 먼저 확인하세요.  
아래 작업은 **본 문서 작성 단계에서 수행하지 않습니다**: 실제 smoke 실행, 코드 구현, DB/schema/migration 변경, env 변경, 외부 쇼핑몰 API 호출, 송장전송.

**검증 범위가 아닌 것 (명시)**  
- 쇼핑몰 API **송장전송** 검증  
- 배송조회·주문상태 변경  
- Production env / `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED` 변경  
- CSV 다운로드 UI (D-4c는 xlsx 버튼만 연결)

---

## 1. 목적

D-4까지 구현된 아래 흐름이 **로컬 또는 승인된 테스트 환경**에서 end-to-end로 동작하는지 확인합니다.

```
송장파일 업로드 → 매칭 저장 → 확정 / 제외 / 주문 연결 → batch READY 승격 → 쇼핑몰 업로드용 xlsx 다운로드
```

| 확인 항목 | 설명 |
|-----------|------|
| 저장·조회 | 업로드 배치·행·매칭이 DB에 저장되고 상세 조회 가능 |
| 사용자 처리 | 확정·제외·수동 주문 연결이 API/UI에서 정상 동작 |
| READY 승격 | 모든 매칭 처리 완료 시 `batchStatus = READY` 자동 전환 |
| 다운로드 | READY 배치에서 xlsx export 성공, 필요한 최소 컬럼만 포함 |
| 개인정보 | 수취인명·전화·주소·원본 JSON이 export/UI 응답에 노출되지 않음 |
| 전송 없음 | **쇼핑몰에 송장이 직접 전송되지 않음** (파일 다운로드만) |

---

## 2. 현재 구현 범위 (D-4 기준)

### 2.1 API

| 메서드 | 경로 | 역할 |
|--------|------|------|
| `POST` | `/api/order/integration/shipments/uploads` | 송장파일 업로드·파싱·매칭·DB 저장 |
| `GET` | `/api/order/integration/shipments/uploads/:batchId` | 저장된 배치·행·매칭 상세 조회 |
| `POST` | `/api/order/integration/shipments/uploads/:batchId/matches/:matchId/confirm` | 자동 매칭 건 확정 |
| `POST` | `/api/order/integration/shipments/uploads/:batchId/matches/:matchId/exclude` | 불필요 건 제외 |
| `GET` | `/api/order/integration/shipments/uploads/:batchId/linkable-orders` | 수동 연결 후보 주문 목록 |
| `POST` | `/api/order/integration/shipments/uploads/:batchId/matches/:matchId/link` | 매칭 실패 건 주문 수동 연결 |
| `GET` | `/api/order/integration/shipments/uploads/:batchId/export?format=xlsx` | 쇼핑몰 업로드용 파일 다운로드 |

**인증**: 위 API는 모두 **NextAuth 로그인 세션** 필요 (`getServerSession`). 관리자 전용 `fetch-orders` API와 별도입니다.

**READY 승격**: `confirm` / `exclude` / `link` 성공 후 서버가 자동 평가. 매칭이 1건 이상이고, 모든 매칭이 `CONFIRMED` \| `EXCLUDED` \| `MANUALLY_LINKED` \| `EDITED`이면 `READY`.

### 2.2 UI

| 경로 | 컴포넌트 | 기능 |
|------|----------|------|
| `/order/integration/shipments` | `ShipmentMatchPanel` | 송장파일 업로드, 매칭 결과 표시, 확정·제외·주문 연결, **쇼핑몰 업로드용 엑셀 다운로드** |

UI 다운로드 버튼은 `GET .../export?format=xlsx`를 호출하며, **쇼핑몰에 직접 전송하지 않음**을 안내 문구로 표시합니다.

### 2.3 export 파일 (xlsx)

- 기본 `format=xlsx`
- provider / integrationAccountId **그룹별 sheet** 분리 (다중 그룹)
- **포함 상태**: `CONFIRMED`, `MANUALLY_LINKED`, `EDITED`
- **미포함**: `EXCLUDED` (집계만, 행 제외)
- **컬럼**: 쇼핑몰, 연동계정ID, 쇼핑몰주문번호, 엑클로드관리번호, 택배사, 송장번호, 매칭ID, 주문스냅샷ID
- **미포함 PII**: 수취인명, 전화번호, 주소

---

## 3. 전제 조건

| # | 항목 | 기대 상태 |
|---|------|-----------|
| P1 | 테스트용 사용자 계정 | NextAuth로 로그인 가능한 **전용** 계정 |
| P2 | 테스트용 `OrderSyncOrder` snapshot | 동일 `userId` 소유, 2~5건 권장 |
| P3 | 테스트용 `ShipmentUploadBatch` | **운영 주문·실제 고객 데이터와 섞이지 않음** |
| P4 | DB 환경 | 로컬 `.env`와 Production이 **동일 Supabase**일 수 있음 → **운영 데이터로 테스트 금지** |
| P5 | `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED` | **임의 변경 금지** (기본 OFF 유지). snapshot이 없으면 smoke test **실행 보류** |
| P6 | 외부 API | 쇼핑몰 주문조회·송장전송 API **호출 금지** (이번 smoke는 저장된 snapshot + 업로드 파일만 사용) |
| P7 | 송장전송 | **구현·실행 모두 금지** |
| P8 | Prisma / migration | schema·migration **변경 금지** |
| P9 | 로컬 dev 서버 | `npm run dev` 등으로 `/order/integration/shipments` 접근 가능 |

### 운영 DB 주의

[snapshot-persist-smoke-test.md](./snapshot-persist-smoke-test.md)와 동일하게, 로컬 `.env`가 Production DB를 가리킬 수 있습니다.  
smoke 실행 시 생성되는 `ShipmentUploadBatch` / `ShipmentUploadMatch` row는 **테스트 전용 데이터**로만 준비하고, 완료 후 정리 계획을 세웁니다.

---

## 4. 테스트 데이터 준비 체크리스트

### 4.0 샘플 데이터 (D-4e)

레포에 포함된 더미 샘플을 사용할 수 있습니다. **자동 DB insert는 없습니다** — snapshot은 테스트 계정에 **수동 준비**합니다.

| 파일 | 설명 |
|------|------|
| [smoke-samples/README.md](./smoke-samples/README.md) | 샘플 폴더 안내 |
| [smoke-samples/shipment-upload-smoke-orders.md](./smoke-samples/shipment-upload-smoke-orders.md) | 주문 snapshot 예시 5건 |
| [smoke-samples/shipment-upload-smoke-file.csv](./smoke-samples/shipment-upload-smoke-file.csv) | 송장파일 CSV 5행 |

### 4.1 주문 snapshot

- [ ] 테스트 `userId`에 속한 `OrderSyncOrder` **2~5건** 확보
- [ ] 사용할 `provider` / `integrationAccountId` 범위 확인 (업로드 scope와 일치)
- [ ] 각 주문에 `mallOrderNo`, `excloadOrderNo`(있으면), 수취인·전화·주소가 snapshot에 존재 (UI 마스킹 검증용)

### 4.2 송장파일 샘플 (CSV 또는 xlsx)

최소 **4행** 권장 — 시나리오별 1행씩:

| # | 시나리오 | 기대 algorithm 상태 | smoke에서 할 일 |
|---|----------|---------------------|-----------------|
| S1 | 자동 매칭 성공 1건 | `MATCHED` 등 확정 가능 | **확정** |
| S2 | 확인 필요 1건 | `MATCHED_WARNING` 등 | 검토 후 **확정** 또는 정책에 따라 제외 |
| S3 | 매칭 실패 1건 | `NOT_MATCHED` / `MULTIPLE_CANDIDATES` | **주문 연결** |
| S4 | 제외 대상 1건 | 임의 (중복·오류 등) | **제외** |

추가 검증 데이터:

- [ ] **송장번호 앞자리 0** 보존 케이스 포함 (예: `0123456789` → export·UI에서 `0` 유실 없음)
- [ ] **전화번호·주소·수취인명**이 원본 송장파일·주문 snapshot에 포함 (마스킹·export 미포함 검증용)

### 4.3 업로드 scope

- [ ] `provider`, `integrationAccountId` (또는 배치 재업로드 시 `batchId`)가 snapshot 범위와 맞음
- [ ] 파일 크기·확장자 제한 준수 (`.csv`, `.xlsx`, `.xls`)

### 4.4 사전 자동 테스트 (참고)

코드 변경 없이 회귀 확인 시:

```bash
npm test -- --run app/lib/order-integration/shipments app/api/order/integration/shipments
npm run lint
npx tsc --noEmit
```

---

## 5. UI smoke test 순서

**진입 URL**: `/order/integration/shipments`

로그인 세션을 연 상태에서 아래를 **순서대로** 체크합니다.

### 5.1 업로드·저장

- [ ] 페이지 접속, 안내 문구에 **「아직 쇼핑몰에 송장전송되지 않습니다」** 표시 확인
- [ ] 테스트 송장파일 선택 후 업로드
- [ ] 브라우저 네트워크 탭: `POST /api/order/integration/shipments/uploads` → **200**
- [ ] 응답에 `uploadBatchId`, 매칭 요약·`displayRows` 수신
- [ ] UI에 파일명·행 수·주문 스냅샷 로드 건수 표시

### 5.2 상세 조회

- [ ] (필요 시) `GET /api/order/integration/shipments/uploads/:batchId` → **200**
- [ ] `batchStatus` 초기값 확인 (일반적으로 `MATCHED` 등, `READY` 아님)
- [ ] 테이블에 상태·쇼핑몰·주문번호·**마스킹된** 수취인/전화/주소·송장번호 표시

### 5.3 매칭 처리

- [ ] S1 자동 매칭 건: **확정** 버튼 → `POST .../confirm` **200**, 행 상태 `CONFIRMED`
- [ ] S4 제외 건: **제외** 버튼 → `POST .../exclude` **200**, 행 상태 `EXCLUDED`
- [ ] S3 매칭 실패 건: **주문 연결** → `GET .../linkable-orders` **200** → 주문 선택 → `POST .../link` **200**, `MANUALLY_LINKED` 등
- [ ] S2 확인 필요 건: 정책에 맞게 확정 또는 연결 완료
- [ ] **모든 행**이 `UNCONFIRMED`가 아님을 확인

### 5.4 READY·다운로드

- [ ] 마지막 처리 후 `batchStatus` → **`READY`** (상세 API 또는 UI `batchStatus` 반영)
- [ ] 「쇼핑몰 업로드용 파일」 섹션: READY 안내 문구 표시  
  *「모든 송장 매칭 처리가 완료되었습니다. 쇼핑몰 관리자에 업로드할 파일을 다운로드할 수 있습니다.」*
- [ ] **「쇼핑몰 업로드용 엑셀 다운로드」** 버튼 **활성화**
- [ ] 버튼 클릭 → `GET .../export?format=xlsx` **200**, xlsx 파일 저장
- [ ] 다운로드 중 「파일 준비 중…」, 실패 시 오류 메시지 표시 확인 (실패 케이스는 §7 참고)
- [ ] 주의 문구 확인: *「이 파일은 쇼핑몰에 직접 전송되지 않습니다…」*

### 5.5 다운로드 파일 내용

- [ ] 시트(또는 단일 시트)에 아래 **8개 컬럼** 존재:
  - 쇼핑몰
  - 연동계정ID
  - 쇼핑몰주문번호
  - 엑클로드관리번호
  - 택배사
  - 송장번호
  - 매칭ID
  - 주문스냅샷ID
- [ ] **제외(EXCLUDED) 행은 파일에 없음**
- [ ] 확정·수동연결 건만 포함
- [ ] **수취인명·전화번호·주소 컬럼 없음**
- [ ] 송장번호 앞자리 `0` 보존 (S1/S2 해당 행)
- [ ] 네트워크 탭에 **쇼핑몰 송장전송 API 호출 없음**

### 5.6 READY 이전 UI (부정 확인)

- [ ] `UNCONFIRMED` 행이 남아 있을 때 다운로드 버튼 **비활성화**
- [ ] 안내: *「확정, 제외, 주문 연결을 모두 완료하면 업로드용 파일을 다운로드할 수 있습니다.」*

---

## 6. API smoke test 순서

**공통**: 유효한 NextAuth 세션 쿠키 필요. 미로그인 시 **401**.

권장 순서 (동일 `batchId`·`matchId` 재사용):

| 단계 | 요청 | 기대 status | 비고 |
|------|------|---------------|------|
| 1 | `POST /api/order/integration/shipments/uploads` (multipart: `file`, `provider`, `integrationAccountId`) | **200** | `success: true`, `uploadBatchId` |
| 2 | `GET /api/order/integration/shipments/uploads/:batchId` | **200** | `uploadBatch`, `rows`, `matches`, 마스킹 필드 |
| 3 | `POST .../matches/:matchId/confirm` | **200** | 확정 가능 상태만 |
| 4 | `POST .../matches/:matchId/exclude` (body: `{ "reason": "..." }` 선택) | **200** | 미확정·제외 가능 상태 |
| 5 | `GET .../linkable-orders?q=...&limit=30` | **200** | 마스킹된 후보 주문 목록 |
| 6 | `POST .../matches/:matchId/link` (JSON: `{ "orderSyncOrderId": "..." }`) | **200** | 연결 가능 algorithm 상태 |
| 7 | `GET .../export?format=xlsx` | **200** | `Content-Type`: spreadsheet, `Content-Disposition`에 파일명 |

### 단계별 오류 status (정상 부정 테스트)

| 조건 | 대표 status |
|------|-------------|
| 미로그인 | **401** `{ error: "로그인이 필요합니다." }` |
| 잘못된 `batchId` 형식 | **400** |
| 타 사용자 batch / 없는 batch | **404** |
| 잘못된 `matchId` | **404** |
| link body 누락 | **400** |
| export `format` 잘못됨 | **400** |
| READY 아님 / UNCONFIRMED 잔존 | **409** |
| 서버 내부 오류 | **500** |

### export 409 메시지 (코드 기준)

| 상황 | error 메시지 |
|------|----------------|
| batch가 READY 아님 | `READY 상태의 배치만 보낼 수 있습니다.` |
| 매칭 0건 | `보낼 매칭 결과가 없습니다.` |
| UNCONFIRMED 잔존 | `아직 처리되지 않은 매칭이 있어 보낼 수 없습니다.` |

---

## 7. 실패·예외 확인

### 7.1 인증·소유권

- [ ] 세션 없이 각 API 호출 → **401**
- [ ] 다른 사용자 `batchId`로 상세·export → **404**

### 7.2 export 제한

- [ ] `batchStatus !== READY` 상태에서 `GET .../export?format=xlsx` → **409**
- [ ] READY이나 `UNCONFIRMED` 매칭 잔존 시 export → **409**
- [ ] EXCLUDED 건은 export rows에 **포함되지 않음** (`excludedCount`만 응답 DTO에 있을 수 있음 — 다운로드 파일에는 없음)

### 7.3 CSV 다중 그룹 정책 (D-4b 기준, API 직접 호출 시)

UI는 xlsx만 연결되어 있으나, API 회귀 확인용:

| 조건 | 기대 |
|------|------|
| `format=csv`, 단일 provider/account 그룹 | **200** 가능 |
| `format=csv`, 다중 그룹, `provider` 미지정 | **400** `CSV 다운로드는 쇼핑몰(provider)를 지정해 주세요.` |
| `format=csv`, `provider` 지정, `integrationAccountId`로 범위 좁히기 | 그룹·계정 정책에 따라 **200** 또는 **400** |
| xlsx, 다중 그룹 | **200**, sheet 분리 |

### 7.4 UI 오류 표시

- [ ] export 실패 시: *「파일 다운로드에 실패했습니다. 잠시 후 다시 시도해 주세요.」* (또는 API `error` 메시지)

---

## 8. 보안·개인정보 체크

### 8.1 API·UI 응답

- [ ] `rawRowJson` 필드가 UI/API JSON에 **노출되지 않음**
- [ ] `candidateOrdersJson` **노출되지 않음**
- [ ] export row DTO·다운로드 파일에 **원본 JSON 컬럼 없음**
- [ ] 상세·linkable-orders 응답은 전화·주소·송장번호 **마스킹** 버전 사용

### 8.2 로그

- [ ] 브라우저 콘솔·서버 로그에 전화번호·주소·송장번호 **원문** 남기지 않음 (`toSafeShipmentMatchLogMessage` 등 안전 로깅)

### 8.3 다운로드 xlsx

- [ ] 수취인명·전화번호·주소 **컬럼 없음**
- [ ] 파일을 쇼핑몰 관리자에 **수동 업로드**하는 용도임을 팀 내 공유

---

## 9. 금지 사항

| 금지 | 이유 |
|------|------|
| 실제 쇼핑몰 API **송장전송** | Phase D-4 범위 외 (3차 기능) |
| 운영 주문·실제 고객 데이터로 테스트 | PII·데이터 오염 위험 |
| Production DB / env **변경** | 별도 승인·절차 필요 |
| Prisma schema / migration 변경 | 이번 단계 범위 외 |
| `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED` 변경 | snapshot smoke test 문서와 동일 정책 |
| `next-env.d.ts` 커밋 | 로컬 생성 파일 |
| `scripts/capture-hero-gif.mjs` 커밋 | 무관 스크립트 |

---

## 10. 완료 판정

아래 **모두** 충족 시 smoke test **PASS**:

- [ ] 업로드로 `ShipmentUploadBatch` 생성됨
- [ ] row / match 상세 조회 가능 (`GET .../uploads/:batchId`)
- [ ] confirm / exclude / link 정상 동작
- [ ] 모든 매칭 처리 후 `batchStatus = READY` 자동 승격
- [ ] `GET .../export?format=xlsx` 다운로드 성공
- [ ] xlsx에 필요한 **8개 컬럼만** 포함, EXCLUDED 미포함
- [ ] PII·원본 JSON 미포함
- [ ] 쇼핑몰 송장 **전송 API 호출 없음**
- [ ] 테스트 데이터 정리 계획 수립 (동일 DB 사용 시)

---

## 부록 A. 빠른 참조 — API 경로

```
POST   /api/order/integration/shipments/uploads
GET    /api/order/integration/shipments/uploads/:batchId
POST   /api/order/integration/shipments/uploads/:batchId/matches/:matchId/confirm
POST   /api/order/integration/shipments/uploads/:batchId/matches/:matchId/exclude
GET    /api/order/integration/shipments/uploads/:batchId/linkable-orders
POST   /api/order/integration/shipments/uploads/:batchId/matches/:matchId/link
GET    /api/order/integration/shipments/uploads/:batchId/export?format=xlsx
```

## 부록 B. 구현 커밋 참고 (D-4)

| 단계 | 내용 |
|------|------|
| D-4a | export row DTO |
| D-4b | export 다운로드 API |
| D-4c | UI 엑셀 다운로드 버튼 (`57ae099`) |
| D-4d | 본 runbook 문서 |
