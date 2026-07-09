# 송장 업로드·export smoke test — 결과 보고서 템플릿 (D-4h-6)

> **상태**: 결과 보고서 **템플릿** (2026-07-10) — **실행 결과 미기록**  
> **단계**: D-4h-6  
> **용도**: [D-4h-4 smoke 실행](./shipment-upload-export-smoke-execution-runbook.md) 완료 후 PASS/FAIL을 **일관된 형식**으로 기록  
> **관련 문서**  
> - [shipment-upload-export-smoke-execution-runbook.md](./shipment-upload-export-smoke-execution-runbook.md) — D-4h-4  
> - [shipment-upload-export-smoke-cleanup-runbook.md](./shipment-upload-export-smoke-cleanup-runbook.md) — D-4h-5  
> - [shipment-upload-export-smoke-readiness-report.md](./shipment-upload-export-smoke-readiness-report.md) — D-4g (실행 전 점검)  
> - [smoke-samples/README.md](./smoke-samples/README.md) — D-4e  
> - [smoke-samples/shipment-upload-smoke-file.csv](./smoke-samples/shipment-upload-smoke-file.csv)

**본 문서는 템플릿입니다.**  
실제 smoke test를 **실행하지 않았으며**, 아래 값은 **placeholder**·체크박스·선택란입니다.  
실행 담당자가 D-4h-4 완료 후 **본 파일을 복사**하거나 **별도 결과 문서**에 채워 넣으세요.

**기록 범위**  
- 송장파일 **업로드** → **매칭** → **확정/제외/연결** → **READY** → **xlsx 다운로드**

**기록 범위 아님**  
- 쇼핑몰 API **송장전송** 결과  
- 외부 쇼핑몰 관리자 업로드 자동화

---

## 1. 목적

| 항목 | 설명 |
|------|------|
| 무엇을 | D-4 smoke test **실행 결과**를 팀·이력용으로 기록 |
| 왜 | PASS/FAIL·실패 원인·보안 확인·cleanup 연계를 **표준 형식**으로 남김 |
| 무엇이 아님 | 송장전송 결과, 실제 smoke 실행 (→ D-4h-4) |

---

## 2. 실행 정보

| 항목 | 값 |
|------|-----|
| **실행일** | `YYYY-MM-DD` |
| **실행자** | `<실행자 이름 또는 이니셜>` |
| **브랜치** | `<예: main>` |
| **커밋 해시** | `<예: 24e62ac>` |
| **테스트 DB 이름** | `<예: excload-smoke-test>` |
| **env 파일명** | `<예: .env.smoke.local>` |
| **smoke `userId`** | `<SMOKE_USER_ID>` |
| **`provider`** | `COUPANG` |
| **`integrationAccountId`** | `acc-smoke-test-001` |
| **샘플 CSV 경로** | `docs/order-integration/smoke-samples/shipment-upload-smoke-file.csv` |
| **실행 runbook** | [execution-runbook](./shipment-upload-export-smoke-execution-runbook.md) |
| **`uploadBatchId`** (실행 후 기록) | `<UPLOAD_BATCH_ID>` |

---

## 3. 실행 전 상태

실행 **직전** 확인 (체크 후 실행):

| # | 항목 | 확인 |
|---|------|------|
| P1 | [D-4h-2 setup](./shipment-upload-export-test-db-setup-runbook.md) 완료 | ☐ |
| P2 | [D-4h-3 insert](./shipment-upload-export-smoke-data-insert-runbook.md) 완료 | ☐ |
| P3 | `OrderIntegrationAccount` **1건** (`acc-smoke-test-001`, `COUPANG`) | ☐ |
| P4 | `OrderSyncOrder` **5건** (`TEST-MALL-ORDER-001`~`005`) | ☐ |
| P5 | 샘플 CSV **5행** (+ 헤더) | ☐ |
| P6 | 연결 DB = **운영 DB와 분리** (테스트 DB만) | ☐ |
| P7 | **송장전송 기능·외부 쇼핑몰 API 호출 없음** (앱·env 확인) | ☐ |

**메모**: `<실행 전 특이사항 없음 / 있으면 기록>`

---

## 4. UI smoke 결과

**진입 경로**: `/order/integration/shipments`  
**계정**: smoke 전용 NextAuth 로그인

