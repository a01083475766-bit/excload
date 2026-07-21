# 택배 다운로드 WorkItem · 수동 등록 분류 설계

> **상태**: 설계 확정 · **1차 기반 구현 반영** (2026-07-21). Bundle/WorkItem persist · 송장 Bundle 연결 · HMAC 보조 · UploadRow/Match 독립 scrub · 기본 수동 안내까지 포함. 후속(EXC 양식 주입·왕복 실측·전체 분류 UI 등)은 남음.
>
> **구현 상태 구분**
>
> - **1차 구현 완료**: Prisma Bundle/WorkItem, 다운로드 시 행별 저장, API/EXCEL/TEXT, OrderSync 참조, 14일 TTL, downloadBundleId 매칭, HMAC 저장·매칭 보조, UploadRow/Match 독립 PII scrub, READY / NEEDS_TRACKING_LINK / NEEDS_MALL_ORDER_INFO 기본 안내
> - **일부 구현**: 수동 등록 안내·요약 UI (상태별 안내 범위). §9 전체 화면 구상은 아님
> - **향후 설계 · 실측 보류**: EXC 양식 주입·택배 프로그램 왕복, 목록↔송장행 직접 연결 UI, 「API 전송 가능 / 수동 등록 / 확인 필요」 전체 분류 UI
>
> **기본 경로**: 다운로드 Bundle + WorkItem 출처 (택배사 프로그램·§8.2A 실측 **불필요**)
>
> **선택**: EXC 관리번호 round-trip (있으면 정확도↑, 없어도 동일 기능)
>
> **관련**
>
> - [order-sync-snapshot-db-design.md](./order-sync-snapshot-db-design.md)
> - [shipment-upload-matching-design.md](./shipment-upload-matching-design.md)
> - [order-sync-snapshot-persist-policy.md](./order-sync-snapshot-persist-policy.md)
> - [shipment-api-transmission-design.md](./shipment-api-transmission-design.md)

---

## 1. 문제

택배양식 다운로드에 **연동조회(API)** 와 **엑셀·텍스트** 주문이 섞일 수 있다.

택배사는 합친 **송장파일**을 돌려주고, 사용자는 **몰 관리자에 직접 올릴 건**을 구분하기 어렵다.

### 왜 택배사별 실측을 필수로 두지 않는가

엑클로드는 **다수 사용자가 임의의 택배사·양식**을 쓴다.

어느 프로그램을 쓸지 사전에 알 수 없고, 양식·반환 방식도 제각각이라 **모든 경우를 미리 시험할 수 없다.**

개발자가 택배 프로그램을 쓰지 않는 경우에도 동일하다.

따라서 **§8.2A(택배 프로그램에 EXC 넣고 왕복 확인)는 필수 선행조건에서 제외**한다.

| 기존(폐기) | 개정 |
|------------|------|
| EXC round-trip 필수 | **선택** (정확도 향상) |
| 택배사별 사전 검증 필수 | **하지 않음** |
| 관리번호 열 없는 양식 = 기능 불가 | **동일하게 사용 가능** |

---

## 2. 확정 결정

| # | 결정 |
|---|------|
| 1 | 기본 경로 = **CourierDownloadBundle + 전 행 WorkItem + 출처(API/EXCEL/TEXT)** |
| 2 | 송장 업로드 시 **최근 Bundle 연결** (1개면 자동, 여러 개면 사용자 선택). 1차: 송장파일 1건 ↔ Bundle 1건 |
| 3 | 매칭 우선순위: **EXC(있으면) → 주문번호 → 기존 송장 매칭 → (선택) 비교용 HMAC 지문**. 불확실하면 송장 연결 필요 |
| 4 | EXCEL/TEXT로 **다운로드 시 확정된** WorkItem은 송장 자동 연결 실패해도 목록에서 빼지 않음 → **수동 등록 · 송장 연결 필요** |
| 5 | `mallOrderNo`·`sourceMallLabel`·비교용 지문·WorkItem 전부 **14일 hard delete** |
| 6 | 기존 `OrderSyncBatchSourceType` **변경 없음**. WorkItem 전용 `API \| EXCEL \| TEXT` |
| 7 | API 행 WorkItem은 `orderSyncOrderId` **참조만** (주문 상세 중복 저장 금지) |
| 8 | 수취인명·전화·주소·상품·원본 JSON **평문 저장 금지**. 비교가 필요하면 **서버 비밀키 HMAC 지문만** (일반 해시 금지) |
| 9 | 전송 범위: 선택 건만 API 전송. 수동/확인 목록은 Bundle(+배치) 기준 |
| 10 | EXC 양식 주입: **향후·선택**. 무조건 `includeExcloadOrderNoInExport` ON 금지 |

