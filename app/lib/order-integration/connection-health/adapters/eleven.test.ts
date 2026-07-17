import { describe, expect, it, vi } from 'vitest';
import { runElevenHealthCheck } from './eleven';

const credentials = { openapikey: 'test-key' };

describe('runElevenHealthCheck', () => {
  it('정상 XML 빈 응답(2xx) → HEALTHY', async () => {
    const http = vi.fn().mockResolvedValue({ httpStatus: 200, bodyText: '' });
    const res = await runElevenHealthCheck({ http, credentials });
    expect(res.status).toBe('HEALTHY');
  });

  it('HTTP 401 → AUTH_REQUIRED', async () => {
    const http = vi.fn().mockResolvedValue({ httpStatus: 401, bodyText: '' });
    const res = await runElevenHealthCheck({ http, credentials });
    expect(res.status).toBe('AUTH_REQUIRED');
  });

  it('openapikey 오류 XML(2xx 본문) → AUTH_REQUIRED', async () => {
    const http = vi.fn().mockResolvedValue({
      httpStatus: 200,
      bodyText: '<result><errorCode>101</errorCode><errorMessage>openapikey is invalid</errorMessage></result>',
    });
    const res = await runElevenHealthCheck({ http, credentials });
    expect(res.status).toBe('AUTH_REQUIRED');
  });

  it('네트워크 예외 → TEMPORARY_ERROR', async () => {
    const http = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const res = await runElevenHealthCheck({ http, credentials });
    expect(res.status).toBe('TEMPORARY_ERROR');
    expect(res.rawCode).toBe('NETWORK');
  });

  it('요청 URL/헤더에 openapikey는 담기지만 rawMessage에는 시크릿을 노출하지 않는다', async () => {
    const http = vi.fn().mockResolvedValue({ httpStatus: 500, bodyText: '<result><errorCode>500</errorCode><errorMessage>server error</errorMessage></result>' });
    const res = await runElevenHealthCheck({ http, credentials });
    expect(res.status).toBe('TEMPORARY_ERROR');
    expect(res.rawMessage ?? '').not.toContain('test-key');
  });
});
