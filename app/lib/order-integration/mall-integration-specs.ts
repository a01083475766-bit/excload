/**
 * 주문연동 채널 DB (SSOT)
 *
 * ## integrationType (3종 — 혼동 금지)
 *
 * - **direct_api**: 각 쇼핑몰 Open API에 직접 연결 (쿠팡, 11번가, 스마트스토어 등).
 *   Lightsail whitelist에는 **몰 upstream host**만 등록 (`api.11st.co.kr` 등).
 * - **hub_api**: 플레이오토·사방넷·이지어드민 등 **허브 API** (우선 검토 3곳만).
 *   **메인 주문 수집 경로가 아님** — 이미 허브를 쓰는 셀러가 주문 데이터를 엑클로드로 가져와
 *   택배사 양식 변환·카톡 주문 통합 등 **보조** 용도. Lightsail에는 **허브 upstream host**만 등록.
 * - **excel_upload**: API 없이 엑셀 업로드. **Lightsail upstream host 불필요**.
 *
 * ## Lightsail allowed-hosts.mjs
 *
 * “연동 가능한 전체 채널 목록”이 아니라, 프록시가 실제로 나가는 **upstream host 목록**이다.
 * `9cadf36` 등 host sync 패치는 **direct 10채널 upstream + suffix + 사방넷 hub host** 용이며,
 * hub 전체 구현 완료를 뜻하지 않는다. hub 우선 검토: playauto · sabangnet · easyadmin (`priority_hub`).
 *
 * ## hub_api 제품 전략 (2026-07)
 *
 * - **direct_api가 핵심** — 쿠팡·11번가 등 몰별 Open API 직접 연동.
 * - hub_api 전체 구현 X — `priority_hub` 3곳만 API·계약 검토, 나머지 `deferred`·`backlog`.
 * - 허브 유료 이용 셀러의 “단순 주문 수집” 니치는 약함 → UI에서 고급·보조 옵션으로 분리.
 *
 * ## 중복 수집 방지 (marketplaceGroupId 기준)
 *
 * 동일 `marketplaceGroupId`에 **direct_api + hub_api + excel_upload 중 활성 source는 하나만**.
 * 예: `eleven` 그룹 — 11번가 direct, 플레이오토 hub, 사방넷 hub, (향후) 11번가 엑셀 중 **택1**.
 * `excel_upload`도 `marketplaceGroupId`가 있으면 충돌 검사 대상 (`excel_tmon` → `tmon` 등).
 * `marketplaceGroupId` 없는 `excel_generic`·`excel_pending`은 그룹 충돌 대상 아님.
 *
 * - 엑클로드 판매자센터 등록: 업체명 엑클로드, URL https://www.excload.com, IP NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP
 * - Lightsail allowed-hosts.mjs ↔ getIntegrationProxyWhitelist() (deployStatus=deployed exact 만)
 * - 쇼핑몰 구현·등록 완료 후 server.mjs / allowed-hosts.mjs **한 번만** 교체 배포
 */

export type IntegrationType = 'direct_api' | 'hub_api' | 'excel_upload';

export type AuthType =
  | 'oauth2'
  | 'api_key'
  | 'hmac'
  | 'ip_whitelist'
  | 'manual'
  | 'xml_api';

export type SupportedAction =
  | 'order_fetch'
  | 'order_detail_fetch'
  | 'order_confirm'
  | 'invoice_upload'
  | 'cancel_fetch'
  | 'return_fetch'
  | 'exchange_fetch'
  | 'cs_fetch'
  | 'stock_sync'
  | 'settlement_fetch';

export type ApiStatus =
  | 'available'
  | 'restricted'
  | 'hub_only'
  | 'excel_only'
  | 'pending_check'
  | 'blocked';

export type ChannelPhase =
  | 'live'
  | 'beta'
  | 'planned'
  | 'blocked'
  | 'partnership_required'
  | 'research_required'
  | 'backlog';

/** hub_api 우선순위 — priority_hub 만 제품 검토, deferred 는 SSOT 보류 */
export type HubPriority = 'priority_hub' | 'deferred';

export type ChannelProxyDomain = {
  hostname: string;
  protocols: Array<'https' | 'http'>;
  /** Lightsail allowed-hosts.mjs 반영 여부 — planned 는 레지스트리만, deployed 만 프록시 whitelist */
  deployStatus: 'deployed' | 'planned';
  /** exact(기본) | suffix — `*.cafe24api.com` 등 동적 서브도메인 */
  matchKind?: 'exact' | 'suffix';
  notes?: string;
};

export type RequiredInput = {
  key: string;
  label: string;
  required: boolean;
  secret?: boolean;
  /** OrderIntegrationAccount 필드 매핑 힌트 */
  storage?: 'accessKey' | 'secretKey' | 'apiKey' | 'vendorId' | 'sellerId' | 'accountName';
};

export type ChannelIntegrationSpec = {
  channelCode: string;
  channelName: string;
  integrationType: IntegrationType;
  /** 단일 또는 복합 인증 (예: oauth2 + ip_whitelist) */
  authType: AuthType | AuthType[];
  supportedActions: SupportedAction[];
  apiStatus: ApiStatus;
  phase: ChannelPhase;
  /** 판매자/운영자가 판매자센터·개발자센터에서 해야 할 일 */
  requiredSellerAction: string;
  tokenExpirePolicy: string;
  rateLimitMemo: string;
  proxyDomains: ChannelProxyDomain[];
  requiredInputs: RequiredInput[];
  memo: string;
  /**
   * 동일 오픈마켓·자사몰 주문 중복 수집 방지 그룹.
   * direct_api 채널: 보통 channelCode 와 동일.
   * hub_api: hubCoversMarketplaceGroups 로 대체 수집 대상 명시.
   */
  marketplaceGroupId?: string;
  /** hub_api 전용 — 이 허브가 대신 수집하는 marketplaceGroupId 목록 */
  hubCoversMarketplaceGroups?: string[];
  /** hub_api 전용 — priority_hub(검토 3곳) | deferred(로드맵 보류) */
  hubPriority?: HubPriority;
  /** Vercel → Lightsail 고정 IP 프록시 필수 (direct·일부 hub) */
  requiresFixedIpProxy?: boolean;
};

/** @deprecated — 기존 UI·API 호환. direct_api 채널만 해당 */
export type MallIntegrationAuthKind =
  | 'coupang_hmac'
  | 'naver_oauth2_bcrypt'
  | 'eleven_openapikey_header'
  | 'esm_selling_tool'
  | 'sabangnet_xml'
  | 'cafe24_oauth'
  | 'unknown';

/** @deprecated */
export type MallIntegrationPhase = ChannelPhase | 'in_progress';

/** @deprecated */
export type MallIntegrationCredentialField = RequiredInput;

/** @deprecated */
export type MallProxyUpstreamHost = {
  hostname: string;
  protocols: Array<'https' | 'http'>;
  usedForOrderFetch: boolean;
  notes?: string;
};

/** @deprecated — direct_api 레거시 소비자용 */
export type MallIntegrationSpec = {
  mallId: string;
  name: string;
  phase: MallIntegrationPhase;
  authKind: MallIntegrationAuthKind;
  requiresFixedIpProxy: boolean;
  upstreamHosts: MallProxyUpstreamHost[];
  credentialFields: MallIntegrationCredentialField[];
  orderFetchScope: 'connection_test_and_fetch' | 'fetch_only' | 'none';
  stateMutationSupported: false;
  blockers?: string[];
};

const PHASE1_ACTIONS: SupportedAction[] = ['order_fetch', 'order_detail_fetch'];

