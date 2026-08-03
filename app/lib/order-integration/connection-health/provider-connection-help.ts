import type { OrderIntegrationMallId } from '@/app/lib/order-integration/malls';
import type { HealthStatus } from './types';

/**
 * 공급자별 "연결 오류 안내" 메타데이터.
 * messages.ts에 쇼핑몰 이름을 조건문으로 계속 추가하지 않고, 공통 상태 메시지와
 * 이 메타데이터를 조합해 사용자 안내 문구를 만든다.
 *
 * 주의: 여기에는 사용자에게 보여줄 사람 친화적 문구만 담는다.
 * 내부 상태명(AUTH_REQUIRED 등)·오류코드(GW.AUTHN 등)·healthStatus·rawMessage는 절대 넣지 않는다.
 */
export type ProviderConnectionHelp = {
  mallId: OrderIntegrationMallId;
  /** 사용자에게 보이는 쇼핑몰 이름(예: 스마트스토어). */
  providerLabel: string;
  /** 판매자/개발자센터 이름(예: 네이버 커머스API센터). */
  externalCenterLabel: string;
  /**
   * 관리센터 공식 URL. 확정되지 않은 몰은 넣지 않는다(추정 링크 금지).
   * URL이 없으면 화면에서 관리센터 버튼을 표시하지 않는다.
   */
  externalCenterUrl?: string;
  /** 연동 정보 수정 이동 경로(해당 쇼핑몰 연결 설정 화면). */
  settingsUrl: string;
  /** 인증정보 명칭(예: 애플리케이션 ID, 시크릿). */
  credentialLabels: string[];
  /** AUTH_REQUIRED 전용 제목(예: 네이버 연결 정보 확인 필요). 없으면 공통 규칙으로 생성. */
  authRequiredTitle?: string;
  /** AUTH_REQUIRED 전용 안내(공급자 특화). 없으면 공통 문구 사용. */
  authRequiredDescription?: string;
  /** 확인 항목(AUTH_REQUIRED). */
  authRequiredChecks: string[];
  ipRequiredChecks?: string[];
  permissionRequiredChecks?: string[];
  approvalRequiredChecks?: string[];
};

function settingsPath(mallId: OrderIntegrationMallId): string {
  return `/order/integration/${mallId}`;
}

/**
 * 공급자별 안내 메타데이터.
 * URL은 기존 설정 가이드(mall-setup-guides)에서 쓰는 공식 센터 주소와 동일한 값만 사용한다.
 * 확정 URL이 없는 몰(예: 샵바이)은 externalCenterUrl을 비워 두어 관리센터 버튼을 숨긴다.
 * CJ온스타일은 PROVISIONAL(운영 자동검사 제외)이라 상세 오류 안내를 만들지 않는다.
 */
export const PROVIDER_CONNECTION_HELP: Partial<
  Record<OrderIntegrationMallId, ProviderConnectionHelp>
