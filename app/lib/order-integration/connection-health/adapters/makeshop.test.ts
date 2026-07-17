import { describe, expect, it, vi } from 'vitest';
import { classifyMakeshopError } from './makeshop';
import { runProbeHealthCheck } from './probe-health';

describe('classifyMakeshopError', () => {
  it('OAuth Client ID/Secret 인증 실패는 env 언급이 있어도 AUTH_REQUIRED', () => {
    expect(
      classifyMakeshopError(
        new Error(
          '메이크샵 Client ID/Client Secret 인증에 실패했습니다. APP 개발 정보와 env(MAKESHOP_CLIENT_ID/SECRET)를 확인해 주세요.',
        ),
      ),
    ).toBe('AUTH_REQUIRED');
    expect(classifyMakeshopError(new Error('invalid_client'))).toBe('AUTH_REQUIRED');
  });

  it('서버 OAuth env 자체 누락 → ACCOUNT_CONFIG_ERROR', () => {
    expect(
      classifyMakeshopError(new Error('MAKESHOP_CLIENT_ID 환경 변수가 설정되지 않았습니다. Vercel env 등록이 필요합니다.')),
    ).toBe('ACCOUNT_CONFIG_ERROR');
  });

  it('주문 조회 권한 부족 → PERMISSION_DENIED', () => {
    expect(classifyMakeshopError(new Error('주문 조회 권한이 없습니다.'))).toBe('PERMISSION_DENIED');
  });

  it('APP 설치/미승인 → APPROVAL_REQUIRED', () => {
    expect(
      classifyMakeshopError(new Error('메이크샵 APP이 해당 쇼핑몰에 설치되지 않았습니다. 샵스토어에서 설치·scope 동의를 확인해 주세요.')),
    ).toBe('APPROVAL_REQUIRED');
  });

  it('허가된 IP 등록 필요 → IP_NOT_ALLOWED', () => {
    expect(
      classifyMakeshopError(new Error('메이크샵 APP 접근 허용 IP에 엑클로드 호출 IP 등록이 필요합니다.')),
    ).toBe('IP_NOT_ALLOWED');
  });

  it('호출 횟수 제한 → RATE_LIMITED', () => {
    expect(classifyMakeshopError(new Error('too_many_request: 토큰 요청 횟수 제한 초과'))).toBe('RATE_LIMITED');
  });

  it('판별 불가 → UNKNOWN', () => {
    expect(classifyMakeshopError(new Error('알 수 없는 메이크샵 응답'))).toBe('UNKNOWN');
  });
});

describe('makeshop runProbeHealthCheck (토큰+주문 읽기 성공 경로)', () => {
  it('정상 빈 주문 응답(probe 성공) → HEALTHY', async () => {
    const res = await runProbeHealthCheck({
      probe: vi.fn().mockResolvedValue({ ok: true }),
      classify: classifyMakeshopError,
    });
    expect(res.status).toBe('HEALTHY');
  });

  it('토큰만 발급되고 주문 조회에서 권한 오류 → PERMISSION_DENIED', async () => {
    const res = await runProbeHealthCheck({
      probe: vi.fn().mockRejectedValue(new Error('주문 조회 권한이 없습니다.')),
      classify: classifyMakeshopError,
    });
    expect(res.status).toBe('PERMISSION_DENIED');
  });
});