const FUTURE_ACTIONS: SupportedAction[] = [
  'order_confirm',
  'invoice_upload',
  'cancel_fetch',
  'return_fetch',
  'exchange_fetch',
  'cs_fetch',
  'stock_sync',
  'settlement_fetch',
];

function authTypesOf(spec: ChannelIntegrationSpec): AuthType[] {
  return Array.isArray(spec.authType) ? spec.authType : [spec.authType];
}

function proxyDomain(
  hostname: string,
  protocols: Array<'https' | 'http'>,
  deployStatus: 'deployed' | 'planned',
  notes?: string,
  matchKind: 'exact' | 'suffix' = 'exact',
): ChannelProxyDomain {
  return { hostname, protocols, deployStatus, notes, matchKind };
}

export const CHANNEL_INTEGRATION_SPECS: ChannelIntegrationSpec[] = [
  // ── direct_api ──────────────────────────────────────────────
  {
    channelCode: 'coupang',
    channelName: '쿠팡',
    integrationType: 'direct_api',
    authType: ['hmac', 'ip_whitelist'],
    supportedActions: [...PHASE1_ACTIONS],
    apiStatus: 'available',
    phase: 'live',
    requiredSellerAction:
      'Wing 판매자센터 → Open API → 업체명 엑클로드, URL https://www.excload.com, IP 54.180.45.46 등록 후 Access/Secret Key 발급',
    tokenExpirePolicy: 'HMAC 서명 — 별도 OAuth 토큰 만료 없음',
    rateLimitMemo: 'Wing Open API 호출 제한 — 공식 문서·응답 헤더 준수',
    proxyDomains: [
      proxyDomain('api-gateway.coupang.com', ['https'], 'deployed'),
    ],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'vendorId', label: '업체코드(vendorId)', required: true, storage: 'vendorId' },
      { key: 'accessKey', label: 'Access Key', required: true, secret: true, storage: 'accessKey' },
      { key: 'secretKey', label: 'Secret Key', required: true, secret: true, storage: 'secretKey' },
    ],
    memo: 'Production 연동 live. 1차: 연결 테스트 + 주문 조회/수집만.',
    marketplaceGroupId: 'coupang',
    requiresFixedIpProxy: true,
  },
  {
    channelCode: 'smartstore',
    channelName: '스마트스토어',
    integrationType: 'direct_api',
    authType: ['oauth2', 'ip_whitelist'],
    supportedActions: [...PHASE1_ACTIONS, 'order_confirm', 'invoice_upload'],
    apiStatus: 'available',
    phase: 'beta',
    requiredSellerAction:
      '스마트스토어센터 → API 연동관리 → self 타입 앱, IP 54.180.45.46·URL https://www.excload.com 등록, Client ID/Secret 발급',
    tokenExpirePolicy: 'OAuth2 access token — bcrypt 전자서명 발급, 만료 시 재발급',
    rateLimitMemo: '커머스API Rate Limit — 공식 가이드 준수',
    proxyDomains: [
      proxyDomain('api.commerce.naver.com', ['https'], 'deployed', 'OAuth2 + 주문 API'),
    ],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'clientId', label: 'Client ID (애플리케이션 ID)', required: true, storage: 'accessKey' },
      { key: 'clientSecret', label: 'Client Secret', required: true, secret: true, storage: 'secretKey' },
      { key: 'authType', label: 'type (기본 SELF)', required: true, storage: 'sellerId' },
    ],
    memo: '베타. Lightsail 범용 invoke 1회 배포 후 연결 테스트.',
    marketplaceGroupId: 'smartstore',
    requiresFixedIpProxy: true,
  },
  {
    channelCode: 'eleven',
    channelName: '11번가',
    integrationType: 'direct_api',
    authType: ['api_key', 'xml_api'],
    supportedActions: [...PHASE1_ACTIONS, 'order_confirm', 'invoice_upload'],
    apiStatus: 'available',
    phase: 'beta',
    requiredSellerAction:
      '11번가 판매자센터 → Open API Key 발급, openapikey 헤더 연동. IP 등록 필요 여부는 센터 안내 확인',
    tokenExpirePolicy: 'OPEN API KEY — 별도 OAuth 없음',
    rateLimitMemo: 'Seller REST XML — 호출 제한은 11번가 정책 따름',
    proxyDomains: [
      proxyDomain('api.11st.co.kr', ['http', 'https'], 'deployed', 'Seller REST — openapikey 헤더'),
      proxyDomain('openapi.11st.co.kr', ['http'], 'planned', '레거시 OpenApiService — 주문 연동 비대상'),
    ],
    requiredInputs: [
      { key: 'accountName', label: '접속별칭', required: true, storage: 'accountName' },
      { key: 'openapikey', label: '11ST OPEN API KEY', required: true, secret: true, storage: 'apiKey' },
    ],
    memo: '베타. 연결 테스트·주문 수집 구현 완료. Lightsail invoke 1회 배포 후 실연동.',
    marketplaceGroupId: 'eleven',
    requiresFixedIpProxy: true,
  },
  {
    channelCode: 'cafe24',
    channelName: '카페24',
    integrationType: 'direct_api',
    authType: 'oauth2',
    supportedActions: [...PHASE1_ACTIONS, 'order_confirm', 'invoice_upload'],
    apiStatus: 'available',
    phase: 'beta',
    requiredSellerAction:
      '계정명·mallId 저장 후 엑클로드 공유 앱 OAuth 동의 (Redirect URI https://www.excload.com/api/order/integration/cafe24/callback, scope mall.read_order mall.write_order mall.read_shipping)',
    tokenExpirePolicy: 'access_token ~2h, refresh_token ~2주(갱신 시 기존 refresh 폐기)',
    rateLimitMemo: 'Admin API Rate Limit — cafe24 문서 준수',
    proxyDomains: [
      proxyDomain(
        '*.cafe24api.com',
        ['https'],
        'deployed',
        'Admin/OAuth API — {mallId}.cafe24api.com (suffix, Lightsail 1회 반영 대기)',
        'suffix',
      ),
    ],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'mallId', label: '쇼핑몰 ID (mallId)', required: true, storage: 'vendorId' },
    ],
    memo: '베타. 공유 앱 OAuth·주문 수집·송장 전송. scope mall.read_order mall.write_order mall.read_shipping. Lightsail suffix whitelist 1회 반영 후 실연동.',
    marketplaceGroupId: 'cafe24',
    requiresFixedIpProxy: true,
  },
  {
    channelCode: 'lotteon',
    channelName: '롯데ON',
    integrationType: 'direct_api',
    authType: ['api_key', 'ip_whitelist'],
    supportedActions: [...PHASE1_ACTIONS, 'order_confirm', 'invoice_upload'],
    apiStatus: 'available',
    phase: 'beta',
    requiredSellerAction:
      '롯데ON 스토어센터 → 판매자정보 → OpenAPI관리 → 호스팅/셀러툴(엑클로드), IP 54.180.45.46(;구분), Key 발급',
    tokenExpirePolicy: 'OpenAPI Key — 발급일 기준 1년, 갱신 필요',
    rateLimitMemo: '일 호출 회수 제한(1004 등) — openapi.lotteon.com 정책',
    proxyDomains: [
      proxyDomain('openapi.lotteon.com', ['https'], 'deployed', '판매자 배송주문조회 등 — Lightsail 1회 반영 대기'),
    ],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'sellerId', label: '판매자 ID', required: true, storage: 'sellerId' },
      { key: 'apiKey', label: 'API 인증 KEY (Key 파라미터)', required: true, secret: true, storage: 'apiKey' },
      { key: 'trNo', label: '최상위 거래처번호(tr_no)', required: true, storage: 'vendorId' },
      { key: 'shopId', label: 'Shop ID', required: false, storage: 'accessKey' },
    ],
    memo: '베타. API Key는 Query Key. 1차: 출고지시·상품준비 주문 조회만.',
    marketplaceGroupId: 'lotteon',
    requiresFixedIpProxy: true,
  },
  {
    channelCode: 'ssg',
    channelName: 'SSG.COM',
    integrationType: 'direct_api',
    authType: ['api_key', 'ip_whitelist'],
    supportedActions: [...PHASE1_ACTIONS, 'order_confirm', 'invoice_upload'],
    apiStatus: 'available',
    phase: 'beta',
    requiredSellerAction:
      'SSG 파트너오피스(po.ssgadm.com) → API회원정보관리 → 운영·테스트 서버 IP에 54.180.45.46 등록 → 이메일 API키 활성화',
    tokenExpirePolicy: 'API 인증키 — Authorization 헤더, 별도 OAuth 없음',
    rateLimitMemo: 'eAPI POST — 기간별 조회 제한(7~180일) API별 상이',
    proxyDomains: [
      proxyDomain('eapi.ssgadm.com', ['https'], 'deployed', '배송지시·출고대상 조회 — Lightsail 1회 반영 대기'),
      proxyDomain('qa-eapi.ssgadm.com', ['https'], 'planned', 'QA 테스트'),
    ],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'vendorId', label: '협력사코드(로그인 ID)', required: true, storage: 'vendorId' },
      { key: 'apiKey', label: 'API 인증키', required: true, secret: true, storage: 'apiKey' },
    ],
    memo: '베타. 1차: listShppDirection·listWarehouseOut 조회만. 발주확인·송장·상태변경 제외.',
    marketplaceGroupId: 'ssg',
    requiresFixedIpProxy: true,
  },
  {
    channelCode: 'cjonstyle',
    channelName: 'CJ온스타일',
    integrationType: 'direct_api',
    authType: ['api_key', 'ip_whitelist'],
    supportedActions: [...PHASE1_ACTIONS, 'order_confirm', 'invoice_upload'],
    apiStatus: 'restricted',
    phase: 'beta',
    requiredSellerAction:
      'CJ온스타일 파트너시스템 입점 → API 정보관리 → 직접개발 + 운영 IP 54.180.45.46 → vendorCode·authenticationKey 발급',
    tokenExpirePolicy: 'authenticationKey(60자) — Header vendorCode + authenticationKey',
    rateLimitMemo: '표준 API — 파트너 Docs 로그인 후 상세 확인',
    proxyDomains: [
      proxyDomain('api.cjonstyle.com', ['https'], 'planned', '표준 API 호스트 — Path는 api-spec.ts placeholder'),
    ],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'vendorCode', label: '협력업체코드(vendorCode, 6자)', required: true, storage: 'vendorId' },
      {
        key: 'authenticationKey',
        label: 'API 인증키(authenticationKey)',
        required: true,
        secret: true,
        storage: 'apiKey',
      },
      {
        key: 'deliveryMethodCode',
        label: '배송타입 코드',
        required: false,
        storage: 'accessKey',
      },
    ],
    memo: 'restricted·베타. 입점 협력사 전용. 배송타입별 조회·중복제거. Path placeholder.',
    marketplaceGroupId: 'cjonstyle',
    requiresFixedIpProxy: true,
  },
  {
    channelCode: 'godomall',
    channelName: '고도몰',
    integrationType: 'direct_api',
    authType: ['api_key', 'ip_whitelist'],
    supportedActions: [...PHASE1_ACTIONS, ...FUTURE_ACTIONS],
    apiStatus: 'restricted',
    phase: 'beta',
    requiredSellerAction:
      'NHN커머스 devcenter.godo.co.kr 제휴사(partner_key) 등록 → 쇼핑몰별 user key 신청·승인. openhub 호출 IP(엑클로드) 허용은 NHN 1:1 문의',
    tokenExpirePolicy: 'partner_key(엑클로드 env) + user key(쇼핑몰별) — POST XML, OAuth 없음',
    rateLimitMemo: 'Token Bucket — 1초 100회 초과 시 429, ratelimit-available-level 헤더',
    proxyDomains: [
      proxyDomain('openhub.godo.co.kr', ['https'], 'planned'),
      proxyDomain('sbopenhub.godo.co.kr', ['http'], 'planned', 'sandbox — 1차 제외'),
    ],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'mallDomain', label: '쇼핑몰 도메인', required: true, storage: 'vendorId' },
      { key: 'userKey', label: '사용자키(key)', required: true, secret: true, storage: 'apiKey' },
      { key: 'mallSno', label: 'mallSno(상점번호)', required: false, storage: 'sellerId' },
      {
        key: 'partnerKeyOverride',
        label: 'partner_key override(개발·내부)',
        required: false,
        secret: true,
        storage: 'accessKey',
      },
    ],
    memo: '베타. Order_Search.php POST XML. partner_key는 GODOMALL_PARTNER_KEY env. 발주·송장 1차 제외.',
    marketplaceGroupId: 'godomall',
    requiresFixedIpProxy: true,
  },
  {
    channelCode: 'shopby',
    channelName: 'NHN커머스/샵바이',
    integrationType: 'direct_api',
    authType: 'api_key',
    supportedActions: [...PHASE1_ACTIONS, ...FUTURE_ACTIONS],
    apiStatus: 'available',
    phase: 'beta',
    requiredSellerAction:
      '워크스페이스 셀러어드민 → 앱(App) 등록·systemKey 발급 → 서비스어드민 개발연동정보 → mallKey(외부 연동키)',
    tokenExpirePolicy: 'systemKey + mallKey — Server API Header (OAuth 1차 제외)',
    rateLimitMemo: 'Server API — 공식 문서 Rate Limit',
    proxyDomains: [
      proxyDomain('server-api.e-ncp.com', ['https'], 'planned', '주문·관리 Server API (1차)'),
      proxyDomain('shop-api.e-ncp.com', ['https'], 'planned', 'Shop API — 1차 제외'),
    ],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'systemKey', label: 'systemKey(워크스페이스 앱)', required: true, secret: true, storage: 'secretKey' },
      { key: 'mallKey', label: '외부 연동키(mallKey)', required: true, secret: true, storage: 'apiKey' },
      { key: 'mallDomain', label: '쇼핑몰 도메인/명', required: false, storage: 'vendorId' },
    ],
    memo: '베타. Server API GET /orders v1.1. NHN outbound IP whitelist 없음. shop-api 1차 제외.',
    marketplaceGroupId: 'shopby',
    requiresFixedIpProxy: true,
  },
  {
    channelCode: 'makeshop',
    channelName: '메이크샵',
    integrationType: 'direct_api',
    authType: ['oauth2', 'ip_whitelist'],
    supportedActions: [...PHASE1_ACTIONS, ...FUTURE_ACTIONS],
    apiStatus: 'restricted',
    phase: 'beta',
    requiredSellerAction:
      'developer.makeshop.co.kr APP 등록·심사 → 접근 허용 IP 등록 → 샵스토어 APP 설치·scope 동의. (레거시 openapi 1차 제외)',
    tokenExpirePolicy: 'OAuth2 client_credentials Bearer (5분) — MAKESHOP_CLIENT_ID/SECRET env + shop_uid',
    rateLimitMemo: '토큰 shop_uid+IP 1분 5회. 주문2.0 조회 30일·1000건 제한, 일 단위 분할 권장',
    proxyDomains: [
      proxyDomain('connect.makeshop.co.kr', ['https'], 'planned', '신규 APP API (1차)'),
    ],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'shopUid', label: 'shop_uid / shopId', required: true, storage: 'sellerId' },
      { key: 'mallDomain', label: '쇼핑몰 도메인', required: false, storage: 'vendorId' },
      {
        key: 'clientIdOverride',
        label: 'Client ID override(개발·내부)',
        required: false,
        storage: 'accessKey',
      },
      {
        key: 'clientSecretOverride',
        label: 'Client Secret override(개발·내부)',
        required: false,
        secret: true,
        storage: 'secretKey',
      },
    ],
    memo: '베타. APP API order/2 + order_delivery. 레거시 상점도메인 Open API 1차 제외. 발주·송장 1차 제외.',
    marketplaceGroupId: 'makeshop',
    requiresFixedIpProxy: true,
  },

  // ── 제한·보류 direct ─────────────────────────────────────────
  {
    channelCode: 'gmarket',
    channelName: 'G마켓/옥션 (ESM)',
    integrationType: 'direct_api',
    authType: ['api_key', 'hmac'],
    supportedActions: [...PHASE1_ACTIONS],
    apiStatus: 'restricted',
    phase: 'partnership_required',
    requiredSellerAction:
      'ESM+ 셀링툴 등록·etapihelp@gmail.com 제휴 승인 → ESM+ 셀링툴 관리에서 엑클로드 지정, JWT(HS256) 연동',
    tokenExpirePolicy: 'JWT Bearer — 호출 직전 생성, ESM+ Master ID kid',
    rateLimitMemo: 'ESM Trading API — etapi.gmarket.com 가이드',
    proxyDomains: [
      proxyDomain('sa2.esmplus.com', ['https'], 'planned', '주문·클레임·발송 API'),
    ],
    requiredInputs: [
      { key: 'accountName', label: '접속별칭', required: true, storage: 'accountName' },
      { key: 'sellerId', label: '판매 아이디(G/A)', required: true, storage: 'sellerId' },
      { key: 'masterId', label: 'ESM+ Master ID (셀링툴)', required: true, storage: 'vendorId' },
      { key: 'secretKey', label: 'JWT Secret Key', required: true, secret: true, storage: 'secretKey' },
    ],
    memo:
      '문의/승인 필요. ESM 셀링툴 승인 전 구현 금지. 지마켓·옥션 ESM 1채널(gmarket). auction channelCode 없음.',
    marketplaceGroupId: 'gmarket',
    requiresFixedIpProxy: true,
  },
  {
    channelCode: 'kakao_talkstore',
    channelName: '카카오톡스토어',
    integrationType: 'direct_api',
    authType: ['oauth2', 'api_key'],
    supportedActions: [...PHASE1_ACTIONS],
    apiStatus: 'restricted',
    phase: 'partnership_required',
    requiredSellerAction:
      '카카오쇼핑 API 연동 검토 신청 → 계약 → 연동대행사(엑클로드) 선정·등록 → Developers 앱 + 판매자 API 키',
    tokenExpirePolicy: 'kapi.kakao.com OAuth Bearer + 판매자 API 키',
    rateLimitMemo: '카카오 API 플랫폼 Rate Limit',
    proxyDomains: [
      proxyDomain('kapi.kakao.com', ['https'], 'planned'),
      proxyDomain('kauth.kakao.com', ['https'], 'planned', 'OAuth'),
    ],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'sellerId', label: '판매자 ID', required: true, storage: 'sellerId' },
      { key: 'apiAuthKey', label: 'API 인증키(판매자센터)', required: true, secret: true, storage: 'apiKey' },
      { key: 'restApiKey', label: 'REST API Key (연동대행사 앱)', required: true, secret: true, storage: 'accessKey' },
    ],
    memo:
      '문의/승인 필요. 연동대행사·계약 전 구현 금지. 판매자당 연동대행사 최대 3개. 테스트 환경 없음.',
    marketplaceGroupId: 'kakao_talkstore',
    requiresFixedIpProxy: true,
  },
  {
    channelCode: 'zigzag',
    channelName: '지그재그',
    integrationType: 'direct_api',
    authType: 'api_key',
    supportedActions: [...PHASE1_ACTIONS],
    apiStatus: 'restricted',
    phase: 'partnership_required',
    requiredSellerAction:
      '카카오스타일 담당 MD 문의 → Access/Secret Key·인증 헤더명 확정 후 파트너센터 키 발급',
    tokenExpirePolicy: 'Access Key + Secret Key — 파트너센터 정책',
    rateLimitMemo: 'GraphQL Open API — zigzag.kr/_openapi',
    proxyDomains: [
      proxyDomain('zigzag.kr', ['https'], 'planned', 'GraphQL /_openapi/openapi.graphql'),
    ],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'accessKey', label: 'Access Key', required: true, storage: 'accessKey' },
      { key: 'secretKey', label: 'Secret Key', required: true, secret: true, storage: 'secretKey' },
    ],
    memo:
      '문의/승인 필요. MD 회신·헤더명 확정 전 구현 금지. docs/order-integration/zigzag-md-inquiry.md',
    marketplaceGroupId: 'zigzag',
    requiresFixedIpProxy: true,
  },
  {
    channelCode: 'shopify',
    channelName: '쇼피파이',
    integrationType: 'direct_api',
    authType: 'oauth2',
    supportedActions: [...PHASE1_ACTIONS],
    apiStatus: 'pending_check',
    phase: 'planned',
    requiredSellerAction:
      'Shopify Partners 앱 등록 → OAuth install → read_orders (필요 시 read_all_orders 승인) → 테스트 스토어',
    tokenExpirePolicy: 'OAuth access token — 앱 정책에 따름',
    rateLimitMemo: 'Admin API GraphQL/REST Rate Limit',
    proxyDomains: [
      proxyDomain(
        '*.myshopify.com',
        ['https'],
        'planned',
        'Admin API — {store}.myshopify.com',
        'suffix',
      ),
    ],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'shopDomain', label: 'Shop URL ({id}.myshopify.com)', required: true, storage: 'vendorId' },
      { key: 'accessToken', label: 'Admin API Access Token', required: true, secret: true, storage: 'apiKey' },
    ],
    memo:
      '다음 API 개발 후보 (app_setup_required). 제휴 승인 불필요 — Partners 앱·OAuth·테스트 스토어 준비 후 구현. 글로벌·자사몰 별도 트랙. OAuth/client/Prisma/Lightsail 미구현.',
    marketplaceGroupId: 'shopify',
    requiresFixedIpProxy: false,
  },

  // ── 문의/승인 필요 direct (SSOT · UI 접이식 「문의/승인」) ─────
  {
    channelCode: 'tenbyten',
    channelName: '텐바이텐',
    integrationType: 'direct_api',
    authType: 'api_key',
    supportedActions: [],
    apiStatus: 'restricted',
    phase: 'partnership_required',
    requiredSellerAction: 'SCM 입점·기술지원(kobula@10x10.co.kr) 문의 후 API Key 발급',
    tokenExpirePolicy: 'bearer API Key — SCM 관리',
    rateLimitMemo: '10x10 Inbound REST API',
    proxyDomains: [proxyDomain('api.10x10.co.kr', ['https'], 'planned')],
    requiredInputs: [],
    memo: '문의/승인 필요. SCM/API 문의 전 구현 금지. UI는 문의/승인 섹션.',
    marketplaceGroupId: 'tenbyten',
    requiresFixedIpProxy: true,
  },
  {
    channelCode: 'domeggook',
    channelName: '도매꾹',
    integrationType: 'direct_api',
    authType: 'api_key',
    supportedActions: [...PHASE1_ACTIONS],
    apiStatus: 'available',
    phase: 'beta',
    requiredSellerAction:
      'Open API Key 발급 + Private API 판매용 권한(판매관리·로그인) 승인 후 회원 ID·비밀번호·API Key 입력',
    tokenExpirePolicy: 'API Key + setLogin 세션(sId) — 호출마다 로그인, 세션 미저장',
    rateLimitMemo: '도매꾹 Open API 호출 제한 — 429 시 재시도',
    proxyDomains: [
      proxyDomain('domeggook.com', ['https'], 'deployed', '/ssl/api/ — getOrderList·getOrderView'),
    ],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'memberId', label: '도매꾹 회원 ID', required: true, storage: 'vendorId' },
      { key: 'password', label: '도매꾹 비밀번호', required: true, secret: true, storage: 'secretKey' },
      { key: 'apiKey', label: '도매꾹 API Key', required: true, secret: true, storage: 'apiKey' },
    ],
    memo:
      '베타. 2차: setLogin + getOrderList(for=sell, 전체 페이지) + getOrderView v4.1(for=sell) 순차 상세. 목록 0건이면 View 미호출. 상세 실패 시 전체 중단. 상태변경 API 제외. sId/cId 미저장·미응답.',
    marketplaceGroupId: 'domeggook',
    requiresFixedIpProxy: true,
  },
  {
    channelCode: 'qoo10',
    channelName: '큐텐',
    integrationType: 'direct_api',
    authType: 'api_key',
    supportedActions: [],
    apiStatus: 'pending_check',
    phase: 'research_required',
    requiredSellerAction: 'QSM 문의·연동회사명 신청 후 Certification Key (QAPI)',
    tokenExpirePolicy: 'Certification Key — 1년 갱신',
    rateLimitMemo: 'QAPI — api.qoo10.jp',
    proxyDomains: [proxyDomain('api.qoo10.jp', ['https'], 'planned')],
    requiredInputs: [],
    memo: '문의/승인 필요 (research). 일본 QAPI. UI는 문의/승인 섹션.',
    marketplaceGroupId: 'qoo10',
    requiresFixedIpProxy: true,
  },
  {
    channelCode: 'musinsa',
    channelName: '무신사',
    integrationType: 'direct_api',
    authType: 'api_key',
    supportedActions: [],
    apiStatus: 'restricted',
    phase: 'partnership_required',
    requiredSellerAction: '파트너센터 API 인증키 + 엑클로드 API 대행사 등록 문의',
    tokenExpirePolicy: 'API Key — 1년 갱신',
    rateLimitMemo: '무신사 파트너 API — 공개 host/스키마 확인 필요',
    proxyDomains: [],
    requiredInputs: [],
    memo: '문의/승인 필요. API 대행사 whitelist. UI는 문의/승인 섹션.',
    marketplaceGroupId: 'musinsa',
    requiresFixedIpProxy: true,
  },
  {
    channelCode: 'ably',
    channelName: '에이블리',
    integrationType: 'direct_api',
    authType: 'api_key',
    supportedActions: [],
    apiStatus: 'restricted',
    phase: 'partnership_required',
    requiredSellerAction: 'Sellers API Token·upstream host/문서 확인 문의 (셀러스 입점만)',
    tokenExpirePolicy: 'API Token — Sellers 어드민',
    rateLimitMemo: '공식 개발자 포털 없음 — host 확인 필요',
    proxyDomains: [],
    requiredInputs: [],
    memo: '문의/승인 필요. Sellers 문서·host 미확정. UI는 문의/승인 섹션.',
    marketplaceGroupId: 'ably',
    requiresFixedIpProxy: true,
  },

  // ── hub_api (priority_hub 3곳만 검토 · 나머지 backlog) ─────────
  {
    channelCode: 'playauto',
    channelName: '플레이오토',
    integrationType: 'hub_api',
    authType: 'api_key',
    supportedActions: [...PHASE1_ACTIONS, ...FUTURE_ACTIONS],
    apiStatus: 'pending_check',
    phase: 'planned',
    requiredSellerAction:
      '이미 플레이오토 사용 중인 경우 — API 계약·키 발급 후 허브 주문을 엑클로드로 가져와 택배사 양식·카톡 주문 통합 (메인 수집 대체 아님)',
    tokenExpirePolicy: '플레이오토 API 정책 — 계약 후 확인',
    rateLimitMemo: '허브 API — 플레이오토 문서',
    proxyDomains: [],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'apiKey', label: 'API Key', required: true, secret: true, storage: 'apiKey' },
    ],
    memo: 'priority_hub·검토 대상. 보조 연동 — direct_api가 메인. API 도메인·계약 확인 필요.',
    hubPriority: 'priority_hub',
    hubCoversMarketplaceGroups: [
      'coupang',
      'smartstore',
      'eleven',
      'gmarket',
      'lotteon',
      'ssg',
      'cjonstyle',
      'cafe24',
      'godomall',
      'shopby',
      'makeshop',
      'kakao_talkstore',
    ],
    requiresFixedIpProxy: false,
  },
  {
    channelCode: 'sabangnet',
    channelName: '사방넷',
    integrationType: 'hub_api',
    authType: 'xml_api',
    supportedActions: [...PHASE1_ACTIONS, ...FUTURE_ACTIONS],
    apiStatus: 'pending_check',
    phase: 'planned',
    requiredSellerAction:
      '이미 사방넷 사용 중인 경우 — API 서비스 신청(companyId, authKey, 접근번호). 허브 주문을 엑클로드로 가져와 추가 정리·양식 변환용',
    tokenExpirePolicy: 'XML API 인증키 — 사방넷 정책',
    rateLimitMemo: 'sbadmin XML API',
    proxyDomains: [
      proxyDomain('sbadmin.sabangnet.co.kr', ['https'], 'deployed', '호스트 번호 변형(sbadmin{N}) 가능'),
    ],
    requiredInputs: [
      { key: 'accountName', label: '접속별칭', required: true, storage: 'accountName' },
      { key: 'companyId', label: '사방넷 로그인 ID', required: true, storage: 'vendorId' },
      { key: 'authKey', label: '인증키', required: true, secret: true, storage: 'apiKey' },
      { key: 'accessNumber', label: '등록접근주소(숫자)', required: true, storage: 'sellerId' },
    ],
    memo: 'priority_hub·검토 대상. upstream host만 Lightsail 선반영. 구현·UI 미완. direct_api가 메인.',
    hubPriority: 'priority_hub',
    hubCoversMarketplaceGroups: ['coupang', 'smartstore', 'eleven', 'gmarket', 'lotteon', 'ssg', 'cafe24'],
    requiresFixedIpProxy: true,
  },
  {
    channelCode: 'shoplinker',
    channelName: '샵링커',
    integrationType: 'hub_api',
    authType: 'api_key',
    supportedActions: [...PHASE1_ACTIONS, ...FUTURE_ACTIONS],
    apiStatus: 'pending_check',
    phase: 'backlog',
    requiredSellerAction: '샵링커 API·연동 계약 — 400+ 채널 (로드맵 보류)',
    tokenExpirePolicy: '샵링커 API 정책',
    rateLimitMemo: '허브 API',
    proxyDomains: [],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'apiKey', label: 'API Key', required: true, secret: true, storage: 'apiKey' },
    ],
    memo: 'deferred·backlog. direct_api 우선. SSOT·충돌 정책용 레지스트리만 유지.',
    hubPriority: 'deferred',
    hubCoversMarketplaceGroups: [
      'coupang',
      'smartstore',
      'eleven',
      'gmarket',
      'lotteon',
      'ssg',
      'cjonstyle',
    ],
    requiresFixedIpProxy: false,
  },
  {
    channelCode: 'easyadmin',
    channelName: '이지어드민',
    integrationType: 'hub_api',
    authType: 'api_key',
    supportedActions: [...PHASE1_ACTIONS, ...FUTURE_ACTIONS],
    apiStatus: 'pending_check',
    phase: 'planned',
    requiredSellerAction:
      '이미 이지어드민 사용 중인 경우 — API 연동 신청. 허브 주문을 엑클로드로 가져와 추가 정리·양식 변환용',
    tokenExpirePolicy: '이지어드민 API 정책',
    rateLimitMemo: '허브 API',
    proxyDomains: [],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'apiKey', label: 'API Key', required: true, secret: true, storage: 'apiKey' },
    ],
    memo: 'priority_hub·검토 대상. 보조 연동. direct_api가 메인.',
    hubPriority: 'priority_hub',
    hubCoversMarketplaceGroups: [
      'coupang',
      'smartstore',
      'eleven',
      'gmarket',
      'lotteon',
      'ssg',
      'cafe24',
    ],
    requiresFixedIpProxy: false,
  },
  {
    channelCode: 'shoppling',
    channelName: '샵플링',
    integrationType: 'hub_api',
    authType: 'api_key',
    supportedActions: [...PHASE1_ACTIONS, ...FUTURE_ACTIONS],
    apiStatus: 'pending_check',
    phase: 'backlog',
    requiredSellerAction: '샵플링 고도화 API 계약 (로드맵 보류)',
    tokenExpirePolicy: '샵플링 API 정책',
    rateLimitMemo: '허브 API',
    proxyDomains: [],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'apiKey', label: 'API Key', required: true, secret: true, storage: 'apiKey' },
    ],
    memo: 'deferred·backlog. SSOT·충돌 정책용.',
    hubPriority: 'deferred',
    hubCoversMarketplaceGroups: ['coupang', 'smartstore', 'eleven', 'gmarket'],
    requiresFixedIpProxy: false,
  },
  {
    channelCode: 'sellmate',
    channelName: '셀메이트',
    integrationType: 'hub_api',
    authType: 'api_key',
    supportedActions: [...PHASE1_ACTIONS, ...FUTURE_ACTIONS],
    apiStatus: 'pending_check',
    phase: 'backlog',
    requiredSellerAction: '셀메이트 API 신청 (로드맵 보류)',
    tokenExpirePolicy: '셀메이트 API 정책',
    rateLimitMemo: '허브 API',
    proxyDomains: [],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'apiKey', label: 'API Key', required: true, secret: true, storage: 'apiKey' },
    ],
    memo: 'deferred·backlog.',
    hubPriority: 'deferred',
    hubCoversMarketplaceGroups: ['coupang', 'smartstore', 'eleven'],
    requiresFixedIpProxy: false,
  },
  {
    channelCode: 'sellric',
    channelName: '셀릭',
    integrationType: 'hub_api',
    authType: 'api_key',
    supportedActions: [...PHASE1_ACTIONS, ...FUTURE_ACTIONS],
    apiStatus: 'pending_check',
    phase: 'backlog',
    requiredSellerAction: '셀릭(세원셀릭) API·연동 계약 (로드맵 보류)',
    tokenExpirePolicy: '셀릭 API 정책',
    rateLimitMemo: '허브 API',
    proxyDomains: [],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'apiKey', label: 'API Key', required: true, secret: true, storage: 'apiKey' },
    ],
    memo: 'deferred·backlog.',
    hubPriority: 'deferred',
    hubCoversMarketplaceGroups: ['coupang', 'smartstore', 'eleven', 'gmarket'],
    requiresFixedIpProxy: false,
  },
  {
    channelCode: 'sellpick',
    channelName: '셀픽',
    integrationType: 'hub_api',
    authType: 'api_key',
    supportedActions: [...PHASE1_ACTIONS, ...FUTURE_ACTIONS],
    apiStatus: 'pending_check',
    phase: 'backlog',
    requiredSellerAction: '셀픽(신세계셀픽) API·연동 계약 (로드맵 보류)',
    tokenExpirePolicy: '셀픽 API 정책',
    rateLimitMemo: '허브 API',
    proxyDomains: [],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'apiKey', label: 'API Key', required: true, secret: true, storage: 'apiKey' },
    ],
    memo: 'deferred·backlog.',
    hubPriority: 'deferred',
    hubCoversMarketplaceGroups: ['coupang', 'smartstore', 'eleven', 'gmarket', 'ssg'],
    requiresFixedIpProxy: false,
  },
  {
    channelCode: 'easywinner',
    channelName: '이지위너',
    integrationType: 'hub_api',
    authType: 'api_key',
    supportedActions: [...PHASE1_ACTIONS, ...FUTURE_ACTIONS],
    apiStatus: 'pending_check',
    phase: 'backlog',
    requiredSellerAction: '이지위너 API·연동 계약 (로드맵 보류)',
    tokenExpirePolicy: '이지위너 API 정책',
    rateLimitMemo: '허브 API',
    proxyDomains: [],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'apiKey', label: 'API Key', required: true, secret: true, storage: 'apiKey' },
    ],
    memo: 'deferred·backlog.',
    hubPriority: 'deferred',
    hubCoversMarketplaceGroups: ['coupang', 'smartstore', 'eleven'],
    requiresFixedIpProxy: false,
  },

  // ── excel_upload ─────────────────────────────────────────────
  {
    channelCode: 'excel_generic',
    channelName: '엑셀 업로드 (공통)',
    integrationType: 'excel_upload',
    authType: 'manual',
    supportedActions: ['order_fetch'],
    apiStatus: 'excel_only',
    phase: 'live',
    requiredSellerAction: '판매처에서 주문 엑셀 다운로드 → 엑클로드 업로드 변환',
    tokenExpirePolicy: 'n/a',
    rateLimitMemo: 'n/a',
    proxyDomains: [],
    requiredInputs: [],
    memo: 'API·허브 미지원 채널 안전망. 기존 엑클로드 엑셀 파이프라인.',
    requiresFixedIpProxy: false,
  },
  {
    channelCode: 'excel_tmon',
    channelName: '티몬 (엑셀)',
    integrationType: 'excel_upload',
    authType: 'manual',
    supportedActions: ['order_fetch'],
    apiStatus: 'excel_only',
    phase: 'planned',
    requiredSellerAction: '티몬 판매자센터 주문 엑셀 다운로드',
    tokenExpirePolicy: 'n/a',
    rateLimitMemo: 'n/a',
    proxyDomains: [],
    requiredInputs: [],
    memo: '8888 D그룹. direct API 미확정 → excel_only.',
    marketplaceGroupId: 'tmon',
    requiresFixedIpProxy: false,
  },
  {
    channelCode: 'excel_wemakeprice',
    channelName: '위메프 (엑셀)',
    integrationType: 'excel_upload',
    authType: 'manual',
    supportedActions: ['order_fetch'],
    apiStatus: 'excel_only',
    phase: 'planned',
    requiredSellerAction: '위메프 판매자센터 주문 엑셀 다운로드',
    tokenExpirePolicy: 'n/a',
    rateLimitMemo: 'n/a',
    proxyDomains: [],
    requiredInputs: [],
    memo: '8888 D그룹. hub 또는 excel.',
    marketplaceGroupId: 'wemakeprice',
    requiresFixedIpProxy: false,
  },
  {
    channelCode: 'excel_pending',
    channelName: 'API 미확정 판매처 (엑셀)',
    integrationType: 'excel_upload',
    authType: 'manual',
    supportedActions: ['order_fetch'],
    apiStatus: 'pending_check',
    phase: 'planned',
    requiredSellerAction: '해당 판매처 주문 엑셀·CSV 수동 업로드',
    tokenExpirePolicy: 'n/a',
    rateLimitMemo: 'n/a',
    proxyDomains: [],
    requiredInputs: [],
    memo: '무신사·29CM·토스쇼핑 등 API 미확정 채널 placeholder. marketplaceGroupId 는 업로드 템플릿별 확장.',
    requiresFixedIpProxy: false,
  },
];