> = {
  smartstore: {
    mallId: 'smartstore',
    providerLabel: '스마트스토어',
    externalCenterLabel: '네이버 커머스API센터',
    externalCenterUrl: 'https://apicenter.commerce.naver.com',
    settingsUrl: settingsPath('smartstore'),
    credentialLabels: ['애플리케이션 ID', '애플리케이션 시크릿'],
    authRequiredTitle: '네이버 연결 정보 확인 필요',
    authRequiredDescription:
      '네이버 커머스API센터에서 내 스토어 애플리케이션이 사용 중 상태인지 확인해 주세요. 애플리케이션 ID 또는 시크릿을 변경·재발급했다면 엑클로드 연동 설정에서도 새 값으로 수정한 뒤 다시 확인해 주세요.',
    authRequiredChecks: [
      '애플리케이션 사용 중·일시중단 상태',
      '애플리케이션 ID',
      '애플리케이션 시크릿',
      'API 호출 IP',
      '주문 관련 API 권한',
    ],
    ipRequiredChecks: ['API 호출 IP에 엑클로드 IP 등록'],
    permissionRequiredChecks: ['주문 관련 API 권한 선택'],
    approvalRequiredChecks: ['애플리케이션 사용 중·일시중단 상태'],
  },
  coupang: {
    mallId: 'coupang',
    providerLabel: '쿠팡',
    externalCenterLabel: '쿠팡 판매자센터',
    externalCenterUrl: 'https://wing.coupang.com',
    settingsUrl: settingsPath('coupang'),
    credentialLabels: ['Access Key', 'Secret Key'],
    authRequiredTitle: '쿠팡 연결 정보 확인 필요',
    authRequiredDescription:
      '쿠팡 판매자센터의 OPEN API 설정에서 API 키의 사용 상태와 만료 여부를 확인해 주세요. Access Key 또는 Secret Key가 변경되었다면 엑클로드 연동 설정에서도 수정한 뒤 다시 확인해 주세요.',
    authRequiredChecks: ['Access Key', 'Secret Key', 'API 키 만료 여부', '판매자 코드와 주문조회 권한'],
    permissionRequiredChecks: ['주문조회 권한'],
    approvalRequiredChecks: ['OPEN API 사용 상태'],
  },
  eleven: {
    mallId: 'eleven',
    providerLabel: '11번가',
    externalCenterLabel: '11번가 OpenAPI',
    externalCenterUrl: 'https://openapi.11st.co.kr',
    settingsUrl: settingsPath('eleven'),
    credentialLabels: ['Open API Key'],
    authRequiredTitle: '11번가 연결 정보 확인 필요',
    authRequiredDescription:
      '11번가 Open API 설정에서 API Key가 정상 사용 중인지 확인해 주세요. 키가 변경되거나 재발급됐다면 엑클로드 연동 설정에서도 수정한 뒤 다시 확인해 주세요.',
    authRequiredChecks: ['Open API Key', 'API 사용 상태', '주문조회 권한', 'API 호출 IP가 필요한 경우 등록 상태'],
    ipRequiredChecks: ['API 호출 IP 등록 상태'],
    permissionRequiredChecks: ['주문조회 권한'],
  },
  cafe24: {
    mallId: 'cafe24',
    providerLabel: '카페24',
    externalCenterLabel: '카페24 개발자센터',
    externalCenterUrl: 'https://developers.cafe24.com',
    settingsUrl: settingsPath('cafe24'),
    credentialLabels: ['몰 ID'],
    authRequiredTitle: '카페24 연결 정보 확인 필요',
    authRequiredDescription:
      '카페24 앱 연결 상태와 주문조회 권한을 확인해 주세요. 앱 연결이 해제됐거나 인증이 만료된 경우 다시 연결한 뒤 확인해 주세요.',
    authRequiredChecks: ['몰 ID', '앱·OAuth 연결 상태', '주문조회 권한', '재연결 필요 여부'],
    permissionRequiredChecks: ['주문조회 권한'],
    approvalRequiredChecks: ['앱 설치·연결 상태'],
  },
  lotteon: {
    mallId: 'lotteon',
    providerLabel: '롯데ON',
    externalCenterLabel: '롯데ON 판매자센터',
    externalCenterUrl: 'https://store.lotteon.com',
    settingsUrl: settingsPath('lotteon'),
    credentialLabels: ['API Key', '판매자정보'],
    authRequiredTitle: '롯데ON 연결 정보 확인 필요',
    authRequiredDescription:
      '롯데ON API 설정에서 API Key, 판매자정보 및 서비스 승인 상태를 확인해 주세요. 변경된 정보가 있다면 엑클로드 설정에서도 수정한 뒤 다시 확인해 주세요.',
    authRequiredChecks: ['API Key', '판매자정보', '서비스 승인 상태', '주문조회 권한'],
    permissionRequiredChecks: ['주문조회 권한'],
    approvalRequiredChecks: ['서비스 승인·계약 상태'],
  },
  ssg: {
    mallId: 'ssg',
    providerLabel: 'SSG',
    externalCenterLabel: 'SSG 파트너오피스',
    externalCenterUrl: 'https://po.ssgadm.com',
    settingsUrl: settingsPath('ssg'),
    credentialLabels: ['인증키', '협력사 코드'],
    authRequiredTitle: 'SSG 연결 정보 확인 필요',
    authRequiredDescription:
      'SSG 연동 설정에서 인증키, 협력사 코드와 API 사용 상태를 함께 확인해 주세요. 인증과 IP 중 정확한 원인을 구분할 수 없는 경우 둘 다 확인해 주세요.',
    authRequiredChecks: ['인증키', '협력사 코드', 'API 사용 상태', 'API 호출 IP 등록 상태'],
    ipRequiredChecks: ['API 호출 IP 등록 상태'],
    permissionRequiredChecks: ['주문조회 권한'],
  },
  shopby: {
    mallId: 'shopby',
    providerLabel: 'NHN커머스/샵바이',
    externalCenterLabel: '샵바이 관리자',
    // 공식 관리센터 URL이 확정되지 않아 링크를 넣지 않는다(추정 링크 금지).
    settingsUrl: settingsPath('shopby'),
    credentialLabels: ['System Key', 'Mall Key'],
    authRequiredTitle: '샵바이 연결 정보 확인 필요',
    authRequiredChecks: ['System Key', 'Mall Key', 'API 사용 상태', '주문조회 권한'],
    permissionRequiredChecks: ['주문조회 권한'],
  },
  godomall: {
    mallId: 'godomall',
    providerLabel: '고도몰',
    externalCenterLabel: '고도몰 개발자센터',
    externalCenterUrl: 'https://devcenter.godo.co.kr',
    settingsUrl: settingsPath('godomall'),
    credentialLabels: ['사용자 Key'],
    authRequiredTitle: '고도몰 연결 정보 확인 필요',
    authRequiredChecks: ['사용자 Key', '서버 Partner Key 설정', 'API 사용 상태', '주문조회 권한'],
    permissionRequiredChecks: ['주문조회 권한'],
  },
  makeshop: {
    mallId: 'makeshop',
    providerLabel: '메이크샵',
    externalCenterLabel: '메이크샵 개발자센터',
    externalCenterUrl: 'https://developer.makeshop.co.kr',
    settingsUrl: settingsPath('makeshop'),
    credentialLabels: ['Client ID', 'Client Secret'],
    authRequiredTitle: '메이크샵 연결 정보 확인 필요',
    authRequiredChecks: ['앱 설치·승인 상태', 'Client ID·Secret', 'OAuth 연결 상태', '주문조회 권한', '허용 IP 설정'],
    ipRequiredChecks: ['허용 IP 설정'],
    permissionRequiredChecks: ['주문조회 권한'],
    approvalRequiredChecks: ['앱 설치·승인 상태'],
  },
  domeggook: {
    mallId: 'domeggook',
    providerLabel: '도매꾹',
    externalCenterLabel: '도매꾹 Open API',
    externalCenterUrl: 'https://domeggook.com',
    settingsUrl: settingsPath('domeggook'),
    credentialLabels: ['회원 ID', '비밀번호', 'API Key'],
    authRequiredTitle: '도매꾹 연결 정보 확인 필요',
    authRequiredDescription:
      '도매꾹 회원 ID·비밀번호·API Key와 Private API(판매관리·로그인) 승인 상태를 확인해 주세요. 정보가 변경됐다면 엑클로드 연동 설정에서도 수정한 뒤 다시 확인해 주세요.',
    authRequiredChecks: ['회원 ID', '비밀번호', 'API Key', 'Private API 승인 상태', '판매 주문조회 권한'],
    permissionRequiredChecks: ['Private API 판매관리·로그인 권한'],
    approvalRequiredChecks: ['Private API 승인 상태'],
  },
};

