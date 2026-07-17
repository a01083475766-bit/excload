import { describe, expect, it, vi } from 'vitest';
import { classifyCafe24Error, runCafe24HealthCheck } from './cafe24';

describe('classifyCafe24Error', () => {
  it('refresh token 무효/OAuth 인증 실패 → AUTH_REQUIRED', () => {
    expect(classifyCafe24Error(new Error('카페24 OAuth 인증에 실패했습니다. 연동을 다시 진행해 주세요.'))).toBe(
      'AUTH_REQUIRED',
    );
    expect(classifyCafe24Error(new Error('invalid refresh_token'))).toBe('AUTH_REQUIRED');
  });

  it('주문 조회 scope 부족 → PERMISSION_DENIED', () => {
    expect(
      classifyCafe24Error(new Error('mall.read_order 권한이 없습니다. 카페24 App scope 설정을 확인해 주세요.')),
    ).toBe('PERMISSION_DENIED');
  });

  it('호출 제한 → RATE_LIMITED', () => {
    expect(classifyCafe24Error(new Error('HTTP 429 rate limit'))).toBe('RATE_LIMITED');
  });
});

describe('runCafe24HealthCheck', () => {
  it('토큰 갱신 + scope 확인 성공 → HEALTHY', async () => {
    const res = await runCafe24HealthCheck({
      ensureToken: vi.fn().mockResolvedValue({ accessToken: 'token' }),
      verifyScope: vi.fn().mockResolvedValue({ ok: true, scopes: ['mall.read_order'] }),
    });
    expect(res.status).toBe('HEALTHY');
  });

  it('refresh token 무효 → AUTH_REQUIRED (scope 확인은 호출하지 않음)', async () => {
    const verifyScope = vi.fn();
    const res = await runCafe24HealthCheck({
      ensureToken: vi.fn().mockRejectedValue(new Error('카페24 OAuth 인증에 실패했습니다.')),
      verifyScope,
    });
    expect(res.status).toBe('AUTH_REQUIRED');
    expect(verifyScope).not.toHaveBeenCalled();
  });

  it('scope 부족 → PERMISSION_DENIED', async () => {
    const res = await runCafe24HealthCheck({
      ensureToken: vi.fn().mockResolvedValue({ accessToken: 'token' }),
      verifyScope: vi.fn().mockRejectedValue(new Error('mall.read_order 권한이 없습니다.')),
    });
    expect(res.status).toBe('PERMISSION_DENIED');
  });

  it('rawMessage에 accessToken을 노출하지 않는다', async () => {
    const res = await runCafe24HealthCheck({
      ensureToken: vi.fn().mockResolvedValue({ accessToken: 'super-secret-token' }),
      verifyScope: vi.fn().mockRejectedValue(new Error('mall.read_order 권한이 없습니다.')),
    });
    expect(res.rawMessage ?? '').not.toContain('super-secret-token');
  });
});
