import { describe, expect, it } from 'vitest';
import {
  sanitizePublicIntegrationErrorMessage,
  sanitizePublicOptionalIntegrationErrorMessage,
  toPublicTransportDto,
} from '@/app/lib/order-integration/public-api-safety';

describe('sanitizePublicIntegrationErrorMessage', () => {
  it('환경변수명·내부 오류 코드·경로·주소·비밀 패턴을 브라우저 문구에서 제거한다', () => {
    const result = sanitizePublicIntegrationErrorMessage(
      'INTEGRATION_PROXY_BASE_URL https://proxy.internal/internal/integration/invoke GW.AUTHN invalid_client Authorization: Bearer-abc client_secret=top-secret',
    );

    expect(result).not.toMatch(/INTEGRATION_PROXY_BASE_URL|proxy\.internal|\/internal\/|GW\.AUTHN|invalid_client/i);
    expect(result).not.toMatch(/Bearer-abc|top-secret/);
  });

  it('HTML을 제거하고 최대 500자로 제한한다', () => {
    const result = sanitizePublicIntegrationErrorMessage(`<html><body>${'오류'.repeat(400)}</body></html>`);
    expect(result).not.toContain('<html>');
    expect(result.length).toBeLessThanOrEqual(500);
  });

  it('기존 DB 오류 문구도 null은 유지하고 내부 식별자를 제거한다', () => {
    expect(sanitizePublicOptionalIntegrationErrorMessage(null)).toBeNull();
    expect(sanitizePublicOptionalIntegrationErrorMessage('GW.AUTHN invalid_client')).not.toMatch(
      /GW\.AUTHN|invalid_client/i,
    );
  });
});

describe('toPublicTransportDto', () => {
  it('내부 주소·허용 호스트·호출 경로 없이 필요한 상태만 반환한다', () => {
    const result = toPublicTransportDto({ mode: 'proxy', proxyConfigured: true });
    expect(result).toEqual({ mode: 'proxy', configured: true });
    expect(JSON.stringify(result)).not.toMatch(/proxyBaseUrl|allowedHosts|whitelist|invokePath|internal/i);
  });
});