---

## 3. 화면 분류 (전송·재업로드 후)

| 표시 | 구현 | 의미 |
|------|------|------|
| **API 전송 결과** | 기존 전송 UI | 성공·실패·이미 전송·제외. 일시 API 오류는 여기 |
| **수동 등록 준비됨** (`READY`) | **1차 구현** | EXCEL/TEXT + 쇼핑몰/주문정보 + 송장번호 연결 |
| **수동 등록 · 송장 연결 필요** (`NEEDS_TRACKING_LINK`) | **1차 구현** | EXCEL/TEXT 출처는 확실하나 송장 미연결 |
| **확인 필요** (`NEEDS_MALL_ORDER_INFO`) | **1차 구현** | 쇼핑몰/주문정보 자체 누락·불확실 |
| **수동 · API 전송 지원 예정** | **향후** | API 연동이나 송장전송 미지원 안내 (전체 분류 UI 일부) |

**금지**: 송장 미연결만으로 EXCEL/TEXT WorkItem을 「확인 필요」로 숨기기.

**금지**: `NO_LINKED_ORDER`만으로 수동 확정.

다운로드 직전/직후에도 요약 가능 (일부 구현):

> `API 주문 18건 · 수동 등록 대상 7건`

---

## 4. 데이터 모델 (1차 구현됨)

Prisma에 반영된 현재 필드만 적는다. 아래는 **구현됨**.

### 4.1 CourierDownloadBundle

| 필드 | 설명 |
|------|------|
| `id` | = downloadBundleId |
| `userId` | |
| `createdAt` / `expiresAt` | 생성+14일 |
| `rowCount` / `apiCount` / `manualCount` | 목록 UI용 집계 (PII 없음) |
| `courierTemplateLabel` | 선택. 사용자가 고른 양식 이름 정도 |
| `updatedAt` | |

### 4.2 CourierDownloadWorkItem

| 필드 | 필수 | 설명 |
|------|------|------|
| `id` | O | |
| `userId` | O | |
| `downloadBundleId` | O | FK |
| `excloadOrderNo` | O | opaque EXC. **내부 ID**. 양식 주입은 향후·선택 (round-trip 전제 아님) |
| `inputSource` | O | `API` \| `EXCEL` \| `TEXT` |
| `sourceMallKey` | △ | 내부 판정용(쇼핑몰 식별 코드/키). 표시용과 별도 |
| `sourceMallLabel` | △ | 엑셀·텍스트 표시용 |
| `mallOrderNo` | △ | 있으면 저장. 없으면 수동「준비됨」확정 어려움 → 송장 연결 필요/확인 |
| `orderSyncOrderId` | △ | API만. OrderSyncOrder 참조 |
| `matchFingerprintHmac` | △ | `buildMatchFingerprintHmac` 기반. 정규화 후 HMAC (서버 비밀키). 평문 아님 |
| `createdAt` / `expiresAt` | O | Bundle과 동일 정책 (now+14일) |
| `updatedAt` | O | |

**저장 금지**: 수취인명·전화·주소·상품·배송메모·원본 행 JSON·credential.

### 4.3 재다운로드

- 매번 **새 Bundle** + 행마다 **새 EXC**(내부 ID).
- 이전 Bundle은 **각자 expiresAt까지 유지** (옛 송장파일·옛 목록 연결용).
- 새 Bundle은 새로 14일.

### 4.4 기존 enum

`OrderSyncBatchSourceType` 유지. WorkItem `inputSource`는 별도 enum (`CourierDownloadWorkItemSource`).

---

## 5. 흐름

### 5.1 택배양식 다운로드

1. **실제 택배양식 파일 생성/다운로드가 성공한 시점에만** Bundle 생성 (미리보기 단계에서 서버 persist 금지)
2. 행마다 WorkItem: 출처·몰 표시명·주문번호·(API면) orderSyncOrderId·HMAC 지문·EXC(내부)
3. API 행은 기존 `from-download` 스냅샷 유지 + WorkItem이 Order 참조
4. 엑셀·텍스트는 **WorkItem만** (기존 「엑셀 주문 본문 DB 미저장」과 정합 — PII 평문 없음)
5. (향후·선택) 양식에 검증된 관리번호 열이 있으면 EXC 기입. 없어도 기능 동일. 경고만 가능