export function getProviderConnectionHelp(
  mallId: OrderIntegrationMallId,
): ProviderConnectionHelp | undefined {
  return PROVIDER_CONNECTION_HELP[mallId];
}

/** ACCOUNT_CONFIG_ERROR 안내의 안전한 원인 구분(사용자 수정 vs 엑클로드 서버 설정). */
export type ConfigErrorScope = 'account' | 'server';

/** 서버 설정 오류로 보는 내부 코드(사용자가 고칠 수 없음). */
const SERVER_CONFIG_CODES: ReadonlySet<string> = new Set([
  'PROXY_NOT_CONFIGURED',
  'PARTNER_KEY_MISSING',
]);

/**
 * 정제된 오류 코드를 안전한 설정 오류 scope로 변환한다(서버 전용 계산).
 * 원본 코드 문자열은 UI로 전달하지 않고, 이 함수가 반환하는 scope만 전달한다.
 * 알 수 없는 코드는 사용자 수정 가능(account)으로 보수적으로 처리해 설정 확인을 유도한다.
 */
export function configErrorScopeFromCode(code: string | null | undefined): ConfigErrorScope {
  if (!code) return 'account';
  if (SERVER_CONFIG_CODES.has(code) || code.includes('PROXY') || code.includes('SERVER')) {
    return 'server';
  }
  return 'account';
}