// ── 조회 헬퍼 ────────────────────────────────────────────────

export function getChannelIntegrationSpec(
  channelCode: string,
): ChannelIntegrationSpec | undefined {
  return CHANNEL_INTEGRATION_SPECS.find((spec) => spec.channelCode === channelCode);
}

export function getChannelsByIntegrationType(
  integrationType: IntegrationType,
): ChannelIntegrationSpec[] {
  return CHANNEL_INTEGRATION_SPECS.filter((spec) => spec.integrationType === integrationType);
}

export function getDirectApiChannels(): ChannelIntegrationSpec[] {
  return getChannelsByIntegrationType('direct_api');
}

/** 운영 중 direct 10채널 (live·beta) — planned/문의·승인 후보 제외 */
export function getLiveDirectApiChannels(): ChannelIntegrationSpec[] {
  return getDirectApiChannels().filter((c) => c.phase === 'live' || c.phase === 'beta');
}

/**
 * direct planned — 현재 Shopify만 (다음 API 개발 후보).
 * 제휴 승인 불필요, Partners 앱·OAuth 등 app_setup_required.
 */
export function getPlannedDirectApiChannels(): ChannelIntegrationSpec[] {
  return getDirectApiChannels().filter((c) => c.phase === 'planned');
}

/** 다음 API 개발 후보 — Shopify (planned 중 app_setup_required) */
export function getNextApiDirectCandidates(): ChannelIntegrationSpec[] {
  return getPlannedDirectApiChannels().filter((c) => c.channelCode === 'shopify');
}

