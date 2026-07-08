# Shopify 주문연동 — 실제 연결 테스트 전 Runbook

> **상태**: 운영 준비 문서 (2026-07)  
> **목적**: Shopify 주문연동을 **실제로 테스트하기 전** 필요한 준비물·순서·금지사항·장애 대응·롤백을 정리  
> **SSOT (설계)**: [shopify-oauth-design.md](./shopify-oauth-design.md)  
> **코드 기준 커밋**: `695df56` — GraphQL orders fetch·OrderStandardFile 매핑·fetch-orders/test route

**이 문서는 코드가 아니라 운영 절차만 다룹니다.**  
아래 작업은 **별도 승인 전까지 금지**: UI 클릭 가능 처리, Production DB migration 적용, Vercel env 변경, Lightsail 반영, 실제 Shopify API 호출·curl, 일반 사용자 대상 오픈.

---

## 1. 현재 코드 상태

| 항목 | 상태 | 비고 |
|------|------|------|
| OAuth connect/callback | ✅ 구현 완료 | `connect/route.ts`, `callback/route.ts` |
| Feature flag | ✅ 기본 **false** | `SHOPIFY_INTEGRATION_ENABLED` — `true`일 때만 route 동작 |
| Token 저장 구조 | ✅ 구현 완료 | `shopify-account.ts` — AES-256-GCM 암호화 |
| GraphQL orders fetch | ✅ 구현 완료 | `client.ts`, `orders.ts` — REST 미사용 |
| OrderStandardFile 매핑 | ✅ 구현 완료 | `map-shopify-orders.ts` — line item 1개 = 1행 |
| 연결 테스트 route | ✅ 구현 완료 | `POST /api/order/integration/shopify/test` |
| 주문 수집 route | ✅ 구현 완료 | `POST /api/order/integration/shopify/fetch-orders` |
| UI | ❌ 클릭 불가 | `ReviewChannelCard` — 「API 개발 후보」 |
| Production DB migration | ❌ **미적용** | 레포에 migration 파일은 있으나 Production 미실행 |
| Lightsail allowed-hosts | ❌ 미반영 | `requiresFixedIpProxy: false` — 1차 직접 호출 설계 |

### Feature flag 적용 route

`SHOPIFY_INTEGRATION_ENABLED !== 'true'` 이면 아래 모두 차단:

| Route | disabled 동작 |
|-------|----------------|
| `GET/POST …/shopify/connect` | **404** JSON |
| `GET …/shopify/callback` | UI redirect `?shopify_oauth=1&status=disabled` (HMAC·token exchange·save 미실행) |
| `POST …/shopify/test` | **404** JSON |
| `POST …/shopify/fetch-orders` | **404** JSON |

### 레포 migration (Production 미적용)

```
prisma/migrations/20260708110000_order_integration_shopify/migration.sql
→ ALTER TYPE "OrderIntegrationProvider" ADD VALUE 'SHOPIFY';
```

Production에 `SHOPIFY` enum이 없으면 계정 저장·조회가 실패합니다. **migration 적용 전 feature flag를 true로 올리지 마세요.**

---

## 2. 실제 테스트 전 필요한 준비물

### 2.1 Shopify / Partners 측

