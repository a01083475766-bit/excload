import { describe, expect, it, vi } from 'vitest';
import { runDomeggookHealthCheck } from './domeggook';

const credentials = {
  memberId: 'seller-demo',
  password: 'pw-secret-value',
  apiKey: 'aid-secret-value',
};

describe('runDomeggookHealthCheck', () => {
  it('setLogin + getOrderList 성공(0건) → HEALTHY', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({ header: { code: '0' }, login: { sId: 'SESSION-XYZ' } }),
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({ header: { code: '0' }, list: [] }),
      });

    const res = await runDomeggookHealthCheck({
      http,
      credentials,
      outboundIp: '54.180.45.46',
    });
    expect(res.status).toBe('HEALTHY');
    expect(JSON.stringify(res)).not.toContain('SESSION-XYZ');
    expect(JSON.stringify(res)).not.toContain('pw-secret-value');
  });

  it('로그인 실패 → AUTH_REQUIRED', async () => {
    const http = vi.fn().mockResolvedValue({
      httpStatus: 200,
      bodyText: JSON.stringify({ header: { code: 'E100', message: '로그인 실패' } }),
    });
    const res = await runDomeggookHealthCheck({
      http,
      credentials,
      outboundIp: '54.180.45.46',
    });
    expect(res.status).toBe('AUTH_REQUIRED');
    expect(res.rawMessage ?? '').not.toContain('pw-secret-value');
  });

  it('권한 오류 → PERMISSION_DENIED', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        bodyText: JSON.stringify({ header: { code: '0' }, login: { sId: 'SESSION-XYZ' } }),
      })
      .mockResolvedValueOnce({
        httpStatus: 403,
        bodyText: JSON.stringify({ header: { code: 'E403', message: 'Private API 권한 없음' } }),
      });
    const res = await runDomeggookHealthCheck({
      http,
      credentials,
      outboundIp: '54.180.45.46',
    });
    expect(res.status).toBe('PERMISSION_DENIED');
  });

  it('네트워크 예외 → TEMPORARY_ERROR 또는 AUTH/ACCOUNT 계열 사용자 문구', async () => {
    const http = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const res = await runDomeggookHealthCheck({
      http,
      credentials,
      outboundIp: '54.180.45.46',
    });
    expect(['TEMPORARY_ERROR', 'UNKNOWN', 'ACCOUNT_CONFIG_ERROR']).toContain(res.status);
  });
});