/** direct partnership_required (gmarket·zigzag·tenbyten 등) */
export function getPartnershipDirectChannels(): ChannelIntegrationSpec[] {
  return getDirectApiChannels().filter((c) => c.phase === 'partnership_required');
}

/**
 * 문의/승인 필요 direct — partnership_required + research_required.
 * 문서·로드맵용 (connect 페이지 미노출). 구현 가능처럼 취급 금지.
 */
export function getInquiryApprovalDirectChannels(): ChannelIntegrationSpec[] {
  return getDirectApiChannels().filter(
    (c) => c.phase === 'partnership_required' || c.phase === 'research_required',
  );
}

/** 문의/승인 그룹 표시 순서 (문서·헬퍼용; connect UI 미사용) */
export const INQUIRY_APPROVAL_UI_ORDER = [
  'zigzag',
  'gmarket',
  'kakao_talkstore',
  'tenbyten',
  'qoo10',
  'musinsa',
  'ably',
] as const;

export function getInquiryApprovalDirectChannelsForUi(): ChannelIntegrationSpec[] {
  const byCode = new Map(getInquiryApprovalDirectChannels().map((c) => [c.channelCode, c]));
  return INQUIRY_APPROVAL_UI_ORDER.map((code) => byCode.get(code)).filter(
    (c): c is ChannelIntegrationSpec => Boolean(c),
  );
}

