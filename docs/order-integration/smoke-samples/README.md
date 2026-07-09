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

---

## 사용 방법

1. smoke test **전용 계정**으로 로그인합니다.
2. `shipment-upload-smoke-orders.md`를 참고해 **테스트 전용** snapshot 5건을 준비합니다.  
   (실제 DB insert·Prisma seed·env 변경은 **이 문서 범위 밖** — 별도 승인 후 수동 또는 기존 snapshot persist 절차 사용)
3. 업로드 scope를 문서의 `provider` / `integrationAccountId`와 맞춥니다.
4. `shipment-upload-smoke-file.csv`를 `/order/integration/shipments`에서 업로드합니다.
5. runbook §5 UI 순서대로 확정·제외·연결·다운로드를 검증합니다.

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
- `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED` 임의 변경
- 쇼핑몰 API 송장전송 호출
- env / schema / migration 변경

---

## 관련 문서

- [shipment-upload-export-smoke-test-runbook.md](../shipment-upload-export-smoke-test-runbook.md)
- [shipment-upload-matching-design.md](../shipment-upload-matching-design.md)
