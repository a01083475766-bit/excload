import { describe, expect, it } from 'vitest';
import { toPublicConnectionHealthView } from './public-health-view';

const BASE = {
  mallId: 'smartstore' as const,
  inactive: false,
  readiness: 'VERIFIED' as const,
  lastCheckedAt: new Date('2026-07-18T03:00:00.000Z'),
};

describe('toPublicConnectionHealthView', () => {
  it('내부 상태·분류·외부 오류 코드를 사용자 DTO에 포함하지 않는다', () => {
    const view = toPublicConnectionHealthView({
      ...BASE,
      healthStatus: 'AUTH_REQUIRED',
      lastErrorCategory: 'AUTH_REQUIRED',
      lastErrorCode: 'GW.AUTHN invalid_client INTEGRATION_PROXY_BASE_URL debug.transport',
    });

    expect(view.displayState).toBe('ACTION_REQUIRED');
    expect(view.label).toBe('연결 정보 확인 필요');
    expect(view.help?.title).toContain('연결 정보 확인');

    const serialized = JSON.stringify(view);
    for (const internalValue of [
      'AUTH_REQUIRED',
      'VERIFIED',
      'PROVISIONAL',
      'DISABLED',
      'GW.AUTHN',
      'invalid_client',
      'INTEGRATION_PROXY_BASE_URL',
      'debug.transport',
    ]) {
      expect(serialized).not.toContain(internalValue);
    }
    expect(view).not.toHaveProperty('healthStatus');
    expect(view).not.toHaveProperty('lastErrorCategory');
    expect(view).not.toHaveProperty('readiness');
    expect(view).not.toHaveProperty('lastErrorCode');
  });

  it('일시 오류와 정상 복귀 규칙을 사용자 상태로 변환한다', () => {
    expect(
      toPublicConnectionHealthView({
        ...BASE,
        healthStatus: 'HEALTHY',
        lastErrorCategory: 'TEMPORARY_ERROR',
        lastSuccessAt: '2026-07-18T01:00:00.000Z',
        lastFailureAt: '2026-07-18T02:00:00.000Z',
        consecutiveFailureCount: 1,
      }),
    ).toMatchObject({ displayState: 'RETRY_LATER', tone: 'warning', checkable: true });

    expect(
      toPublicConnectionHealthView({
        ...BASE,
        healthStatus: 'AUTH_REQUIRED',
        lastSuccessAt: '2026-07-18T03:00:00.000Z',
        lastFailureAt: '2026-07-18T02:00:00.000Z',
      }),
    ).toMatchObject({ displayState: 'CONNECTED', tone: 'success', help: null });
  });

  it('공급자 준비 enum 대신 사용자용 준비 상태만 반환한다', () => {
    const view = toPublicConnectionHealthView({
      ...BASE,
      readiness: 'PROVISIONAL',
      healthStatus: 'HEALTHY',
    });

    expect(view).toEqual({
      displayState: 'CHECK_UNAVAILABLE',
      label: '연결 확인 준비 중',
      tone: 'neutral',
      checkedAt: null,
      checkable: false,
      help: null,
    });
    expect(JSON.stringify(view)).not.toContain('PROVISIONAL');
  });
});
