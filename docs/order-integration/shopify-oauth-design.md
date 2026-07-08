# Shopify 주문연동 OAuth·설계

> **상태**: 설계 문서 (2026-07) — **구현 전**  
> **SSOT**: `channelCode: shopify`, `integrationType: direct_api`, `phase: planned`, `requiresFixedIpProxy: false`  
> **금지 (본 문서 작성 시점)**: OAuth/client/route 구현, Prisma migration, Lightsail `allowed-hosts` 반영, Production API 호출

---

## 1. 연동 목적

Shopify는 국내 오픈마켓(쿠팡·스마트스토어·11번가 등)과 **별도 트랙**의 `direct_api` 후보입니다.

| 목표 | 설명 |
|------|------|
| 주문 조회·수집 | Shopify Admin API로 판매자 스토어 주문 목록·상세 조회 |
| 표준화 | 응답을 엑클로드 **OrderStandardFile**(`BaseHeaderRow` 76열)로 변환 |
| 미리보기 | 연동 패널에서 변환 결과 미리보기 |
| 연결 테스트 | OAuth 토큰·shop 도메인 유효성 확인 |

**대상 판매자**: 글로벌 D2C·자사몰(Shopify) 운영 셀러. 국내 마켓플레이스 허브(사방넷 등)와 무관.

**현재 UI**: 「다음 API 개발 후보」— 클릭 불가. 본 설계 승인·Partners 앱 준비 후 구현 착수.

---

## 2. 1차 구현 범위

### 포함

- Shopify Partners 앱 등록 및 OAuth 설치(connect) 흐름
- 연결 테스트 (`/test`)
- 주문 조회·수집 (`/fetch-orders`)
- OrderStandardFile 변환·미리보기
- 계정 저장 (`/save`) — shopDomain·accountName·OAuth 토큰

### 제외 (1차)

| 항목 | 사유 |
|------|------|
| 상품 등록·수정 | 주문 수집 범위 밖 |
| 재고 연동 | scope·복잡도 증가 |
| 주문 상태 변경·취소 | `write_orders` 불필요 |
| 송장 전송·fulfillment 생성 | `write_fulfillments` 불필요 |
| Webhook (`orders/create` 등) | 폴링·수동 수집으로 1차 대체 |
| 결제·환불 처리 | 금융 scope 불필요 |
| App Store 공개 배포 | 내부·Custom 앱으로 개발·테스트 우선 |
| `read_all_orders` scope | 60일 초과 이력 — Partner 승인·2차 고급 옵션 |
| REST `orders.json` | GraphQL 우선 — REST는 조사 참고만, 구현 제외 |

---

## 3. OAuth 구조

### 3.1 Partners 앱 등록

