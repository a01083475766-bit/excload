# 송장 업로드 smoke test 샘플 데이터

> **상태**: 테스트용 더미 데이터 (2026-07)  
> **용도**: [shipment-upload-export-smoke-test-runbook.md](../shipment-upload-export-smoke-test-runbook.md) (D-4d) 실행 시 참고  
> **주의**: 실제 개인정보·운영 주문번호가 **아닙니다**. DB seed·자동 insert 스크립트는 제공하지 않습니다.

---

## 포함 파일

| 파일 | 설명 |
|------|------|
| [shipment-upload-smoke-orders.md](./shipment-upload-smoke-orders.md) | 테스트용 `OrderSyncOrder` snapshot 예시 5건 (수동 준비용) |
| [shipment-upload-smoke-file.csv](./shipment-upload-smoke-file.csv) | 송장파일 업로드용 샘플 CSV (데이터 5행) |
| [bundle-match-recheck-orders.tsv](./bundle-match-recheck-orders.tsv) | Bundle/매칭 재검증용 **가상** 주문 TSV (4건) |
| [bundle-match-recheck-orders.txt](./bundle-match-recheck-orders.txt) | 동일 가상 주문의 텍스트 붙여넣기 형식 |
| [bundle-match-recheck-invoice.csv](./bundle-match-recheck-invoice.csv) | 동일 주문에 맞춘 **가상** 송장 업로드 CSV (4건) |

---

## Bundle/매칭 재검증 샘플 (`bundle-match-recheck-*`)

- **목적**: 수동으로 허브에 주문(TSV/텍스트) → 택배 다운로드 Bundle → 송장 CSV 업로드 매칭을 확인한 뒤, DB 읽기 전용 스크립트로 결과를 점검합니다.
- **데이터**: 세 파일 모두 **완전한 가상 데이터**입니다 (`VIRT-ORD-*`, `가상수령인*`, `가상몰*`). 실제 주문·개인정보가 아닙니다.
- **관련 스크립트**: `scripts/verify-bundle-match-browser-recheck.mjs`
  (브라우저를 실행하지 않음. UI 수동 작업 후 TEST DB를 읽기만 함)
- **실행 전 필수**
  - `.env.smoke.local`에 `ALLOW_TEST_DB_MUTATION=true`를 **사용자가 명시**
  - DATABASE_URL / DIRECT_URL이 **명확한 TEST DB**일 것 (Production 참조 금지)
  - 수동 UI는 **localhost(또는 127.0.0.1)** 로컬 앱에서만
- **금지**: 운영 DB·`excload.com` 등 Production URL에서 샘플 업로드/스크립트 실행
- **DB 점검 명령** (preflight 통과 후에만):

```bash
node scripts/verify-bundle-match-browser-recheck.mjs
node scripts/verify-bundle-match-browser-recheck.mjs --since-minutes=30
```

---

## 사용 방법

1. smoke test **전용 계정**으로 **로컬** 앱에 로그인합니다.
2. `shipment-upload-smoke-orders.md`를 참고해 **테스트 전용** snapshot 5건을 준비합니다.  
   (실제 DB insert·Prisma seed·env 변경은 **이 문서 범위 밖** — 별도 승인 후 수동 또는 기존 snapshot persist 절차 사용)
3. 업로드 scope를 문서의 `provider` / `integrationAccountId`와 맞춥니다.
4. `shipment-upload-smoke-file.csv`를 `/order/integration/shipments`에서 업로드합니다.
5. runbook §5 UI 순서대로 확정·제외·연결·다운로드를 검증합니다.

### Bundle/매칭 재검증 흐름 (요약)

1. 로컬에서 `bundle-match-recheck-orders.tsv` 또는 `.txt`로 주문 미리보기·다운로드 Bundle을 만듭니다.
2. `bundle-match-recheck-invoice.csv`를 송장 업로드에 사용합니다.
3. `.env.smoke.local` 조건을 맞춘 뒤 `verify-bundle-match-browser-recheck.mjs`로 DB를 점검합니다.

---

## CSV 헤더 안내

권장 컬럼명과 파서 별칭 매핑:

| 샘플 권장명 | 샘플 CSV 헤더 | 비고 |
|-------------|---------------|------|
| 주문번호 | `주문번호` | `mallOrderNo` |
| 수취인명 | `받는분` | 파서 별칭 — `수취인명`은 미지원, `받는분`/`수취인` 사용 |
| 수취인전화 | `수취인전화` | |
| 수취인주소 | `수취인주소` | |
| 택배사 | `택배사` | |
| 송장번호 | `송장번호` | 앞자리 `0` 보존 검증 포함 |

인코딩: **UTF-8** (BOM 없음)

---

## 금지 사항

- 실제 운영 주문번호·전화번호·주소·이름 사용
- Production DB에 넣는 seed script / Prisma seed 작성
- `excload.com` 등 운영 URL·운영 DB에서 smoke/재검증 실행
- `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED` 임의 변경
- 쇼핑몰 API 송장전송 호출
- env / schema / migration 변경

---

## 관련 문서

- [shipment-upload-export-preflight-checklist.md](../shipment-upload-export-preflight-checklist.md) — 실행 전 preflight (D-4f)
- [shipment-upload-export-smoke-test-runbook.md](../shipment-upload-export-smoke-test-runbook.md)
- [shipment-upload-matching-design.md](../shipment-upload-matching-design.md)