| 준비물 | 설명 |
|--------|------|
| Shopify Partner 계정 | [partners.shopify.com](https://partners.shopify.com) |
| 테스트 스토어 | Development store 권장. 실제 판매 스토어는 Protected customer data 요건 확인 후 |
| Partners 앱 생성 | Dev Dashboard에서 Custom 또는 Public 앱 |
| Client ID | Partners 앱 `client_id` |
| Client Secret | Partners 앱 `client_secret` — **커밋·로그·스크린샷 금지** |
| Allowed redirection URL | Partners Dashboard에 **정확히** 등록 (아래 §3) |

### 2.2 엑클로드(Vercel) 환경 변수

| 변수 | 필수 | 기본·비고 |
|------|------|-----------|
| `SHOPIFY_INTEGRATION_ENABLED` | 테스트 시만 `true` | **기본 false** (미설정·false·그 외 → 비활성) |
| `SHOPIFY_CLIENT_ID` | ✅ | Partners 앱 Client ID |
| `SHOPIFY_CLIENT_SECRET` | ✅ | Partners 앱 Client Secret |
| `SHOPIFY_OAUTH_REDIRECT_URI` | 선택 | 미설정 시 `https://www.excload.com/api/order/integration/shopify/callback` |
| `SHOPIFY_API_VERSION` | 선택 | 미설정 시 `2026-01` (코드 `SHOPIFY_DEFAULT_API_VERSION`) |
| `SHOPIFY_OAUTH_STATE_SECRET` | 선택 | 미설정 시 `EXCLOAD_INTEGRATION_ENCRYPTION_KEY` → `NEXTAUTH_SECRET` fallback |
| `EXCLOAD_INTEGRATION_ENCRYPTION_KEY` | ✅ (토큰 저장 시) | OAuth token AES 암호화용 — 기존 연동과 동일 |

> 문서 초안의 `SHOPIFY_ADMIN_API_VERSION`은 코드 env명 **`SHOPIFY_API_VERSION`** 과 동일 의미입니다.

### 2.3 엑클로드 측 운영

| 준비물 | 설명 |
|--------|------|
| 관리자 계정 | `ADMIN_EMAIL` / `ADMIN_EMAILS`에 등록된 이메일 |
| Production 배포 | feature flag·env 반영 전 최신 코드 배포 확인 |
| Production DB migration 승인 | §4 2단계 — **적용 전 승인 필수** |
| 테스트 전용 접근 | 관리자만 connect·test·fetch-orders 호출 |

---

## 3. Shopify 앱 설정값

### 3.1 Redirect URL

Partners Dashboard **Allowed redirection URL(s)**:

```
https://www.excload.com/api/order/integration/shopify/callback
```

- 스테이징/프리뷰 도메인을 쓸 경우 `SHOPIFY_OAUTH_REDIRECT_URI`와 Partners 등록값이 **완전 일치**해야 합니다.
- trailing slash·http·다른 path는 mismatch 오류를 유발합니다.

### 3.2 Scope

| Scope | 1차 |
|-------|-----|
| `read_orders` | ✅ **필수·유일** |
| `read_all_orders` | ❌ **사용 금지** (60일 초과 이력·Partner 별도 승인 — 2차 이후) |
| `read_customers` | ❌ 불필요 (Order 객체에 customer·shippingAddress 포함) |
| `write_orders` / `write_fulfillments` | ❌ 1차 제외 |

코드: `SHOPIFY_OAUTH_SCOPES = 'read_orders'` (`shop-domain.ts`)

### 3.3 App type — 구현 전 확정 필요

| 형태 | 설명 | 엑클로드 적합성 |
|------|------|----------------|
| **Standalone external SaaS** | 자체 도메인 OAuth → 독립 운영 | **현재 설계와 일치** — authorization code grant |
| Custom app | 단일/소수 스토어 | 초기 내부 테스트에 적합 |
| Public app | 다수 스토어·App Store | expiring offline token 정책·검수 일정 확인 필요 |
| Embedded app | Admin iframe·App Bridge | **1차 범위 아님** — 전환 시 OAuth 흐름 재설계 |

**확인 필요 사항 (Partners Dashboard·공식 문서):**

- [ ] Custom vs Public 중 1차 테스트 앱 형태 확정
- [ ] Public app인 경우 App Store 검수·Protected customer data 승인 필요 여부
- [ ] Expiring offline token (`expiring=1`) — Public app 정책 준수 여부
- [ ] 테스트 스토어만 install 허용할지, production 스토어 install 금지 정책

### 3.4 API 호출 방식

- **GraphQL Admin API only** — `https://{shop}/admin/api/{version}/graphql.json`
- **REST Admin API 사용 금지** (레포 코드 기준)
- **고정 IP 프록시 불필요** (`requiresFixedIpProxy: false`) — Vercel에서 Shopify 직접 호출

---

## 4. 활성화 순서 (반드시 이 순서)

각 단계 완료·확인 후 다음 단계로 진행합니다.

| # | 단계 | 확인 방법 |
|---|------|-----------|
| 1 | **레포 코드 배포 상태 확인** | `main`에 OAuth·feature flag·GraphQL fetch 커밋 반영, Vercel Production 배포 성공 |
| 2 | **Production DB migration 적용 승인·실행** | `OrderIntegrationProvider` enum에 `SHOPIFY` 존재 확인 (`migrate deploy`) |
| 3 | **Shopify Partners 앱 생성** | Client ID·Secret 발급, 앱 URL·redirect 등록 |
| 4 | **Redirect URL 등록** | §3.1 URL이 Partners·코드 기본값과 일치 |
| 5 | **Vercel env 등록** | `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, (선택) `SHOPIFY_API_VERSION`, `SHOPIFY_OAUTH_STATE_SECRET`, `EXCLOAD_INTEGRATION_ENCRYPTION_KEY` |
| 6 | **테스트 계정으로만 `SHOPIFY_INTEGRATION_ENABLED=true`** | Preview가 아닌 **관리자 테스트용** Production env. 일반 사용자 UI는 아직 비활성 |
| 7 | **관리자 test route 확인** | `POST /api/order/integration/shopify/test` — 404가 아닌지, 계정 없으면 404(계정) vs 404(flag) 구분 |
| 8 | **OAuth connect 테스트** | `GET/POST …/shopify/connect?shop={slug}` — Shopify authorize 화면 redirect |
| 9 | **Token 저장 확인** | callback 후 DB `OrderIntegrationAccount` (provider=SHOPIFY), 암호화 필드·`expiresAt` |
| 10 | **fetch-orders 테스트** | `POST …/shopify/fetch-orders` — 최근 7일(기본)·60일 상한 |
| 11 | **OrderStandardFile 결과 확인** | `orderStandardFile`·`previewRows` — line item 행 수·주소·상태 매핑 |
| 12 | **문제 없을 때만 UI 클릭 가능 처리** | 별도 PR·승인 — `OrderIntegrationPanel` ReviewChannelCard → 연동 카드 |

### 테스트 시 권장 호출 순서

```
1. POST /api/order/integration/shopify/test     ← 토큰·shop 유효성 (가벼운 GraphQL)
2. POST /api/order/integration/shopify/fetch-orders  ← 주문 수집·표준화
```

connect/callback은 브라우저 OAuth 흐름으로 선행합니다.

---

## 5. 절대 금지 순서

| 금지 | 이유 |
|------|------|
| **DB migration 전 `SHOPIFY_INTEGRATION_ENABLED=true`** | enum 없으면 계정 upsert·조회 실패 |
| **Client secret 없이 route 활성화** | connect는 500, callback HMAC·token exchange 불가 |
| **UI 먼저 열기** | OAuth·env·DB 미준비 상태에서 사용자 혼란·보안 리스크 |
| **`read_all_orders` scope 추가** | 코드·저장·fetch route에서 거부. Partner 승인·2차 검토 전 금지 |
| **주문 상태변경·송장전송 구현** | `write_orders`·`write_fulfillments` — 1차 범위 밖 |
| **실제 사용자 대상 오픈** | 관리자·테스트 스토어 검증 완료 전 |
| **Secret·token 커밋·로그·스크린샷** | 보안 사고 |
| **Production DB migration 무단 rollback** | enum 추가는 되돌리기 어려움 — 적용 전 승인 |

---

## 6. 장애 시 체크리스트

| 증상 | HTTP/표시 | 우선 확인 |
|------|-----------|-----------|
| invalid shop | 400 | shop 파라미터 형식 (`{slug}` 또는 `{slug}.myshopify.com`), custom domain 아님 |
| Shopify 연동 비활성화 | 404 | `SHOPIFY_INTEGRATION_ENABLED=true` 여부, Preview vs Production env |
| OAuth 미설정 | 500 (connect) | `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` 누락 |
| 401 / 403 token | 400 (test/fetch) | token 만료·revoke, OAuth 재연동, scope에 `read_orders` 포함 |
| 429 rate limit | 400 | GraphQL cost bucket — 잠시 후 재시도, 조회 기간·페이지 축소 |
| state invalid | callback redirect `status=error` | state 만료(10분), 다른 브라우저·탭, `SHOPIFY_OAUTH_STATE_SECRET` 변경 |
| hmac invalid | callback redirect `status=error` | `SHOPIFY_CLIENT_SECRET` 불일치, query tampering |
| Production DB enum 없음 | Prisma/DB 오류 | migration `20260708110000_order_integration_shopify` 미적용 |
| env 누락 | 500/400 | §2.2 표 참고 |
| redirect URL mismatch | OAuth authorize/callback 실패 | Partners URL ↔ `SHOPIFY_OAUTH_REDIRECT_URI` ↔ 코드 기본값 일치 |
| access token 없음 | 400 | OAuth callback 미완료 또는 암호화 키 불일치 |
| `read_all_orders` 거부 | 400 (fetch-orders) | granted scope에서 제거 후 재연동 |

### 로그 확인 시 주의

- `console.error`는 **error.message** 수준만 출력 (token 본문 미포함).
- Vercel 로그·Support 티켓에 **access token·client secret·주문 개인정보** 붙여넣지 않기.

---

## 7. 롤백 방법

| 조치 | 효과 | 난이도 |
|------|------|--------|
| `SHOPIFY_INTEGRATION_ENABLED=false` (또는 삭제) | **즉시** connect/callback/test/fetch-orders 차단 | ⭐ 권장 1순위 |
| UI Shopify 링크 비활성 유지 | 사용자 OAuth 진입 차단 | ⭐ |
| Vercel env에서 secret 제거 또는 rotation | 기존 token 무효화·HMAC 실패 | Partners에서 secret 재발급 시 동시 반영 |
| 저장된 Shopify 계정 disconnect | `markShopifyAccountDisconnected` 또는 DB 수동 정리 | 테스트 데이터 정리용 |
| Production DB migration rollback | enum `SHOPIFY` 제거는 **PostgreSQL에서 어려움** | ❌ 사전 승인 없이 적용 금지 |

**권장 롤백 시나리오:** feature flag `false` → UI 비활성 유지 → (필요 시) secret rotation → 문제 해결 후 재테스트.

---

## 8. 관련 API·파일 빠른 참조

| 구분 | 경로 |
|------|------|
| Connect | `app/api/order/integration/shopify/connect/route.ts` |
| Callback | `app/api/order/integration/shopify/callback/route.ts` |
| Test | `app/api/order/integration/shopify/test/route.ts` |
| Fetch orders | `app/api/order/integration/shopify/fetch-orders/route.ts` |
| GraphQL client | `app/lib/shopify/client.ts` |
| Orders query | `app/lib/shopify/orders.ts` |
| 매핑 | `app/lib/shopify/map-shopify-orders.ts` |
| 계정·암호화 | `app/lib/order-integration/shopify-account.ts` |
| Feature flag | `app/lib/shopify/oauth-credentials.ts` |
| env 예시 | `.env.example` (placeholder만) |

---

## 9. 테스트 완료 기준 (Go/No-Go)

**Go (다음 단계: UI 활성화 검토)**

- [ ] 관리자 test route 성공 (`shopName`, `myshopifyDomain` 반환)
- [ ] OAuth connect → callback → token DB 저장 확인
- [ ] fetch-orders 성공, `orderStandardFile.rows` ≥ 1 (테스트 주문 있는 경우)
- [ ] line item 2개 주문 → 2행 매핑 확인
- [ ] 60일 초과 기간 요청 시 clamp 동작 확인
- [ ] feature flag `false` 시 모든 route 404/disabled 확인
- [ ] 로그에 token·PII 미노출 확인

**No-Go (UI·일반 오픈 보류)**

- migration 미적용
- 401/403 반복
- redirect/HMAC/state 오류 미해결
- `read_all_orders`가 granted scope에 포함

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07 | 초안 — 1차 MVP 커밋(`695df56`) 기준 실제 테스트 전 runbook |
