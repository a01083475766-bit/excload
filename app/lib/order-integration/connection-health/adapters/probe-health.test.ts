import { describe, expect, it, vi } from 'vitest';
import { classifyMallErrorMessage, runProbeHealthCheck } from './probe-health';

describe('classifyMallErrorMessage (롯데ON·SSG·CJ온스타일 공통)', () => {
  it('인증과 IP가 함께 언급된 복수 원인 메시지 → UNKNOWN (과도한 단정 금지)', () => {
    // 롯데ON: Key·IP 등록이 함께 언급 → 특정 불가
    expect(
      classifyMallErrorMessage(new Error('롯데ON API KEY 인증에 실패했습니다. Key·IP 등록·tr_no를 확인해 주세요.')),
    ).toBe('UNKNOWN');
    // SSG: 인증키·IP 등록이 함께 언급 → 특정 불가
    expect(
      classifyMallErrorMessage(new Error('SSG API 인증키 인증에 실패했습니다. 인증키·IP 등록 상태를 확인해 주세요.')),
    ).toBe('UNKNOWN');
    // 지시서 예시 문구
    expect(classifyMallErrorMessage(new Error('인증키·IP 등록 확인'))).toBe('UNKNOWN');
  });

  it('인증 원인만 단독으로 명확하면 → AUTH_REQUIRED', () => {
    expect(
      classifyMallErrorMessage(new Error('SSG API 인증키 인증에 실패했습니다.')),
    ).toBe('AUTH_REQUIRED');
    // 고도몰 사용자 key 오류(설정 키워드 없음) → AUTH_REQUIRED
    expect(
      classifyMallErrorMessage(new Error('고도몰 사용자 key 인증에 실패했습니다.')),
    ).toBe('AUTH_REQUIRED');
  });

  it('권한 부족 → PERMISSION_DENIED, 승인/계약 문제 → APPROVAL_REQUIRED', () => {
    expect(classifyMallErrorMessage(new Error('주문 조회 권한이 없습니다.'))).toBe('PERMISSION_DENIED');
    expect(classifyMallErrorMessage(new Error('협력사 계약 승인 대기 상태입니다.'))).toBe('APPROVAL_REQUIRED');
  });

  it('명확한 IP 미등록 → IP_NOT_ALLOWED', () => {
    expect(classifyMallErrorMessage(new Error('허용되지 않은 IP입니다.'))).toBe('IP_NOT_ALLOWED');
  });

  it('호출 제한 → RATE_LIMITED, 5xx/네트워크 → TEMPORARY_ERROR', () => {
    expect(classifyMallErrorMessage(new Error('호출 제한을 초과했습니다.'))).toBe('RATE_LIMITED');
    expect(classifyMallErrorMessage(new Error('CJ온스타일 API 호출에 실패했습니다. (HTTP 503)'))).toBe(
      'TEMPORARY_ERROR',
    );
  });

  it('날짜/파라미터 오류 → REQUEST_INVALID (연결 상태 중립)', () => {
    expect(classifyMallErrorMessage(new Error('조회 날짜 파라미터가 유효하지 않습니다.'))).toBe('REQUEST_INVALID');
  });

  it('판별 불가 → UNKNOWN', () => {
    expect(classifyMallErrorMessage(new Error('알 수 없는 응답'))).toBe('UNKNOWN');
  });

  it('샵바이 인증(systemKey/mallKey) 오류 → AUTH_REQUIRED', () => {
    expect(
      classifyMallErrorMessage(
        new Error('샵바이 API 인증에 실패했습니다. systemKey·mallKey·워크스페이스 앱 등록 상태를 확인해 주세요.'),
      ),
    ).toBe('AUTH_REQUIRED');
  });

  it('고도몰 서버 partner_key(env) 누락 → ACCOUNT_CONFIG_ERROR', () => {
    expect(
      classifyMallErrorMessage(
        new Error('서버 GODOMALL_PARTNER_KEY가 설정되지 않았습니다. Vercel env 등록 후 저장해 주세요.'),
      ),
    ).toBe('ACCOUNT_CONFIG_ERROR');
  });
});

describe('runProbeHealthCheck', () => {
  it('정상 빈 응답(probe 성공) → HEALTHY', async () => {
    const res = await runProbeHealthCheck({ probe: vi.fn().mockResolvedValue({ ok: true }) });
    expect(res.status).toBe('HEALTHY');
  });

  it('probe 실패 → 메시지 기반 분류', async () => {
    const res = await runProbeHealthCheck({
      probe: vi.fn().mockRejectedValue(new Error('SSG API 인증키 인증에 실패했습니다.')),
    });
    expect(res.status).toBe('AUTH_REQUIRED');
  });

  it('rawMessage는 200자로 제한', async () => {
    const long = 'x'.repeat(500);
    const res = await runProbeHealthCheck({ probe: vi.fn().mockRejectedValue(new Error(long)) });
    expect((res.rawMessage ?? '').length).toBeLessThanOrEqual(201);
  });
});