**필수.** Shopify Admin API OAuth는 [Shopify Partners](https://partners.shopify.com) Dev Dashboard에서 생성한 앱의 `client_id`·`client_secret`으로 동작합니다.

- 앱 유형: **Custom app**(단일/소수 스토어) 또는 **Public app**(다수 스토어) — 엑클로드는 초기에 Custom·비공개로 시작 권장
- Dev Dashboard 설정: App URL, Allowed redirection URL(s), API access scopes

### 3.1.1 앱 형태 결정 (구현 전 확정 필요)

엑클로드가 **Shopify Admin embedded app**인지, **standalone external SaaS app**인지에 따라 권장 authorization flow가 달라질 수 있습니다. **구현 착수 전 앱 형태를 확정**해야 합니다.

| 형태 | 설명 | 엑클로드 적합성 |
|------|------|----------------|
| **Embedded app** | Shopify Admin iframe 내 렌더링. App Bridge·session token·token exchange 흐름 | 주문 정리 UI를 Admin 안에 넣을 때 |
| **Standalone external SaaS** | 엑클로드 자체 도메인에서 OAuth 후 독립 운영 (authorization code grant) | **현재 성격에 가까움** — 외부 SaaS 주문정리 서비스 |

**현재 판단**: 엑클로드는 국내 몰 연동과 동일하게 **자체 웹앱에서 주문 수집·변환**하는 **standalone external SaaS** 성격. 1차 OAuth는 **authorization code grant + offline access token** 기준으로 설계.

**구현 전 재확인**:

- [Shopify managed installation](https://shopify.dev/docs/apps/build/authentication-authorization/app-installation) 및 [token exchange](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/token-exchange) 권장사항이 embedded·App Store 배포 앱에 한정되는지, standalone Custom/Public 앱에도 적용되는지 공식 문서로 재확인
- embedded로 전환할 경우: iframe 탈출(`embedded=1`), App Bridge redirect, online/session token 흐름 추가 검토 필요

### 3.2 Authorization Code Grant 흐름

Shopify 공식: [Implement authorization code grant manually](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant)

```
[엑클로드 UI] → GET /api/order/integration/shopify/authorize
    → state 발급 (userId, accountId, shopDomain)
    → 302 https://{shop}/admin/oauth/authorize?...

[Shopify] 사용자 권한 승인
    → GET /api/order/integration/shopify/callback?code=...&hmac=...&shop=...&state=...

[엑클로드 callback]
    → HMAC 검증
    → state 검증
    → shop hostname 검증
    → POST https://{shop}/admin/oauth/access_token (code 교환)
    → offline access token (+ refresh token) 암호화 저장
    → UI redirect (?oauth=success)
```

### 3.3 Install / Authorize URL

```
https://{shop}/admin/oauth/authorize
  ?client_id={client_id}
  &scope={comma_separated_scopes}
  &redirect_uri={redirect_uri}
  &state={nonce}
```

- `{shop}`: `mystore.myshopify.com` 형식 (custom domain 아님)
- `grant_options[]=per-user` **생략** → **offline access token** (백그라운드 주문 조회용)
- embedded 앱이 아니면 3xx redirect만 사용 (`embedded=1` iframe 탈출 불필요)

### 3.4 Callback URL

예시 (도메인은 배포 환경에 맞게 확정):

```
https://{excloud-host}/api/order/integration/shopify/callback
```

- Dev Dashboard **Allowed redirection URL**에 정확히 등록
- Cafe24 패턴 참고: `app/api/order/integration/cafe24/callback/route.ts`

### 3.5 state 검증

Cafe24 `oauth-state.ts` 패턴 재사용:

- `createShopifyOAuthState({ userId, accountId, shopDomain })` — 서명된 state 토큰
- callback에서 `verifyShopifyOAuthState(state)` — 만료·서명·payload 일치 확인
- CSRF 방지: state의 `nonce`가 authorize 시점 값과 일치해야 함

### 3.6 HMAC 검증

**install 요청·OAuth callback·향후 webhook** 모두 동일 원칙:

1. query string에서 `hmac` 제거
2. 나머지 파라미터를 **키 이름 알파벳 순** `key=value`로 `&` 연결
3. `HMAC-SHA256(client_secret, message)` → hex
4. `crypto.timingSafeEqual`로 `hmac` 파라미터와 비교

> Webhook HMAC은 body 기반이라 별도 절차. 1차 범위 제외.

### 3.7 Access token 발급

```http
POST https://{shop}.myshopify.com/admin/oauth/access_token
Content-Type: application/x-www-form-urlencoded

client_id={client_id}
&client_secret={client_secret}
&code={authorization_code}
&expiring=1
```

| 모드 | 권장 | 설명 |
|------|------|------|
| **Offline + expiring=1** | **권장** | expiring offline access token. 만료 시 refresh로 갱신. Public app은 공식 정책상 사용 필요 |
| Offline (기본, non-expiring) | 비권장 | 무기한 토큰. 기존 앱 호환용. 신규 Public app은 전환 일정에 맞춰 expiring 채택 |
| Online (`grant_options[]=per-user`) | 1차 제외 | 세션 연동·사용자 컨텍스트용. 백그라운드 주문 수집에 부적합 |

#### Expiring offline token — 공식 정책 요약

([changelog](https://shopify.dev/changelog/offline-access-tokens-now-support-expiry-and-refresh))

| 항목 | 내용 |
|------|------|
| Public app | **expiring offline token 사용 필요** |
| 2026-04-01 이후 생성되는 Public app | expiring offline token **필수** |
| 기존 Public app (2026-04-01 이전 생성) | **2027-01-01**까지 expiring offline token으로 전환 필요 |
| 갱신 방식 | `refresh_token`으로 access token 재발급 (refresh token rotation) |
| DB 저장 | **`refreshToken` + `tokenExpiresAt` 필수** — 응답값 기준으로 저장·갱신 |

#### Access / refresh token 만료 처리

- **access token 만료**: 응답의 `expires_in`(초)을 받아 `tokenExpiresAt = now + expires_in`으로 **저장**. 고정 “60분” 같은 상수로 하드코딩하지 않음. (현재 Shopify 기본 TTL은 3600초이나, 정책·버전 변경에 대비해 **항상 응답값 사용**)
- **refresh token 수명**: 응답의 `refresh_token_expires_in`(초)을 저장. 현재 공식 기본값은 **90일(7,776,000초)** 수준이나, 이 역시 **응답값 기준**으로 처리
- API 호출 전: `tokenExpiresAt`이 임박(예: 5분 전)하면 proactive refresh
- 401 수신 시: refresh 시도 → 성공 시 재시도, `invalid_grant` 시 OAuth 재설치 유도
- refresh 응답의 **새 `access_token` + 새 `refresh_token`** 모두 저장 (이전 refresh token은 무효화됨)

### 3.8 앱 삭제 / uninstall

1차에서 Webhook 미구현 시:

- 토큰 무효화는 API 401로 간접 감지
- `lastErrorMessage`·`status: ERROR` 처리

향후 (2차):

- `app/uninstalled` webhook → 해당 shop 계정 `INACTIVE`, `uninstalledAt` 기록
- webhook도 HMAC 검증 필수

---

## 4. 필요한 Shopify scope

### 1차 필수

| Scope | 용도 |
|-------|------|
| `read_orders` | 주문·line item·배송지·fulfillment 상태 조회 |

### 1차 제외 (추후 확장)

| Scope | 1차 | 비고 |
|-------|-----|------|
| `read_all_orders` | **제외** | 60일 초과 이력용. Partner 승인·고급 옵션으로 **2차 이후** 검토 |
| `read_customers` | **불필요** | Order 객체에 `customer`·`shippingAddress` 포함 |
| `read_fulfillments` | **불필요** | `read_orders`에 Fulfillment 읽기 포함 |

### 60일 제한 — 1차 범위 확정

([공식 scope 문서](https://shopify.dev/docs/api/usage/access-scopes))

| 규칙 | 내용 |
|------|------|
| `read_orders`만 | **기본적으로 최근 60일** 주문만 API 접근 가능 |
| 60일 초과 이력 | `read_all_orders` scope + Partner Dashboard **별도 승인** 필요 |
| **엑클로드 1차 범위** | **최근 60일 주문 조회로 제한** — scope·심사·법무 리스크 최소화 |
| `read_all_orders` | **1차 구현·scope 요청 대상 아님**. UI·API 모두 60일 상한 적용. 추후 “전체 이력” 고급 옵션으로 확장 |

**1차 구현 시 적용**:

- `fetch-orders` 기본·최대 조회 기간: **60일 이내**
- 60일 초과 기간 요청 시: 거부 + “전체 이력은 추후 지원 예정” 안내
- GraphQL `query` 필터: `created_at:>=` 시작일이 60일 이전이면 클램프(clamp)

### Protected customer data

이름·전화·주소·이메일은 [Protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data) 요건 대상일 수 있음. 개발 스토어는 완화되나, **프로덕션 스토어** 전에는 Partners 설정·승인 상태 확인 필요.

---

## 5. Credential / DB 저장 설계

> **이번 단계: Prisma 수정 없음.** 구현 시 아래 매핑으로 `OrderIntegrationAccount` 확장안 작성.

### 5.1 `OrderIntegrationProvider` enum 추가 (구현 시)

```prisma
enum OrderIntegrationProvider {
  // ... 기존
  SHOPIFY
}
```

### 5.2 필드 매핑 (기존 컬럼 재사용)

| 논리 필드 | Prisma 컬럼 | 비고 |
|-----------|-------------|------|
| `accountName` | `accountName` | 사용자 표시명 |
| `shopDomain` | `vendorId` | `mystore.myshopify.com` 정규화 저장. `@@unique([userId, provider, vendorId])` |
| `accessToken` | `apiKeyCiphertext` (+ iv, authTag) | offline access token 암호화 |
| `refreshToken` | `secretKeyCiphertext` (+ iv, authTag) | expiring offline용 — **필수 저장** |
| `scope` | `accessKeyCiphertext` | granted scope 문자열 (JSON 또는 comma-separated) |
| `tokenExpiresAt` | `expiresAt` | access token 만료 시각 — **`expires_in` 응답값으로 계산** (`now + expires_in`) |
| `refreshTokenExpiresAt` | *(신규 검토)* | `refresh_token_expires_in` 응답값으로 계산. 1차는 accessKey JSON blob에 포함 가능 |
| `installedAt` | `lastTestedAt` 또는 토큰 blob | OAuth 완료 시각 |
| `status` | `status` | ACTIVE / INACTIVE / ERROR |
| `lastSyncedAt` | `lastSyncedAt` | 마지막 주문 수집 |
| `lastErrorMessage` | `lastErrorMessage` | API·OAuth 오류 |
| `uninstalledAt` | *(2차)* | webhook 전까지 null |

### 5.3 앱 전역 credential (환경 변수)

| 변수 | 용도 |
|------|------|
| `SHOPIFY_CLIENT_ID` | Partners 앱 client_id |
| `SHOPIFY_CLIENT_SECRET` | HMAC·token exchange |
| `SHOPIFY_API_VERSION` | 예: `2026-01` (GraphQL Admin API 버전) |
| `SHOPIFY_OAUTH_STATE_SECRET` | state 서명 (Cafe24 패턴) |

판매자별 `client_id`/`secret`은 **엑클로드 단일 Partners 앱**으로 통일 (Cafe24와 달리 몰별 OAuth 앱 불필요).

### 5.4 shopDomain 정규화

입력 허용: `mystore`, `mystore.myshopify.com`  
저장 형식: **`{slug}.myshopify.com`** (소문자, custom domain 거부)

---

## 6. Endpoint / Host / Lightsail

### 6.1 Host

| 용도 | URL |
|------|-----|
| OAuth authorize | `https://{shop}/admin/oauth/authorize` |
| OAuth token | `https://{shop}/admin/oauth/access_token` |
| **GraphQL Admin API (권장)** | `https://{shop}/admin/api/{version}/graphql.json` |
| REST Admin API (legacy) | `https://{shop}/admin/api/{version}/orders.json` |

`{shop}` = `{slug}.myshopify.com` 만 사용. 스토어 custom domain(`www.brand.com`)으로 Admin API 호출 **불가**.

### 6.2 GraphQL 우선 원칙 (REST 미사용)

> **1차 주문 조회는 GraphQL Admin API `orders` query 기준으로만 설계·구현한다.**

| 원칙 | 내용 |
|------|------|
| REST Admin API | **Legacy** (2024-10-01~). 신규 개발·유지보수 대상 아님 ([migration 가이드](https://shopify.dev/docs/apps/build/graphql/migrate/learn-how)) |
| 신규 Public app | **GraphQL Admin API 기준** 설계. 2025-04-01~ App Store 신규 제출 앱은 GraphQL 전용 |
| 1차 주문 조회 | **GraphQL `orders` query** — 기간·상태 필터, cursor 페이지네이션 |
| REST `orders.json` | **fallback 조사 대상일 뿐**, 기본 구현·코드 경로에 포함하지 않음 |

| | GraphQL Admin API | REST Admin API |
|--|-------------------|----------------|
| 상태 | **신규 표준·유일한 1차 구현 대상** | Legacy — 참고·비교용만 |
| 주문 목록 | `orders` query + search syntax | `GET /orders.json` — **구현 안 함** |
| 페이지네이션 | cursor (`first`/`after`, `pageInfo`) | `limit` + `page_info` — **구현 안 함** |
| 엔드포인트 | `.../admin/api/{version}/graphql.json` | `.../orders.json` — 문서·조사 참고만 |

### 6.3 고정 IP 프록시 (Lightsail)

SSOT: `requiresFixedIpProxy: false`

- **1차 권장**: Vercel 서버에서 Shopify Admin API **직접 호출** (Coupang proxy 경유 불필요)
- `transport/route.ts` **생략 가능** — Makeshop/Coupang과 달리 `INTEGRATION_PROXY_BASE_URL` 불필요
- `allowed-hosts.mjs` suffix 등록은 **프록시 경유를 선택할 경우에만** 필요. 현재 설계상 **우선순위 낮음**

### 6.4 SSRF 방어 (향후 transport 또는 서버 직접 호출 공통)

`*.myshopify.com` suffix rule 후보 (Cafe24 `cafe24api.com` 패턴):

```javascript
// 의사코드 — allowed-hosts.mjs 반영은 승인 후
const SHOPIFY_HOST_SUFFIX = 'myshopify.com';

function parseShopifyShopFromHostname(hostname) {
  const normalized = hostname.trim().toLowerCase();
  if (normalized === 'myshopify.com') return null;           // bare 차단
  if (!normalized.endsWith('.myshopify.com')) return null;     // evil-myshopify.com, myshopify.com.evil.com 차단
  const slug = normalized.slice(0, -'.myshopify.com'.length);
  if (!slug || slug.includes('.')) return null;                // 다중 레이블 차단
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;
  return `${slug}.myshopify.com`;
}
```

| 조건 | 처리 |
|------|------|
| HTTPS only | `http` 거부 |
| hostname `.myshopify.com`으로 끝남 | 필수 |
| bare `myshopify.com` | 차단 |
| `evil-myshopify.com` | 차단 (`.` 없이 suffix 일치 방지) |
| `myshopify.com.evil.com` | 차단 |
| slug에 `.` 포함 | 차단 (`a.b.myshopify.com`) |
| shop 파라미터에 path/query | 정규화 시 제거 |

**저장된 `vendorId`와 요청 host 일치** 검증 — 타 shop으로의 토큰 오용 방지.

---

## 7. 주문 조회 API 설계

> **GraphQL Admin API 전용.** REST `orders.json`은 구현 대상이 아님 (§6.2).

### 7.1 1차 구현: GraphQL `orders` query

문서: [orders query](https://shopify.dev/docs/api/admin-graphql/latest/queries/orders)

```graphql
query FetchOrders($first: Int!, $after: String, $query: String) {
  orders(first: $first, after: $after, query: $query, sortKey: PROCESSED_AT, reverse: true) {
    edges {
      cursor
      node {
        id
        name
        createdAt
        processedAt
        displayFinancialStatus
        displayFulfillmentStatus
        note
        shippingAddress {
          name
          phone
          address1
          address2
          zip
          province
          city
          country
        }
        customer {
          displayName
          phone
          email
        }
        lineItems(first: 50) {
          edges {
            node {
              id
              title
              variantTitle
              quantity
              sku
              originalUnitPriceSet { shopMoney { amount currencyCode } }
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### 7.2 검색·필터 (`query` 인자)

Shopify search syntax 예:

| 용도 | 예시 |
|------|------|
| 기간 (주문일) | `created_at:>=2026-01-01 created_at:<=2026-01-31` |
| 결제 상태 | `financial_status:paid` |
| 배송 상태 | `fulfillment_status:unfulfilled` / `fulfilled` |
| 테스트 주문 제외 | `test:false` |
| 주문 상태 | `status:open` / `closed` / `cancelled` |

1차 UI: **시작일·종료일** + (선택) fulfillment 상태. 기본 `test:false`. **조회 상한 60일** (§4).

### 7.3 페이지네이션

- GraphQL cursor: `first` 최대 250 (Shopify 기본 권장 50~100)
- `pageInfo.hasNextPage` / `endCursor` 루프 until 완료
- 대량 수집 시 **rate limit** 고려 (아래)

### 7.4 주문 상세

1차: 목록 query에 필요 필드 **인라인 포함** — 주문별 추가 `order(id:)` 호출 최소화.  
line item 50건 초과 주문은 `lineItems` pagination 추가 (드묾).

### 7.5 Rate limit

- **GraphQL**: cost-based bucket ([Shopify API limits](https://shopify.dev/docs/api/usage/rate-limits)) — 쿼리 복잡도에 따라 상이
- 구현: 429/`Throttled` 시 exponential backoff, 쿼리 필드 최소화

### 7.6 연결 테스트

- `shop` query 또는 lightweight `orders(first: 1)` — 토큰·scope·shop 유효성 확인
- granted scope에 `read_orders` 포함 여부 확인

---

## 8. OrderStandardFile 매핑

패턴: `app/lib/makeshop/map-makeshop-orders.ts` — **line item당 1행**.

| 표준 필드 | Shopify 소스 | 비고 |
|-----------|--------------|------|
| `주문번호` | `order.name` | 예: `#1001` |
| `상품주문번호` | `{order.name}-{lineItem.id}` | line item GID 숫자부 또는 short id |
| `주문상태` | `displayFinancialStatus` + `displayFulfillmentStatus` | 예: `paid / unfulfilled` 조합 문자열 |
| `받는사람` | `shippingAddress.name` ?? `customer.displayName` | |
| `받는사람전화1` | `shippingAddress.phone` ?? `customer.phone` | 국가코드 정규화 (`normalizePhone`) |
| `받는사람주소1` | `address1` + `city` + `province` + `zip` + `country` | 한 줄 합성 |
| `받는사람주소2` | `address2` | |
| `주문자` | `customer.displayName` | |
| `주문자연락처` | `customer.phone` | |
| `주문일시` | `createdAt` | ISO → `YYYY-MM-DD HH:mm:ss` |
| `결제일시` | `processedAt` | 없으면 `createdAt` |
| `상품명` | `lineItem.title` | |
| `상품옵션` | `lineItem.variantTitle` | |
| `수량` | `lineItem.quantity` | |
| `배송메시지` | `order.note` | |
| `판매처` | 상수 `Shopify` | 미리보기 헤더 또는 내부메모 |
| `shopDomain` | `vendorId` / 요청 shop | 표준 76열에 없으면 `내부메모` 또는 preview 전용 열 |
| `택배사` | fulfillment `trackingCompany` | 1차 optional — fulfillment join 시 |
| `운송장번호` | fulfillment `trackingNumber` | 1차 optional |

**미리보기 헤더** (Makeshop 패턴): `SHOPIFY_PREVIEW_HEADERS` — 주문번호·상품주문번호·주문상태·받는사람·전화·주소·상품명·수량·결제일시·배송메시지·shopDomain.

**제한**: 해외 주소·다통화·번들 SKU·구독 주문은 1차 단순 매핑. edge case는 `내부메모`에 원본 status 보존.

---

## 9. 기존 direct 구조 재사용

| 구성요소 | 재사용 | 비고 |
|----------|--------|------|
| `mall-integration-specs.ts` SSOT | ✅ 이미 `shopify` 등록됨 | 구현 시 `phase: available` 전환은 별도 |
| `OrderIntegrationPanel` | ✅ 패턴 동일 | OAuth 「연결」버튼 + fetch |
| `admin-api-auth` | ✅ | |
| `encryption.ts` | ✅ | access/refresh token 암호화 |
| Cafe24 `authorize`/`callback` | ✅ **참고** | `shopify/oauth-state.ts`, `shopify-account.ts` |
| Makeshop `save`/`test`/`fetch-orders` | ✅ route 구조 | |
| `transport/route.ts` | ⚠️ **생략 권장** | `requiresFixedIpProxy: false` |
| Prisma `OrderIntegrationAccount` | ✅ 컬럼 재사용 | enum `SHOPIFY`만 추가 |
| Registry / pipeline | ✅ | `map-shopify-orders.ts` → `OrderStandardFile` |

### OAuth 전용 route

| Route | 역할 |
|-------|------|
| `GET .../shopify/authorize` | state + redirect to Shopify |
| `GET .../shopify/callback` | HMAC·state·code exchange·저장 |

Cafe24와 동일하게 **connect/callback 분리**. `save`는 accountName·shopDomain만 저장, OAuth는 별도 「Shopify 연결」액션.

### vendorId = shopDomain

**권장**: `vendorId`에 `mystore.myshopify.com` 저장.

- 계정별 유일: `@@unique([userId, provider, vendorId])`
- API 호출 시 host 구성에 직접 사용
- UI 표시: Shop URL

---

## 10. 구현 시 예상 파일 목록

> **아래 파일은 설계상 목록일 뿐, 아직 생성하지 않음.**

```
app/lib/shopify/
  client.ts              # GraphQL fetch, token refresh, shop query
  oauth.ts               # HMAC, authorize URL, code exchange, refresh
  oauth-state.ts         # signed state (cafe24/oauth-state.ts 패턴)
  shop-domain.ts         # normalize + validate hostname
  api-spec.ts            # API version, default query variables
  map-shopify-orders.ts  # Order → OrderStandardFile + preview rows

app/lib/order-integration/
  shopify-account.ts     # CRUD, decrypt tokens, mark sync result

app/api/order/integration/shopify/
  save/route.ts
  authorize/route.ts     # 또는 connect/route.ts
  callback/route.ts
  test/route.ts
  fetch-orders/route.ts
  # transport/route.ts  — requiresFixedIpProxy:false 이면 생략

prisma/schema.prisma     # OrderIntegrationProvider.SHOPIFY (승인 후)

services/coupang-proxy/allowed-hosts.mjs  # 프록시 경유 시에만 (승인 후)

app/lib/order-integration/mall-integration-specs.ts  # phase → available
app/components/order-integration/OrderIntegrationPanel.tsx  # Shopify UI 활성화
```

---

## 11. 구현 착수 전 체크리스트

### 앱·인증

- [ ] **Shopify 앱 형태 확정**: standalone external SaaS vs Admin embedded
- [ ] Shopify managed installation / token exchange 권장사항 — 확정된 앱 형태에 맞게 재확인
- [ ] Shopify Partners 계정·조직 준비
- [ ] Dev Dashboard 앱 생성 (Custom app 우선)
- [ ] Redirect URL 확정 (`/api/order/integration/shopify/callback`)
- [ ] `client_id` / `client_secret` 확보 → Vercel env
- [ ] OAuth HMAC 검증 구현 스펙 리뷰 (install + callback)

### Token·scope

- [ ] **expiring offline token (`expiring=1`) 사용 여부 확정** — Public app이면 필수
- [ ] **`expires_in` 저장 + refresh 로직 설계 승인** (`tokenExpiresAt`, `refreshToken`, `refreshTokenExpiresAt`)
- [ ] Scope: `read_orders` 확정
- [ ] **`read_all_orders` 1차 제외 확정** — 최근 60일만 조회
- [ ] Protected customer data 요건 확인 (프로덕션 스토어)

### API·인프라

- [ ] **GraphQL API version 고정 전략 확정** (예: `2026-01`, env `SHOPIFY_API_VERSION`, 분기별 업그레이드 절차)
- [ ] 개발용 테스트 스토어 생성
- [ ] GraphQL `orders` 샘플 응답 확보 (한국 배송·해외 배송 각 1건)
- [ ] `shopDomain` SSRF 정규화 규칙 확정
- [ ] **Prisma `SHOPIFY` enum 추가** — 별도 승인
- [ ] **Lightsail suffix** — 프록시 미사용 시 생략 가능, SSOT와 정합 확인
- [ ] 1차 제외 항목(Webhook·송장·상품·REST orders.json) 재확인

---

## 참고 링크

- [Authorization code grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant)
- [Access scopes](https://shopify.dev/docs/api/usage/access-scopes)
- [GraphQL Admin API — orders](https://shopify.dev/docs/api/admin-graphql/latest/queries/orders)
- [REST Order (legacy)](https://shopify.dev/docs/api/admin-rest/latest/resources/order)
- [Expiring offline tokens changelog](https://shopify.dev/changelog/offline-access-tokens-now-support-expiry-and-refresh)
- [남은 쇼핑몰 로드맵](./remaining-malls-roadmap.md)
