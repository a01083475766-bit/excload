import { describe, expect, it, vi } from 'vitest';
import { CoupangApiError } from '@/app/lib/coupang/errors';
import { classifyCoupangError, runCoupangHealthCheck } from './coupang';

describe('classifyCoupangError', () => {
  it('자격 오류/키 만료 → AUTH_REQUIRED', () => {
    expect(classifyCoupangError(new CoupangApiError('INVALID_CREDENTIALS', 'x'))).toBe('AUTH_REQUIRED');
    expect(classifyCoupangError(new CoupangApiError('API_KEY_EXPIRED', 'x'))).toBe('AUTH_REQUIRED');
  });

  it('IP 미등록 → IP_NOT_ALLOWED, 권한 → PERMISSION_DENIED, 업체코드 → ACCOUNT_CONFIG_ERROR', () => {
    expect(classifyCoupangError(new CoupangApiError('IP_NOT_REGISTERED', 'x'))).toBe('IP_NOT_ALLOWED');
    expect(classifyCoupangError(new CoupangApiError('PERMISSION_DENIED', 'x'))).toBe('PERMISSION_DENIED');
    expect(classifyCoupangError(new CoupangApiError('VENDOR_MISMATCH', 'x'))).toBe('ACCOUNT_CONFIG_ERROR');
  });

  it('서버 지연: 429 → RATE_LIMITED, 5xx → TEMPORARY_ERROR', () => {
    expect(classifyCoupangError(new CoupangApiError('SERVER_DELAY', 'x', { httpStatus: 429 }))).toBe('RATE_LIMITED');
    expect(classifyCoupangError(new CoupangApiError('SERVER_DELAY', 'x', { httpStatus: 503 }))).toBe('TEMPORARY_ERROR');
  });

  it('알 수 없는 일반 오류(네트워크) → TEMPORARY_ERROR', () => {
    expect(classifyCoupangError(new Error('socket hang up'))).toBe('TEMPORARY_ERROR');
  });
});

describe('runCoupangHealthCheck', () => {
  it('빈 주문 응답(probe 성공) → HEALTHY', async () => {
    const probe = vi.fn().mockResolvedValue({ ok: true });
    const res = await runCoupangHealthCheck({ probe });
    expect(res.status).toBe('HEALTHY');
    expect(probe).toHaveBeenCalledOnce();
  });

  it('만료된 키는 API 호출 전에 AUTH_REQUIRED로 판정', async () => {
    const probe = vi.fn();
    const res = await runCoupangHealthCheck({
      probe,
      expiresAt: new Date('2020-01-01T00:00:00Z'),
      now: new Date('2026-07-18T00:00:00Z'),
    });
    expect(res.status).toBe('AUTH_REQUIRED');
    expect(res.rawCode).toBe('API_KEY_EXPIRED');
    expect(probe).not.toHaveBeenCalled();
  });

  it('probe가 인증 오류를 던지면 AUTH_REQUIRED', async () => {
    const probe = vi.fn().mockRejectedValue(new CoupangApiError('INVALID_CREDENTIALS', 'API Key 오류'));
    const res = await runCoupangHealthCheck({ probe });
    expect(res.status).toBe('AUTH_REQUIRED');
  });
});