| # | 항목 | PASS | FAIL | 메모 |
|---|------|:----:|:----:|------|
| U1 | `/order/integration/shipments` 접속 | ☐ | ☐ | |
| U2 | 샘플 CSV 업로드 (`COUPANG` / `acc-smoke-test-001`) | ☐ | ☐ | |
| U3 | `ShipmentUploadBatch` 생성 (`uploadBatchId` 기록) | ☐ | ☐ | `batchId`: `<UPLOAD_BATCH_ID>` |
| U4 | match **5건** 생성 (업로드 행 수) | ☐ | ☐ | |
| U5 | **confirm 3건** (행 001, 002, 005) | ☐ | ☐ | |
| U6 | **link 1건** (행 003, `NOT_MATCHED` → 주문 연결) | ☐ | ☐ | |
| U7 | **exclude 1건** (행 004) | ☐ | ☐ | |
| U8 | `batchStatus` → **`READY`** | ☐ | ☐ | |
| U9 | 「쇼핑몰 업로드용 엑셀 다운로드」 버튼 **활성화** | ☐ | ☐ | |
| U10 | xlsx **다운로드 성공** | ☐ | ☐ | 파일명: `<다운로드 파일명>` |

**UI 부정 확인**

| 항목 | 확인 |
|------|------|
| 쇼핑몰 송장전송 API 호출 **없음** | ☐ |
| 외부 주문/배송 API 호출 **없음** | ☐ |
| 「아직 쇼핑몰에 송장전송되지 않습니다」 등 안내 표시 | ☐ |

---

## 5. API smoke 결과

NextAuth 세션 필요. `batchId` = `<UPLOAD_BATCH_ID>`, `matchId` = 실행 시 기록.

| # | API | 기대 status | 실제 status | PASS | FAIL | 메모 |
|---|-----|---------------|-------------|:----:|:----:|------|
| A1 | `POST /api/order/integration/shipments/uploads` | **200** | `< >` | ☐ | ☐ | `uploadBatchId` 수신 |
| A2 | `GET /api/order/integration/shipments/uploads/:batchId` | **200** | `< >` | ☐ | ☐ | 마스킹 필드 확인 |
| A3 | `POST .../matches/:matchId/confirm` | **200** | `< >` | ☐ | ☐ | 3회 (001, 002, 005) |
| A4 | `POST .../matches/:matchId/exclude` | **200** | `< >` | ☐ | ☐ | 1회 (004) |
| A5 | `GET .../linkable-orders?q=...&limit=30` | **200** | `< >` | ☐ | ☐ | PII 마스킹 |
| A6 | `POST .../matches/:matchId/link` | **200** | `< >` | ☐ | ☐ | 1회 (003) |
| A7 | `GET .../export?format=xlsx` | **200** | `< >` | ☐ | ☐ | blob·`Content-Disposition` |

**선택 부정 테스트** (실행 시 기록)

| API | 기대 | 실제 | PASS | FAIL | 메모 |
|-----|------|------|:----:|:----:|------|
| `GET .../export?format=xlsx` (READY **전**) | **409** | `< >` | ☐ | ☐ | 선택 |

상세 status·오류: [D-4d smoke-test-runbook](./shipment-upload-export-smoke-test-runbook.md) §6·§7.

---

## 6. 다운로드 파일 검증 결과

xlsx 파일을 열어 수동 확인 후 기록:

| # | 항목 | 기대 | 실제 | PASS | FAIL | 메모 |
|---|------|------|------|:----:|:----:|------|
| F1 | **파일명** | `excload-shipment-upload-{batchId}.xlsx` 또는 `Content-Disposition` 값 | `< >` | ☐ | ☐ | |
| F2 | **시트 수** | provider/account 그룹별 1시트 이상 (단일 그룹이면 **1**) | `< >` | ☐ | ☐ | |
| F3 | **컬럼 8개** 존재 | 쇼핑몰, 연동계정ID, 쇼핑몰주문번호, 엑클로드관리번호, 택배사, 송장번호, 매칭ID, 주문스냅샷ID | ☐ / ☐ | ☐ | ☐ | |
| F4 | **export row 4건** | exclude(004) 제외 | `< >` | ☐ | ☐ | |
| F5 | **EXCLUDED** (`TEST-MALL-ORDER-004`) | **미포함** | ☐ / ☐ | ☐ | ☐ | |
| F6 | 송장번호 `000123456789` (**005** 행) | 앞자리 **`0` 보존** | `< >` | ☐ | ☐ | |
| F7 | 수취인명·전화·주소 | **컬럼 없음** | ☐ / ☐ | ☐ | ☐ | |
| F8 | raw JSON (`rawRowJson` 등) | **없음** | ☐ / ☐ | ☐ | ☐ | |

---

## 7. 보안/개인정보 확인

| # | 항목 | 확인 |
|---|------|------|
| S1 | API/UI 응답에 `rawRowJson` **미노출** | ☐ |
| S2 | API/UI 응답에 `candidateOrdersJson` **미노출** | ☐ |
| S3 | export row / xlsx에 **원본 JSON 컬럼 미노출** | ☐ |
| S4 | UI·네트워크 탭 로그에 **PII 원문 없음** | ☐ |
| S5 | 서버 로그에 **PII 원문 없음** | ☐ |
| S6 | 다운로드 xlsx에 **PII 없음** (수취인·전화·주소) | ☐ |
| S7 | **쇼핑몰 API 호출 없음** | ☐ |
| S8 | **송장전송 없음** | ☐ |

