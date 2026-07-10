# 주문조회 실연동 준비 체크리스트 (계정 준비 후)

> **상태**: D-5f 준비 문서 (2026-07-10)  
> **목적**: 판매자 계정/API 키가 **아직 없어도** 환경을 갖춰 두고, 값이 생기면 **저장 → test → fetch-orders → snapshot → D-4 매칭**까지 바로 검증  
> **관련**  
> - [snapshot-persist-smoke-test.md](./snapshot-persist-smoke-test.md)  
> - [shipment-upload-export-smoke-test-runbook.md](./shipment-upload-export-smoke-test-runbook.md)  
> - `.env.smoke.local.example`  
> - `scripts/check-order-sync-realtest-env.mjs`

**이 문서 작성·점검 단계에서 하지 않는 것**: 외부 쇼핑몰 API 호출, 실제 credential 입력, 운영 DB 접근, migration, smoke 재실행.

**검증 범위 아님**: 쇼핑몰 API **송장전송** (별도 Phase).

---

## 0. 권장 provider

| 순위 | Provider | 이유 |
|------|----------|------|
| **1** | **쿠팡** | 프록시 없이 direct test/fetch 가능, HMAC 키만 있으면 됨 |
| 2 | 스마트스토어 | `INTEGRATION_PROXY_*` + IP 화이트리스트 + OAuth 토큰 추가 의존 |

---

## 1. 계정 준비 후 필요한 값 (어디에 넣나)

### 1.1 env (`.env.smoke.local`만 — 운영 `.env` 금지)

| 키 | 용도 |
|----|------|
| `DATABASE_URL` / `DIRECT_URL` | **테스트 DB만** (ref `qejjcjwbnxhmhcgwrbvt`) |
| `NEXTAUTH_*` | 로컬 로그인 |
| `EXCLOAD_INTEGRATION_ENCRYPTION_KEY` | UI 자격증명 암호화 저장 |
| `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED=true` | fetch 후 snapshot DB 저장 ON |
| (스마트스토어 시) `INTEGRATION_PROXY_BASE_URL` + `SHARED_SECRET` | 프록시 필수 |

### 1.2 UI에만 넣는 값 (env에 넣지 말 것)

**쿠팡** (`CoupangIntegrationForm`)

| 필드 | 설명 |
|------|------|
| 계정명 | `accountName` |
| 업체코드 | `vendorId` |
| Access Key | `accessKey` |
| Secret Key | `secretKey` |
| API 키 만료일 | `expiresAt` (선택) |

**스마트스토어** (`SmartstoreIntegrationForm`)

| 필드 | 설명 |
|------|------|
| 계정명 | `accountName` |
| Client ID | `clientId` |
| Client Secret | `clientSecret` |
| authType | UI 고정 `SELF` |

저장 위치: DB `OrderIntegrationAccount` (AES-GCM 암호문). **secret 평문은 로그/채팅에 붙이지 말 것.**

---

## 2. API 경로 (관리자 세션 필요)

| 단계 | 쿠팡 | 스마트스토어 |
|------|------|--------------|
| 저장 | `POST /api/order/integration/coupang/save` | `POST /api/order/integration/smartstore/save` |
| 연결 테스트 | `POST /api/order/integration/coupang/test` | `POST /api/order/integration/smartstore/test` |
| 주문조회 | `POST /api/order/integration/coupang/fetch-orders` | `POST /api/order/integration/smartstore/fetch-orders` |
| 조회/삭제 | `GET`/`DELETE /api/order/integration/coupang` | 동명 `…/smartstore` |

UI 버튼이 위 API를 호출합니다. body는 save만 자격증명 포함; test/fetch는 저장된 계정 사용.

---

## 3. 계정 생겼을 때 실행 순서 (쿠팡 권장)

### A. 환경 (계정 전에도 가능)

1. `.env.smoke.local.example` → `.env.smoke.local` 복사  
2. 테스트 DB URL·`EXCLOAD_INTEGRATION_ENCRYPTION_KEY`·NextAuth·관리자 설정 채움  
3. `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED=true` 확인  
4. 안전 점검:

```bash
node scripts/check-order-sync-realtest-env.mjs
```

- 운영 ref `xtlgtphceakmzmtqihnn` 나오면 **즉시 중단**  
- 테스트 ref `qejjcjwbnxhmhcgwrbvt` 확인  

5. 테스트 DB로만 기동:

```bash
# PowerShell 예시 — 운영 .env 로드하지 않도록 smoke env만 사용
# (팀에서 쓰는 방식에 맞게 dotenv / 복사 후 기동)
npm run dev
```

### B. 자격증명 (계정 준비 후)

6. 관리자 계정으로 로그인  
7. 쿠팡 연동 UI에서 값 입력 → **저장**  
8. **연결 테스트** 버튼 → 성공 확인  
9. **주문조회(fetch-orders)** 실행  
10. 응답의 `snapshotPersist` 확인  
    - 기대: `persisted: true` (또는 동등 성공 필드)  
    - `disabled`면 flag/`'true'` 여부 재확인  
11. 테스트 DB에서 `OrderSyncBatch` / `OrderSyncOrder` row 존재 확인 (운영 DB 금지)  
12. D-4 송장 업로드 UI에서 **동일 userId + provider + account** scope로 CSV 업로드 → 매칭  
    - 핵심 필드: `mallOrderNo`, `receiverPhone`, `receiverName`  
13. (선택) READY → xlsx 다운로드까지  
14. 테스트 데이터 정리 + flag를 다시 끄거나 smoke env만 유지  

### C. 스마트스토어를 할 때 추가

- `INTEGRATION_PROXY_*` 설정 + 아웃바운드 IP 화이트리스트  
- 같은 순서: 저장 → test → fetch-orders → snapshot → D-4  

---

## 4. snapshot → D-4 연결 확인 포인트

| 단계 | 확인 |
|------|------|
| fetch 성공 | `orderStandardFile.rows` 생성 |
| persist ON | `maybePersistOrderFetchResult` → `OrderSyncBatch`/`OrderSyncOrder` |
| 매칭 로드 | `loadOrderSyncSnapshotsForMatching` (userId + provider + accountId) |
| 송장 매칭 | `mallOrderNo` / 전화 / 수취인명 |

계정 없이 이미 검증됨: vitest bridge `mock-fetch-to-match-bridge.test.ts` (D-5d/e).

---

## 5. 미리 준비 가능한 것 (지금)

- [x] `.env.smoke.local.example`  
- [x] `scripts/check-order-sync-realtest-env.mjs`  
- [x] 본 체크리스트  
- [ ] `.env.smoke.local` 실값 채우기 (사용자, git 금지)  
- [ ] 쿠팡/스마트스토어 판매자 API 키 발급 (사용자)  
- [ ] 실 fetch (계정 준비 후, 테스트 DB만)

---

## 6. 금지 요약

| 금지 | 이유 |
|------|------|
| 운영 ref DB | 실주문·운영 데이터 오염 |
| 운영 `.env`로 실연동 | 잘못된 DB/flag 위험 |
| env에 mall secret 저장·커밋 | 유출 |
| secret을 채팅/로그에 붙여넣기 | 유출 |
| Vercel Production에 persist flag ON | 운영 부작용 |
| 송장전송 API | 미구현·별도 Phase |