/**
 * hub_only / excel_upload_first 후보 — SSOT channelCode 없을 수 있음 (문서·로드맵용).
 * connect 페이지 미노출. docs/order-integration/connect-page-preparing-and-candidates.md
 */
export const HUB_OR_EXCEL_PRIORITY_ROADMAP = [
  { code: 'todayhouse', name: '오늘의집', kind: 'hub_only' as const },
  { code: 'brandi', name: '브랜디', kind: 'hub_only' as const },
  { code: 'hiver', name: '하이버', kind: 'hub_only' as const },
  { code: 'ballan', name: '발란', kind: 'hub_only' as const },
  { code: 'buyzzle', name: '바이즐', kind: 'hub_only' as const },
  { code: 'hottracks', name: '핫트랙스', kind: 'excel_upload_first' as const },
  { code: 'babosarang', name: '바보사랑', kind: 'excel_upload_first' as const },
  { code: '1300k', name: '1300K', kind: 'excel_upload_first' as const },
  { code: 'goldii', name: '골디', kind: 'excel_upload_first' as const },
] as const;

/** 보류/차단 — excel_tmon / excel_wemakeprice 만 SSOT. 정상 영업·API 재개 전 UI 미노출 */
export const BLOCKED_OR_CLOSED_ROADMAP = [
  { code: 'tmon', name: '티몬', ssotExcelCode: 'excel_tmon' },
  { code: 'wemakeprice', name: '위메프', ssotExcelCode: 'excel_wemakeprice' },
] as const;

