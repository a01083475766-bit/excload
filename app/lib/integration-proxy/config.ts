import {
  getIntegrationProxyAllowedHostnames,
  getIntegrationProxyWhitelist,
} from '@/app/lib/integration-proxy/allowed-domains';

export type IntegrationTransportMode = 'proxy' | 'direct';

const INTEGRATION_INVOKE_PATH = '/internal/integration/invoke';

function readEnv(name: string): string | null {
  return process.env[name]?.trim() || null;
}

/** 신규 env 우선, 기존 COUPANG_PROXY_* 호환 */
export function getIntegrationProxyBaseUrl(): string | null {
  const raw =
    readEnv('INTEGRATION_PROXY_BASE_URL') ?? readEnv('COUPANG_PROXY_BASE_URL');
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

export function getIntegrationProxySharedSecret(): string | null {
  return (
    readEnv('INTEGRATION_PROXY_SHARED_SECRET') ?? readEnv('COUPANG_PROXY_SHARED_SECRET')
  );
}

export function getIntegrationProxyKeyId(): string {
  return (
    readEnv('INTEGRATION_PROXY_KEY_ID') ?? readEnv('COUPANG_PROXY_KEY_ID') ?? 'default'
  );
}

export function getIntegrationProxyInvokePath(): string {
  return INTEGRATION_INVOKE_PATH;
}

export function resolveIntegrationTransportMode(): IntegrationTransportMode {
  const baseUrl = getIntegrationProxyBaseUrl();
  const secret = getIntegrationProxySharedSecret();
  if (baseUrl && secret) return 'proxy';
  return 'direct';
}

export function isIntegrationProxyConfigured(): boolean {
  return resolveIntegrationTransportMode() === 'proxy';
}

export function getIntegrationTransportInfo() {
  const mode = resolveIntegrationTransportMode();
  const proxyBaseUrl = getIntegrationProxyBaseUrl();

  return {
    mode,
    proxyBaseUrl,
    proxyConfigured: Boolean(proxyBaseUrl && getIntegrationProxySharedSecret()),
    allowedHosts: getIntegrationProxyAllowedHostnames(),
    whitelist: getIntegrationProxyWhitelist(),
    invokePath: INTEGRATION_INVOKE_PATH,
    legacyCoupangInvokePath: '/internal/coupang/invoke',
  };
}

export function assertIntegrationProxyConfigReady(): void {
  const baseUrl = getIntegrationProxyBaseUrl();
  const secret = getIntegrationProxySharedSecret();

  if (!baseUrl) {
    throw new Error(
      'INTEGRATION_PROXY_BASE_URL(또는 COUPANG_PROXY_BASE_URL) 환경변수가 설정되지 않았습니다.',
    );
  }
  if (!secret) {
    throw new Error(
      'INTEGRATION_PROXY_SHARED_SECRET(또는 COUPANG_PROXY_SHARED_SECRET) 환경변수가 설정되지 않았습니다.',
    );
  }
}