### 5.2 송장파일 업로드 — Bundle 연결

1. 사용자 기준 **미만료 Bundle** 목록
2. **1개**면 화면에서 자동 선택하되, 사용자가 **확인/변경/다른 Bundle 선택** 또는 **해당 다운로드 없음**을 선택할 수 있어야 함
3. **여러 개** → UI에서 선택

   예: `7월 21일 14:30 택배양식 다운로드 · 총 25건 (API 18 · 수동 7)`
4. 1차: **송장 업로드 배치 1개 ↔ Bundle 1개**이며, 사용자가 선택/확정한 뒤에만 `ShipmentUploadBatch.downloadBundleId`로 연결

### 5.3 행 연결 우선순위

```
1) 송장 행에 EXC 있고 유효 WorkItem → 출처·주문 확정 (선택 경로)
2) 주문번호로 Bundle 내 WorkItem / OrderSync 매칭(단일 후보일 때만 자동 확정; 중복/분할배송 가능성이 있으면 송장 연결 필요)
3) 기존 송장 매칭 알고리즘 (API 스냅샷)
4) HMAC 지문 비교 — 평문 PII 재저장 없이 (1차: 저장·매칭 보조 구현됨)
5) 불확실 → 송장 연결 필요 또는 확인 필요
```

EXC 없음 ≠ API 매칭 실패. 기존 API 매칭이 확정되면 **API 전송 후보**.

송장번호는 필요한 경우 보조 연결에 쓴다.

### 5.4 수동 목록 산출

Bundle에 `inputSource ∈ {EXCEL, TEXT}` 인 WorkItem을 **항상** 수동 영역으로 올린다.

| 송장 연결 | 표시 | 구현 |
|-----------|------|------|
| 쇼핑몰/주문정보 + 주문번호·송장번호 확보 | 수동 등록 준비됨 | 1차 |
| 출처만 확실, 송장 미연결 | 수동 등록 · 송장 연결 필요 | 1차 |
| 쇼핑몰/주문정보 자체 누락(또는 다의적) | 확인 필요(쇼핑몰/주문정보 확인 필요) | 1차 |

사용자가 목록과 송장행을 **직접 연결**하는 UI는 한계 상황용 — **향후**.

### 5.5 불가피한 한계

결과파일에 주문번호·전화·수취인·주소·관리번호 등 **연결 가능한 값이 전혀 없으면** 자동 대응 불가.

그때만 수동 목록 ↔ 송장행 수동 연결(향후 UI).

---

## 6. 비교용 HMAC 지문

- 목적: 송장 행과 WorkItem을 **평문 PII 없이** 보조 매칭
- 방법: 정규화된 전화/수취인/주소 등 → **HMAC(서버 비밀키, …)** (`buildMatchFingerprintHmac`)
- **일반 SHA 해시 금지** (전화번호 대입 추측)
- 익명정보로 취급하지 않음 → **14일 삭제**
- **1차 구현 완료**: 다운로드 시 저장·매칭 보조에 사용. 주문번호·기존 매칭이 기본 경로이고 HMAC은 보조

---

## 7. TTL · PII

| 대상 | 정책 | 구현 |
|------|------|------|
| Bundle / WorkItem / mallOrderNo / HMAC | 14일 hard delete | 1차 |
| OrderSyncOrder | 기존 snapshot 정책 유지 | 별도 문서 |
| ShipmentUploadRow | 연결 무관, 업로드+14일 PII·`rawRowJson` 정리 | **1차** (`scrubExpiredShipmentUploadPii`) |
| ShipmentMatch | 연결 무관, 동일 기간 `candidateOrdersJson`·`mismatchFieldsJson` 정리 | **1차** (동일 scrub) |
| ShipmentUploadBatch | FK·Attempt 확인 후 삭제 또는 비식별 메타 | 정책 유지 |
| Attempt | 최소 결과만 (기존 sanitize) | 기존 |

---

## 8. EXC round-trip (선택·비필수 · 향후)

### 8.1 위치

기본 동작에 **포함하지 않음**.

양식에 공식 관리번호 열이 있고, 나중에 실사용자가 왕복을 확인해 주면 **정확도 향상**으로만 켠다.

판매자 계정·택배 프로그램 부재로 **§8.2A 실측은 보류**.

### 8.2 참고용 QA (필수가 아님)

