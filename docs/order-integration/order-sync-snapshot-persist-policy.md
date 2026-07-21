# 주문 스냅샷 DB — 저장 시점 정책 (확정)

> 상태: **관련 코드 구현 완료** (2026-07-21). Production에서는 `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED`를 **OFF**로 유지. Production 활성화·실계정 검증은 **아직 하지 않음**.
> 관련: 송장 매칭·전송, `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED`

## 원칙

OrderSync DB는 **주문 원장이 아니라**, 엑클로드에서 택배로 출고한 뒤 **송장파일 매칭·쇼핑몰 전송**에 쓰는 **임시 작업 저장소**다.

## 저장 시점

| 동작 | DB 저장 |
|------|---------|
| 주문조회만 | **안 함** |
| 미리보기 확인·담기 | **안 함** |
| **택배 업로드 양식 다운로드** | **이 때**, `from-download` 경로로 다운로드에 포함된 **연동 주문만** |
| 허브 엑셀/텍스트만 | 연동 메타 없으면 **안 함** |

주문조회·미리보기만으로는 snapshot을 저장하지 않는다. `maybePersistOrderFetchResult`는 **의도적 no-op**(항상 미저장). fetch 라우트가 flag 값을 넘기더라도 **조회 단계에서 저장된다는 뜻이 아니다**. 실제 저장은 택배양식 다운로드의 **`from-download`** 에서만 수행한다.

## 보관·삭제

| 항목 | 정책 |
|------|------|
| TTL | 다운로드 성공 시각 + **14일** (`expiresAt`) |
| 재다운로드 | 동일 주문키 **upsert** + `expiresAt`·`lastCourierDownloadAt` 갱신 |
| 만료 | 일 1회 cron **hard delete** (`/api/cron/purge-order-sync-snapshots`) |
| 전송 완료 시 PII | 주문에 연결된 전송 대상 Match가 **모두 `SENT` 또는 `SKIPPED`** 일 때만 수취인 PII 삭제 (`piiClearedAt`). 부분 전송·실패·대기(NONE/READY/FAILED 등)가 남아 있으면 **정리하지 않음** |
| cron 보완 | `SENT`인데 `piiClearedAt` null 인 행도 위와 동일 조건으로 PII 삭제 |
| rawPayload | 운영 저장 안 함 |

## 다운로드와 저장 실패

| flag | 저장 결과 | 택배양식 다운로드 |
|------|-----------|-------------------|
| OFF | 시도 안 함 | 허용 |
| ON | 성공/중복 upsert | 허용 |
| ON | 실패 | **중단** |

## Production 활성화 순서

1. migration `20260721040000_order_sync_snapshot_ttl_pii` 적용 (스테이징→운영)
2. 코드 배포 (flag 없이) — `build:vercel`에 `prisma migrate deploy` 포함
3. cron 스케줄·`CRON_SECRET` 확인
4. 제한 계정 점검
5. **마지막에** `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED=true` (`=== 'true'`만 활성)

**지금은 Production flag를 켜지 않는다.** (코드는 반영됨 · 운영 활성화·실계정 검증은 미실시)

## 검증에서 고친 위험 (2026-07-21)

| 이슈 | 조치 |
|------|------|
| 부분 전송(SENT+NONE)인데 주문 요약이 SENT | 요약·PII 삭제 조건 모두 **전 Match SENT\|SKIPPED** 일 때만 완료 |
| SENT 재다운로드 시 PII 복원 | upsert 시 SENT/PII삭제 주문은 **TTL만 연장**, 수취인·piiClearedAt 복원 금지 |
| 연관 PII | 전송 완료 시 Match 후보JSON·UploadRow·Attempt responseSummary 정리 + cron 보완 |
| 만료 삭제 FK | Match/Attempt `orderSyncOrderId` **SetNull** — 전송 이력 행 유지 |
| flag | `=== 'true'` 엄격 비교 유지 |