/** 화면 안내 톤. ok=정상, info=중립, warn=일시/주의, error=사용자 조치 필요. */
export type ConnectionHelpTone = 'info' | 'warn' | 'error';

/** UI가 그대로 렌더할 수 있는 최종 안내 뷰. 내부 코드·원문은 포함하지 않는다. */
export type ConnectionHelpView = {
  title: string;
  description: string;
  checks: string[];
  center?: { label: string; url: string };
  settingsUrl?: string;
  showSettings: boolean;
  showRecheck: boolean;
  tone: ConnectionHelpTone;
};

const COMMON = {
  authRequired:
    '쇼핑몰 관리센터에서 앱·API 사용 상태와 인증정보를 확인해 주세요. 정보가 변경됐다면 엑클로드 연동 설정에서도 수정한 뒤 다시 확인해 주세요.',
  ipNotAllowed:
    '쇼핑몰 관리센터의 API 호출 IP 또는 허용 IP에 엑클로드 고정 IP를 등록해 주세요. 등록 후 다시 확인해 주세요.',
  permissionDenied:
    '쇼핑몰 앱 또는 API 설정에서 주문조회에 필요한 권한이 선택되어 있는지 확인해 주세요. 권한을 변경한 뒤 다시 확인해 주세요.',
  approvalRequired:
    '쇼핑몰 관리센터에서 앱 설치, 서비스 승인, 계약 또는 사용 중지 상태를 확인해 주세요. 정상 상태로 변경된 뒤 다시 확인해 주세요.',
  configUser:
    '필수 연결정보가 누락되었거나 올바르지 않습니다. 엑클로드 연동 설정을 확인해 주세요.',
  configServer:
    '엑클로드 연결 설정을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.',
  rateLimited:
    '쇼핑몰 API 호출이 일시적으로 제한되었습니다. 연결이 해제된 것은 아니며, 잠시 후 다시 확인해 주세요.',
  temporary:
    '쇼핑몰 또는 네트워크의 일시적인 문제로 연결을 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.',
} as const;

function centerOf(help?: ProviderConnectionHelp): { label: string; url: string } | undefined {
  if (help?.externalCenterUrl) return { label: help.externalCenterLabel, url: help.externalCenterUrl };
  return undefined;
}

export type ConnectionHelpInput = {
  mallId: OrderIntegrationMallId;
  status: HealthStatus;
  /**
   * ACCOUNT_CONFIG_ERROR 원인 구분(서버에서 정제해 전달). 같은 몰에서 사용자 오류와
   * 서버 설정 오류가 모두 날 수 있으므로 mallId·status만으로 판단하지 않는다.
   */
  configErrorScope?: ConfigErrorScope | null;
};