export function getHubApiChannels(): ChannelIntegrationSpec[] {
  return getChannelsByIntegrationType('hub_api');
}

/** hub_api 우선 검토 3곳 — playauto · sabangnet · easyadmin */
export function getPriorityHubChannels(): ChannelIntegrationSpec[] {
  return getHubApiChannels().filter((c) => c.hubPriority === 'priority_hub');
}

/** hub_api 로드맵 보류 — SSOT·충돌 정책용 */
export function getDeferredHubChannels(): ChannelIntegrationSpec[] {
  return getHubApiChannels().filter((c) => c.hubPriority === 'deferred');
}

export function getExcelUploadChannels(): ChannelIntegrationSpec[] {
  return getChannelsByIntegrationType('excel_upload');
}

/** 채널이 커버하는 marketplaceGroupId 목록 (direct: 자신, hub: hubCovers) */
export function getMarketplaceGroupsForChannel(channelCode: string): string[] {
  const spec = getChannelIntegrationSpec(channelCode);
  if (!spec) return [];
  if (spec.integrationType === 'hub_api' && spec.hubCoversMarketplaceGroups?.length) {
    return spec.hubCoversMarketplaceGroups;
  }
  if (spec.marketplaceGroupId) return [spec.marketplaceGroupId];
  return [];
}

