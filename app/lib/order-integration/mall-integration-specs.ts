/**
 * 주문연동 채널 DB (SSOT)
 *
 * - 엑클로드 판매자센터 등록: 업체명 엑클로드, URL https://www.excload.com, IP NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP
 * - Lightsail allowed-hosts.mjs ↔ getIntegrationProxyWhitelist() (deployStatus=deployed 만)
 * - 쇼핑몰 구현·등록 완료 후 server.mjs / allowed-hosts.mjs **한 번만** 교체 배포
 *
 * 중복 수집 방지: 동일 marketplaceGroupId 에 direct_api·hub_api·excel_upload 중 하나의 source 만 활성화
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
  | 'partnership_required';

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
    supportedActions: [...PHASE1_ACTIONS, ...FUTURE_ACTIONS],
    apiStatus: 'available',
    phase: 'beta',
    requiredSellerAction:
      '카페24 개발자센터 App 등록 → Client ID/Secret, Redirect URI https://www.excload.com/api/order/integration/cafe24/callback, scope mall.read_order',
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
      { key: 'clientId', label: 'Client ID', required: true, storage: 'accessKey' },
      { key: 'clientSecret', label: 'Client Secret', required: true, secret: true, storage: 'secretKey' },
    ],
    memo: '베타. OAuth 연동·주문 수집 코드 배포. 개발자센터 App + Lightsail suffix whitelist 1회 반영 후 실연동.',
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
    authType: ['api_key', 'ip_whitelist', 'oauth2'],
    supportedActions: [...PHASE1_ACTIONS, ...FUTURE_ACTIONS],
    apiStatus: 'restricted',
    phase: 'planned',
    requiredSellerAction:
      'A) openapi.makeshop.co.kr 라이선스 업체 등록 + IP 허용 / B) developer.makeshop.co.kr APP 등록·심사 + 접근허용 IP. 상점 연동관리에서 업체 추가',
    tokenExpirePolicy: 'A) Shopkey+Licensekey B) OAuth client_credentials — connect.makeshop.co.kr',
    rateLimitMemo: '레거시: 시간당 500회/상점, 조회 30일. 신규 APP API 별도',
    proxyDomains: [
      proxyDomain('connect.makeshop.co.kr', ['https'], 'planned', '신규 APP API (권장)'),
    ],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'shopDomain', label: '상점 도메인', required: true, storage: 'vendorId' },
      { key: 'shopUid', label: 'shop_uid / shopId', required: true, storage: 'sellerId' },
      { key: 'shopKey', label: 'Shopkey (레거시)', required: false, secret: true, storage: 'apiKey' },
      { key: 'licenseKey', label: 'Licensekey (레거시)', required: false, secret: true, storage: 'secretKey' },
      { key: 'clientId', label: 'Client ID (APP API)', required: false, storage: 'accessKey' },
      { key: 'clientSecret', label: 'Client Secret (APP API)', required: false, secret: true, storage: 'secretKey' },
    ],
    memo: '레거시는 상점별 도메인 호출 → 프록시 whitelist 별도 설계. connect.makeshop.co.kr 중앙 API 권장.',
    marketplaceGroupId: 'makeshop',
    requiresFixedIpProxy: true,
  },

  // ── 제한·보류 direct ─────────────────────────────────────────
  {
    channelCode: 'gmarket',
    channelName: 'G마켓/옥션 (ESM)',
    integrationType: 'direct_api',
    authType: 'manual',
    supportedActions: [],
    apiStatus: 'blocked',
    phase: 'partnership_required',
    requiredSellerAction: 'ESMPLUS 셀링툴 업체 등록 — 엑클로드 등록 전까지 direct API 불가',
    tokenExpirePolicy: 'n/a',
    rateLimitMemo: 'n/a',
    proxyDomains: [],
    requiredInputs: [
      { key: 'accountName', label: '접속별칭', required: true, storage: 'accountName' },
      { key: 'sellerId', label: '판매 아이디', required: true, storage: 'sellerId' },
    ],
    memo: '8888 1차 후보이나 ESM 셀링툴 승인 필요. hub 또는 excel 대안.',
    marketplaceGroupId: 'gmarket',
    requiresFixedIpProxy: true,
  },
  {
    channelCode: 'kakao_talkstore',
    channelName: '카카오톡스토어',
    integrationType: 'direct_api',
    authType: ['oauth2', 'api_key'],
    supportedActions: [...PHASE1_ACTIONS, ...FUTURE_ACTIONS],
    apiStatus: 'restricted',
    phase: 'partnership_required',
    requiredSellerAction:
      '카카오쇼핑 Open API 연동대행사 별도 신청 → 카카오 Developers 앱 + 판매자 API 인증키 + POST /v1/store/register',
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
    memo: '대형제휴·대행사·호스팅사 선정 후 이용. 테스트 환경 없음.',
    marketplaceGroupId: 'kakao_talkstore',
    requiresFixedIpProxy: true,
  },

  // ── hub_api ─────────────────────────────────────────────────
  {
    channelCode: 'playauto',
    channelName: '플레이오토',
    integrationType: 'hub_api',
    authType: 'api_key',
    supportedActions: [...PHASE1_ACTIONS, ...FUTURE_ACTIONS],
    apiStatus: 'pending_check',
    phase: 'planned',
    requiredSellerAction: '플레이오토 API 계약·키 발급 — 허브 경유 다채널 주문 수집',
    tokenExpirePolicy: '플레이오토 API 정책 — 계약 후 확인',
    rateLimitMemo: '허브 API — 플레이오토 문서',
    proxyDomains: [],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'apiKey', label: 'API Key', required: true, secret: true, storage: 'apiKey' },
    ],
    memo: '8888 허브 1순위. API 도메인·계약 조건 확인 필요.',
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
    requiredSellerAction: '사방넷 API 서비스 신청 — companyId, authKey, 접근번호',
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
    memo: '허브·OMS. 약 650 채널. 유료 API·호스트 번호 확인.',
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
    phase: 'planned',
    requiredSellerAction: '샵링커 API·연동 계약 — 400+ 채널',
    tokenExpirePolicy: '샵링커 API 정책',
    rateLimitMemo: '허브 API',
    proxyDomains: [],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'apiKey', label: 'API Key', required: true, secret: true, storage: 'apiKey' },
    ],
    memo: '8888 허브 후보. 연동 목록 공개 풍부.',
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
    requiredSellerAction: '이지어드민 API 연동 신청',
    tokenExpirePolicy: '이지어드민 API 정책',
    rateLimitMemo: '허브 API',
    proxyDomains: [],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'apiKey', label: 'API Key', required: true, secret: true, storage: 'apiKey' },
    ],
    memo: '8888 기준군. 11번가·G마켓·롯데ON·스마트스토어·쿠팡 등.',
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
    phase: 'planned',
    requiredSellerAction: '샵플링 고도화 API 계약',
    tokenExpirePolicy: '샵플링 API 정책',
    rateLimitMemo: '허브 API',
    proxyDomains: [],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'apiKey', label: 'API Key', required: true, secret: true, storage: 'apiKey' },
    ],
    memo: '8888 ERP 고도화 API 후보.',
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
    phase: 'planned',
    requiredSellerAction: '셀메이트 API 신청',
    tokenExpirePolicy: '셀메이트 API 정책',
    rateLimitMemo: '허브 API',
    proxyDomains: [],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'apiKey', label: 'API Key', required: true, secret: true, storage: 'apiKey' },
    ],
    memo: '8888 기준군. 테무 등 확장 사례.',
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
    phase: 'planned',
    requiredSellerAction: '셀릭(세원셀릭) API·연동 계약',
    tokenExpirePolicy: '셀릭 API 정책',
    rateLimitMemo: '허브 API',
    proxyDomains: [],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'apiKey', label: 'API Key', required: true, secret: true, storage: 'apiKey' },
    ],
    memo: '8888 통합관리 솔루션.',
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
    phase: 'planned',
    requiredSellerAction: '셀픽(신세계셀픽) API·연동 계약',
    tokenExpirePolicy: '셀픽 API 정책',
    rateLimitMemo: '허브 API',
    proxyDomains: [],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'apiKey', label: 'API Key', required: true, secret: true, storage: 'apiKey' },
    ],
    memo: 'SSG·스마트스토어·쿠팡·G마켓·11번가 연동 사례.',
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
    phase: 'planned',
    requiredSellerAction: '이지위너 API·연동 계약',
    tokenExpirePolicy: '이지위너 API 정책',
    rateLimitMemo: '허브 API',
    proxyDomains: [],
    requiredInputs: [
      { key: 'accountName', label: '계정명', required: true, storage: 'accountName' },
      { key: 'apiKey', label: 'API Key', required: true, secret: true, storage: 'apiKey' },
    ],
    memo: '8888 기준군(오늘의집 안내 9곳).',
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

export function getHubApiChannels(): ChannelIntegrationSpec[] {
  return getChannelsByIntegrationType('hub_api');
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
 * direct_api + hub_api 동시 활성화 시 중복 주문 수집 방지용.
 */
export function detectMarketplaceSourceConflicts(
  activeChannelCodes: string[],
): MarketplaceSourceConflict[] {
  const groupToChannels = new Map<string, Set<string>>();

  for (const code of activeChannelCodes) {
    const spec = getChannelIntegrationSpec(code);
    if (!spec || spec.integrationType === 'excel_upload') continue;

    const groups = getMarketplaceGroupsForChannel(code);
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
  if (spec.phase === 'blocked' || spec.integrationType === 'excel_upload') return [];

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
    phase: spec.phase === 'partnership_required' ? 'blocked' : spec.phase,
    authKind: legacyAuthKind(spec),
    requiresFixedIpProxy: spec.requiresFixedIpProxy ?? false,
    upstreamHosts,
    credentialFields: spec.requiredInputs,
    orderFetchScope,
    stateMutationSupported: false,
    blockers:
      spec.phase === 'blocked' || spec.phase === 'partnership_required'
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