**PII 노출 발견 시**: 즉시 **중단**·보고. §8 실패 기록 후 재실행 전 원인 조치.

---

## 8. 실패 기록

실패 **없음**이면 「해당 없음」으로 표시.

| 필드 | 내용 |
|------|------|
| **실패 단계** | `<예: 업로드 / confirm / link / export / 파일 검증>` |
| **`batchId`** | `<UPLOAD_BATCH_ID>` |
| **`matchId`** | `<해당 시>` |
| **HTTP status** | `<예: 409>` |
| **오류 메시지** | `<UI 또는 API error>` |
| **재현 절차** | `<env·CSV·처리 순서>` |
| **스크린샷 경로** | `<예: docs/.../screenshots/... 또는 첨부 위치>` |
| **중단 여부** | ☐ 예 / ☐ 아니오 |
| **후속 조치** | `<버그 티켓·문서 수정·재실행 일정>` |

**추가 실패 건** (필요 시 행 복제):

| # | 실패 단계 | status | 메모 |
|---|-----------|--------|------|
| 2 | `< >` | `< >` | `< >` |

---

## 9. 최종 판정

**하나만 선택** (실행 후):

| 판정 | 선택 | 기준 |
|------|:----:|------|
| **PASS** | ☐ | §4·§5·§6 기대 결과 **모두** 충족, §7 보안 이슈 없음 |
| **PARTIAL PASS** | ☐ | 핵심 흐름(업로드→READY→다운로드) **통과**, 경미한 UI/문서/비핵심 항목 보완 필요 |
| **FAIL** | ☐ | 핵심 흐름 **실패** (업로드·확정/연결/제외·READY·export 중 단계 실패) |
| **BLOCKED** | ☐ | 환경·데이터·권한 문제로 smoke **완료 불가** (테스트 DB·insert·userId 등) |

**판정 요약** (1~3문장):  
`<실행 후 작성>`

**기대 수치 요약** (PASS 시 참고)

| 항목 | 기대 |
|------|------|
| match | 5건 |
| confirm | 3건 |
| link | 1건 |
| exclude | 1건 |
| `batchStatus` | `READY` |
| export rows | 4건 |

---

## 10. cleanup 계획

[D-4h-5 cleanup runbook](./shipment-upload-export-smoke-cleanup-runbook.md) 연계:

| 항목 | 값 |
|------|-----|
| cleanup runbook 실행 여부 | ☐ 예 / ☐ 아니오 / ☐ 보류 |
| cleanup **승인자** | `<이름>` |
| cleanup **실행일** | `YYYY-MM-DD` |
| 삭제 대상 count (실행 전 read-only) | Match `< >` / Row `< >` / UploadBatch `< >` / Order `< >` / Account `< >` |
| cleanup **후 확인** | smoke scope row **0건** | ☐ |
| cleanup runbook | [cleanup-runbook](./shipment-upload-export-smoke-cleanup-runbook.md) |

**메모**: `<cleanup 미실행 사유 / 보류 사유>`

---

## 11. 다음 단계

| 항목 | 내용 |
|------|------|
| **D-4 완료 판정** | smoke 결과 + cleanup 완료 후 Phase D-4 종료 여부 결정 |
| **provider별 업로드 양식 고도화** | smoke PASS 후 검토 |
| **사용자 안내 문구 개선** | UI copy·오류 메시지 |
| **API 송장전송** | **별도 Phase** — 본 smoke/cleanup과 **분리·보류** |

**권장 문서 흐름**

```
D-4h-4 실행  →  본 템플릿 작성(결과 기록)  →  D-4h-5 cleanup  →  D-4 최종 판정
```

---

## 부록 — 문서 흐름 (D-4h)

| 단계 | 문서 |
|------|------|
| D-4h-4 | [execution-runbook](./shipment-upload-export-smoke-execution-runbook.md) |
| D-4h-5 | [cleanup-runbook](./shipment-upload-export-smoke-cleanup-runbook.md) |
| D-4h-6 | **본 템플릿** |
| D-4g | [readiness-report](./shipment-upload-export-smoke-readiness-report.md) (실행 **전**) |

**사용 방법**  
1. D-4h-4 실행 완료 후 본 템플릿을 복사해 `shipment-upload-export-smoke-result-YYYYMMDD.md` 등으로 저장 (팀 정책에 따름).  
2. placeholder·체크박스를 **실제 값**으로 채움.  
3. PASS/FAIL과 §8·§10을 기록한 뒤 cleanup·D-4 최종 판정 진행.