export type MarketplaceSourceConflict = {
  marketplaceGroupId: string;
  channelCodes: string[];
};

/**
 * 판매자 계정에 활성화할 채널 코드 목록에서 marketplace 그룹당 source 가 2개 이상이면 충돌.
 * direct_api · hub_api · excel_upload(marketplaceGroupId 있을 때) 모두 동일 그룹에 1 source 만 허용.
 */
export function detectMarketplaceSourceConflicts(
  activeChannelCodes: string[],
): MarketplaceSourceConflict[] {
  const groupToChannels = new Map<string, Set<string>>();

  for (const code of activeChannelCodes) {
    const spec = getChannelIntegrationSpec(code);
    if (!spec) continue;

    const groups = getMarketplaceGroupsForChannel(code);
    if (groups.length === 0) continue;
    for (const groupId of groups) {
      if (!groupToChannels.has(groupId)) groupToChannels.set(groupId, new Set());
      groupToChannels.get(groupId)!.add(code);
    }
  }

  const conflicts: MarketplaceSourceConflict[] = [];
  for (const [marketplaceGroupId, codes] of groupToChannels) {
    if (codes.size > 1) {
      conflicts.push({
        marketplaceGroupId,
        channelCodes: [...codes].sort(),
      });
    }
  }

  return conflicts.sort((a, b) => a.marketplaceGroupId.localeCompare(b.marketplaceGroupId));
}

export function validateSingleSourcePerMarketplace(activeChannelCodes: string[]): {
  ok: boolean;
  conflicts: MarketplaceSourceConflict[];
} {
  const conflicts = detectMarketplaceSourceConflicts(activeChannelCodes);
  return { ok: conflicts.length === 0, conflicts };
}