실사용자가 있을 때만:

1. 공식 관리번호 열에 `EXC-RT-001` (코드 전이면 수동 기입)
2. 업로드 → 결과에서 반환·변형 여부

판정: 가능 후보 / 부분 / 미지원 후보.

**미실시여도 제품 출시에 막히지 않음.**

---

## 9. UI 구상

| 항목 | 구현 |
|------|------|
| 다운로드 후/전송 전 Bundle 요약 (API vs 수동 건수) | **일부** |
| 송장 업로드 Bundle 선택(복수일 때) | **일부** |
| 전송 후: 방금 전송 결과 (A + B열) + 수동 3상태 + 확인 필요 | **일부** (수동 3상태·요약 안내) |
| 1차 수동 엑셀: 공통 확인 목록 (몰·주문번호·택배사·송장·사유). 몰별 양식은 2차 | **향후** |
| 체크박스 사전 비활성 **안 함** | 정책 유지 |
| 목록↔송장행 직접 연결 UI | **향후** |
| 「API 전송 가능 / 수동 등록 / 확인 필요」 전체 분류 UI | **향후** |

---

## 10. 구현 순서 · 현재 반영

| # | 항목 | 상태 |
|---|------|------|
| 1 | Prisma: Bundle + WorkItem + TTL + fingerprint 컬럼 | **1차 완료** |
| 2 | 다운로드 시 Bundle/WorkItem 생성 (엑셀·텍스트 포함, PII 평문 없음) | **1차 완료** |
| 3 | 송장 업로드: Bundle 연결 + §5.3 매칭 (주문번호·기존·HMAC 보조) | **1차 완료** |
| 4 | 수동 목록: READY / NEEDS_TRACKING_LINK / NEEDS_MALL_ORDER_INFO 기본 안내 | **1차 완료** (안내 범위) |
| 5 | UploadRow/Match 독립 TTL scrub | **1차 완료** |
| 6 | HMAC 저장·매칭 보조 (`buildMatchFingerprintHmac`) | **1차 완료** |
| 7 | EXC 양식 주입 · 실사용자 왕복 · 매칭 우선순위 추가 보완 | **향후** |
| 8 | 목록↔송장행 직접 연결 UI · 전체 분류 UI | **향후** |

**이번 문서 기준**: 1차 기반은 코드에 반영됨. 후속은 EXC 양식 주입·택배 프로그램 왕복 실측(보류)·UI 확장.

---

## 11. 레포 대조 (구현 상태)

| 항목 | 상태 | 비고 |
|------|------|------|
| 택배양식 다운로드 시 Bundle·행별 WorkItem 저장 | **1차 완료** | 엑셀·텍스트도 WorkItem만 (PII 평문 없음) |
| API / EXCEL / TEXT 출처 구분 | **1차 완료** | `inputSource` |
| API 주문의 OrderSyncOrder 참조 | **1차 완료** | `orderSyncOrderId` + from-download 스냅샷 |
| 주문번호·14일 `expiresAt` | **1차 완료** | |
| `downloadBundleId` 기반 후보 매칭 | **1차 완료** | |
| HMAC 저장·매칭 보조 | **1차 완료** | `buildMatchFingerprintHmac` |
| UploadRow/Match 독립 PII scrub | **1차 완료** | |
| READY / NEEDS_TRACKING_LINK / NEEDS_MALL_ORDER_INFO | **1차 완료** | 기본 수동 안내 |
| 수동 등록 안내·요약 UI | **일부 구현** | 상태별 안내·요약. 전체 분류 화면 아님 |
| API persist (from-download) | **유지** | WorkItem이 Order 참조 |
| EXC 양식 주입 | **향후** | 선택. EXC 없어도 주문번호 중심 동작 |
| §8.2A 택배 프로그램 왕복 실측 | **실측 보류** | 판매자 계정·프로그램 부재. **필수 아님** |
| 목록↔송장행 직접 연결 UI | **향후** | |
| 「API 전송 가능 / 수동 등록 / 확인 필요」 전체 분류 UI | **향후** | |

---

## 12. 한 줄

**다운로드 때 이미 아는 출처로 Bundle/WorkItem을 만들고, 송장파일은 주문번호·기존 매칭·(선택) EXC/HMAC으로만 붙인다.**

택배사 실측·프로그램 연동 없이도 기본 수동 등록 안내가 가능하며, EXC 왕복·전체 분류 UI는 나중 선택이다.