/**
 * 몰 + 저장 상태로부터 사용자 안내 뷰를 만든다.
 * - HEALTHY / REQUEST_INVALID(중립) / 도움말 없는 몰: null 반환(상세 안내 미표시).
 * - 정확한 원인이 특정되지 않은 상태(UNKNOWN)는 "연결 정보 확인 필요"로 안내하고 단정하지 않는다.
 */
export function buildConnectionHelp(input: ConnectionHelpInput): ConnectionHelpView | null {
  const { mallId, status, configErrorScope } = input;
  if (status === 'HEALTHY' || status === 'REQUEST_INVALID') return null;
  const help = getProviderConnectionHelp(mallId);
  const providerLabel = help?.providerLabel ?? '쇼핑몰';
  const center = centerOf(help);
  const settingsUrl = help?.settingsUrl;

  switch (status) {
    case 'AUTH_REQUIRED':
      return {
        title: help?.authRequiredTitle ?? `${providerLabel} 연결 정보 확인 필요`,
        description: help?.authRequiredDescription ?? COMMON.authRequired,
        checks: help?.authRequiredChecks ?? [],
        center,
        settingsUrl,
        showSettings: Boolean(settingsUrl),
        showRecheck: true,
        tone: 'error',
      };
    case 'IP_NOT_ALLOWED':
      return {
        title: `${providerLabel} · API 호출 IP 등록 필요`,
        description: COMMON.ipNotAllowed,
        checks: help?.ipRequiredChecks ?? [],
        center,
        settingsUrl,
        showSettings: Boolean(settingsUrl),
        showRecheck: true,
        tone: 'error',
      };
    case 'PERMISSION_DENIED':
      return {
        title: `${providerLabel} 주문 API 권한 확인 필요`,
        description: COMMON.permissionDenied,
        checks: help?.permissionRequiredChecks ?? [],
        center,
        settingsUrl,
        showSettings: Boolean(settingsUrl),
        showRecheck: true,
        tone: 'error',
      };
    case 'APPROVAL_REQUIRED':
      return {
        title: `${providerLabel} 앱·서비스 상태 확인 필요`,
        description: COMMON.approvalRequired,
        checks: help?.approvalRequiredChecks ?? [],
        center,
        settingsUrl,
        showSettings: Boolean(settingsUrl),
        showRecheck: true,
        tone: 'warn',
      };
    case 'ACCOUNT_CONFIG_ERROR': {
      // 서버 설정 문제면 사용자가 고칠 수 없으므로 설정 이동 버튼을 숨긴다.
      const isServer = configErrorScope === 'server';
      return {
        title: `${providerLabel} 연결 설정 확인 필요`,
        description: isServer ? COMMON.configServer : COMMON.configUser,
        checks: [],
        center: isServer ? undefined : center,
        settingsUrl: isServer ? undefined : settingsUrl,
        showSettings: isServer ? false : Boolean(settingsUrl),
        showRecheck: true,
        tone: 'error',
      };
    }
    case 'RATE_LIMITED':
      return {
        title: `${providerLabel} 일시적 호출 제한`,
        description: COMMON.rateLimited,
        checks: [],
        showSettings: false,
        showRecheck: true,
        tone: 'warn',
      };
    case 'TEMPORARY_ERROR':
      return {
        title: `${providerLabel} 일시적 연결 문제`,
        description: COMMON.temporary,
        checks: [],
        showSettings: false,
        showRecheck: true,
        tone: 'warn',
      };
    case 'UNKNOWN':
    default:
      return {
        title: `${providerLabel} 연결 정보 확인 필요`,
        description: COMMON.authRequired,
        checks: [],
        center,
        settingsUrl,
        showSettings: Boolean(settingsUrl),
        showRecheck: true,
        tone: 'warn',
      };
  }
}
