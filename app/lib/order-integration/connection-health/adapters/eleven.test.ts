import { describe, expect, it, vi } from 'vitest';
import { classifyElevenOperationError, runElevenHealthCheck } from './eleven';

const credentials = { openapikey: 'test-key' };

describe('runElevenHealthCheck', () => {
  it('정상 XML 빈 응답(2xx) → HEALTHY (complete+standing)', async () => {
    const http = vi.fn().mockResolvedValue({ httpStatus: 200, bodyText: '<Orders><resultCode>0</resultCode></Orders>' });
    const res = await runElevenHealthCheck({ http, credentials });
    expect(res.status).toBe('HEALTHY');
    expect(http).toHaveBeenCalledTimes(2);
    expect(String(http.mock.calls[0][0].url)).toContain('/rest/ordservices/complete/');
    expect(String(http.mock.calls[1][0].url)).toContain('/rest/ordservices/standing/');
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
    expect(res.rawCode).toBe('101');
  });

  it('standing 실패만 있어도 연결 실패로 본다', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce({ httpStatus: 200, bodyText: '<Orders><resultCode>0</resultCode></Orders>' })
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: '<ResultOrder><resultCode>005</resultCode><resultMessage>accessDeny</resultMessage></ResultOrder>',
      });
    const res = await runElevenHealthCheck({ http, credentials });
    expect(res.status).toBe('IP_NOT_ALLOWED');
    expect(res.rawCode).toBe('005');
  });

  it('네트워크 예외 → TEMPORARY_ERROR', async () => {
    const http = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const res = await runElevenHealthCheck({ http, credentials });
    expect(res.status).toBe('TEMPORARY_ERROR');
    expect(res.rawCode).toBe('NETWORK');
  });

  it('요청 URL/헤더에 openapikey는 담기지만 rawMessage에는 시크릿을 노출하지 않는다', async () => {
    const http = vi.fn().mockResolvedValue({
      httpStatus: 500,
      bodyText: '<result><errorCode>500</errorCode><errorMessage>server error</errorMessage></result>',
    });
    const res = await runElevenHealthCheck({ http, credentials });
    expect(res.status).toBe('TEMPORARY_ERROR');
    expect(res.rawMessage ?? '').not.toContain('test-key');
  });
});

describe('classifyElevenOperationError', () => {
  it('bracket code accessDeny → IP_NOT_ALLOWED', () => {
    expect(classifyElevenOperationError(new Error('[005] accessDeny'))).toBe('IP_NOT_ALLOWED');
  });

  it('인증키 메시지 → AUTH_REQUIRED', () => {
    expect(classifyElevenOperationError(new Error('[-1] 인증키 오류'))).toBe('AUTH_REQUIRED');
  });
});