/** hub 활성 시 충돌하는 direct 채널 코드 */
export function getDirectChannelsBlockedByHub(
  hubChannelCode: string,
  directChannelCodes: string[] = getDirectApiChannels().map((c) => c.channelCode),
): string[] {
  const hubGroups = new Set(getMarketplaceGroupsForChannel(hubChannelCode));
  if (hubGroups.size === 0) return [];

  return directChannelCodes.filter((directCode) => {
    const directGroups = getMarketplaceGroupsForChannel(directCode);
    return directGroups.some((g) => hubGroups.has(g));
  });
}

// ── 프록시 whitelist (deployed 만 — Lightsail 미반영 도메인 제외) ──

function channelToProxyHosts(spec: ChannelIntegrationSpec): MallProxyUpstreamHost[] {
  if (
    spec.phase === 'blocked' ||
    spec.phase === 'backlog' ||
    spec.integrationType === 'excel_upload'
  ) {
    return [];
  }

  return spec.proxyDomains
    .filter((d) => d.deployStatus === 'deployed' && (d.matchKind ?? 'exact') === 'exact')
    .map((d) => ({
      hostname: d.hostname,
      protocols: d.protocols,
      usedForOrderFetch: spec.supportedActions.includes('order_fetch'),
      notes: d.notes,
    }));
}

/** Lightsail allowed-hosts.mjs 와 동기화 대상 (deployStatus=deployed, exact hostname 만) */
export function getIntegrationProxyWhitelist(): MallProxyUpstreamHost[] {
  const hosts = new Map<string, MallProxyUpstreamHost>();

  for (const spec of CHANNEL_INTEGRATION_SPECS) {
    for (const host of channelToProxyHosts(spec)) {
      if (!host.usedForOrderFetch) continue;
      const existing = hosts.get(host.hostname);
      if (!existing) {
        hosts.set(host.hostname, { ...host });
        continue;
      }
      const protocols = [...new Set([...existing.protocols, ...host.protocols])];
      hosts.set(host.hostname, {
        ...existing,
        protocols,
        usedForOrderFetch: existing.usedForOrderFetch || host.usedForOrderFetch,
        notes: [existing.notes, host.notes].filter(Boolean).join(' '),
      });
    }
  }

  return [...hosts.values()].sort((a, b) => a.hostname.localeCompare(b.hostname));
}

/** Vercel 코드 전용 suffix whitelist (Lightsail 1회 반영 전에도 assertIntegrationProxyUrlAllowed 에 사용) */
export function getIntegrationProxySuffixRules(): Array<{
  suffix: string;
  protocols: Array<'https' | 'http'>;
  notes?: string;
}> {
  const rules = new Map<string, { suffix: string; protocols: Array<'https' | 'http'>; notes?: string }>();

  for (const spec of CHANNEL_INTEGRATION_SPECS) {
    if (spec.phase === 'blocked' || spec.integrationType === 'excel_upload') continue;
    for (const domain of spec.proxyDomains) {
      if (domain.deployStatus !== 'deployed' || domain.matchKind !== 'suffix') continue;
      if (!domain.hostname.startsWith('*.')) continue;
      const suffix = domain.hostname.slice(2);
      const existing = rules.get(suffix);
      if (!existing) {
        rules.set(suffix, { suffix, protocols: [...domain.protocols], notes: domain.notes });
        continue;
      }
      rules.set(suffix, {
        suffix,
        protocols: [...new Set([...existing.protocols, ...domain.protocols])],
        notes: [existing.notes, domain.notes].filter(Boolean).join(' '),
      });
    }
  }

  return [...rules.values()].sort((a, b) => a.suffix.localeCompare(b.suffix));
}

export function getIntegrationProxyAllowedHostnames(): string[] {
  return getIntegrationProxyWhitelist().map((h) => h.hostname);
}

export function getHostAllowedProtocols(hostname: string): Array<'https' | 'http'> {
  const normalized = hostname.trim().toLowerCase();
  const exact = getIntegrationProxyWhitelist().find((h) => h.hostname === normalized);
  if (exact) return exact.protocols;

  for (const rule of getIntegrationProxySuffixRules()) {
    if (normalized === rule.suffix || normalized.endsWith(`.${rule.suffix}`)) {
      return rule.protocols;
    }
  }

  return ['https'];
}

/** 레지스트리 전체 프록시 후보 (planned 포함) — Lightsail 최종 1회 반영용 */
export function getAllPlannedProxyDomains(): ChannelProxyDomain[] {
  const hosts = new Map<string, ChannelProxyDomain>();

  for (const spec of CHANNEL_INTEGRATION_SPECS) {
    if (spec.integrationType === 'excel_upload') continue;
    for (const domain of spec.proxyDomains) {
      const existing = hosts.get(domain.hostname);
      if (!existing) {
        hosts.set(domain.hostname, { ...domain });
        continue;
      }
      hosts.set(domain.hostname, {
        ...existing,
        protocols: [...new Set([...existing.protocols, ...domain.protocols])],
        deployStatus:
          existing.deployStatus === 'deployed' || domain.deployStatus === 'deployed'
            ? 'deployed'
            : 'planned',
        notes: [existing.notes, domain.notes].filter(Boolean).join(' '),
      });
    }
  }

  return [...hosts.values()].sort((a, b) => a.hostname.localeCompare(b.hostname));
}

// ── 레거시 direct_api 어댑터 ─────────────────────────────────

function legacyAuthKind(spec: ChannelIntegrationSpec): MallIntegrationAuthKind {
  const map: Partial<Record<string, MallIntegrationAuthKind>> = {
    coupang: 'coupang_hmac',
    smartstore: 'naver_oauth2_bcrypt',
    eleven: 'eleven_openapikey_header',
    cafe24: 'cafe24_oauth',
    gmarket: 'esm_selling_tool',
  };
  return map[spec.channelCode] ?? 'unknown';
}

function toLegacyMallSpec(spec: ChannelIntegrationSpec): MallIntegrationSpec {
  const upstreamHosts = spec.proxyDomains.map((d) => ({
    hostname: d.hostname,
    protocols: d.protocols,
    usedForOrderFetch:
      d.deployStatus === 'deployed' && spec.supportedActions.includes('order_fetch'),
    notes: d.notes,
  }));

  const orderFetchScope =
    spec.supportedActions.includes('order_fetch') && spec.phase !== 'blocked'
      ? 'connection_test_and_fetch'
      : spec.supportedActions.includes('order_fetch')
        ? 'fetch_only'
        : 'none';

  return {
    mallId: spec.channelCode,
    name: spec.channelName,
    phase: spec.phase === 'partnership_required' || spec.phase === 'research_required' ? 'blocked' : spec.phase,
    authKind: legacyAuthKind(spec),
    requiresFixedIpProxy: spec.requiresFixedIpProxy ?? false,
    upstreamHosts,
    credentialFields: spec.requiredInputs,
    orderFetchScope,
    stateMutationSupported: false,
    blockers:
      spec.phase === 'blocked' ||
      spec.phase === 'partnership_required' ||
      spec.phase === 'research_required'
        ? [spec.requiredSellerAction]
        : undefined,
  };
}

/** @deprecated — direct_api 채널만. 신규 코드는 CHANNEL_INTEGRATION_SPECS 사용 */
export const MALL_INTEGRATION_SPECS: MallIntegrationSpec[] = getDirectApiChannels().map(
  toLegacyMallSpec,
);

/** @deprecated */
export function getMallIntegrationSpec(mallId: string): MallIntegrationSpec | undefined {
  return MALL_INTEGRATION_SPECS.find((spec) => spec.mallId === mallId);
}

export function channelSupportsAction(
  channelCode: string,
  action: SupportedAction,
): boolean {
  const spec = getChannelIntegrationSpec(channelCode);
  return spec?.supportedActions.includes(action) ?? false;
}

export function normalizeAuthTypes(spec: ChannelIntegrationSpec): AuthType[] {
  return authTypesOf(spec);
}
