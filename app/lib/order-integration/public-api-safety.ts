import type { IntegrationTransportMode } from '@/app/lib/integration-proxy/config';

const PUBLIC_ERROR_MAX = 500;
const INTERNAL_IDENTIFIER_PATTERN =
  /\b(?:EXCLOAD_[A-Z0-9_]+|INTEGRATION_[A-Z0-9_]+|COUPANG_PROXY_[A-Z0-9_]+|MAKESHOP_[A-Z0-9_]+|GODOMALL_[A-Z0-9_]+)\b/gi;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(?:authorization|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret|signature)\s*[:=]\s*[^\s,;]+/gi;
const INTERNAL_CODE_PATTERN = /\b(?:GW\.AUTHN|invalid_client)\b/gi;
const INTERNAL_PATH_PATTERN = /\/(?:internal|api)\/[a-z0-9_./-]+/gi;
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;

/** 브라우저 응답에 외부 원문·서버 설정 식별자가 섞이지 않도록 사용자 안내 문구를 정제한다. */
export function sanitizePublicIntegrationErrorMessage(
  message: string,
  fallback = '쇼핑몰 API 요청을 처리하지 못했습니다. 연결 정보를 확인한 뒤 다시 시도해 주세요.',
): string {
  const raw = typeof message === 'string' ? message : '';
  if (!raw.trim()) return fallback;

  const withoutMarkup = raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');

  const sanitized = withoutMarkup
    .replace(SECRET_ASSIGNMENT_PATTERN, '인증 정보=[보호됨]')
    .replace(INTERNAL_IDENTIFIER_PATTERN, '서버 설정')
    .replace(INTERNAL_CODE_PATTERN, '인증 오류')
    .replace(INTERNAL_PATH_PATTERN, '내부 연결 경로')
    .replace(URL_PATTERN, '서버 연결 주소')
    .replace(/\s+/g, ' ')
    .trim();

  if (!sanitized) return fallback;
  return sanitized.length > PUBLIC_ERROR_MAX ? `${sanitized.slice(0, PUBLIC_ERROR_MAX - 1)}…` : sanitized;
}

export function sanitizePublicOptionalIntegrationErrorMessage(
  message: string | null | undefined,
): string | null {
  return message ? sanitizePublicIntegrationErrorMessage(message) : null;
}

/** 내부 프록시 주소·허용 호스트·호출 경로를 제외한 브라우저용 전송 상태. */
export function toPublicTransportDto(input: {
  mode: IntegrationTransportMode;
  proxyConfigured?: boolean;
}): { mode: IntegrationTransportMode; configured: boolean } {
  return {
    mode: input.mode,
    configured: input.mode === 'proxy' && input.proxyConfigured !== false,
  };
}
