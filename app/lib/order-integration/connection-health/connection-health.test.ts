import { afterEach, describe, expect, it } from 'vitest';
import {
  categorizeApiError,
  isImmediateActionCategory,
  isTransientCategory,
  worsensConnection,
} from './error-categories';
import { computeHealthFields } from './persist-health-result';
import { getHealthMessage, getHealthMessageForStatus } from './messages';
import {
  clearHealthAdaptersForTest,
  getHealthAdapter,
  hasHealthAdapter,
  isHealthCheckFresh,
  registerHealthAdapter,
} from './provider-health-registry';
import type { ConnectionHealthResult } from './types';

const NOW = new Date('2026-07-18T00:00:00.000Z');

describe('categorizeApiError', () => {
  it('네이버 게이트웨이 코드로 인증/IP/호출제한을 분류한다', () => {
    expect(categorizeApiError({ code: 'GW.AUTHN' })).toBe('AUTH_REQUIRED');
    expect(categorizeApiError({ code: 'GW.IP_NOT_ALLOWED' })).toBe('IP_NOT_ALLOWED');
    expect(categorizeApiError({ code: 'GW.RATE_LIMIT' })).toBe('RATE_LIMITED');
    expect(categorizeApiError({ code: 'GW.QUOTA_LIMIT' })).toBe('RATE_LIMITED');
  });

  it('HTTP status로 일시적/인증/요청오류를 분류한다', () => {
    expect(categorizeApiError({ httpStatus: 429 })).toBe('RATE_LIMITED');
    expect(categorizeApiError({ httpStatus: 503 })).toBe('TEMPORARY_ERROR');
    expect(categorizeApiError({ httpStatus: 408 })).toBe('TEMPORARY_ERROR');
    expect(categorizeApiError({ httpStatus: 401 })).toBe('AUTH_REQUIRED');
    expect(categorizeApiError({ httpStatus: 400 })).toBe('REQUEST_INVALID');
  });

  it('메시지 키워드로 설정/승인/요청오류를 분류한다', () => {
    expect(categorizeApiError({ message: '시크릿이 만료되었습니다' })).toBe('ACCOUNT_CONFIG_ERROR');
    expect(categorizeApiError({ message: 'API 사용 승인 대기 중' })).toBe('APPROVAL_REQUIRED');
    expect(categorizeApiError({ message: '조회 기간이 유효하지 않습니다' })).toBe('REQUEST_INVALID');
    expect(categorizeApiError({ message: '허용되지 않은 IP 입니다' })).toBe('IP_NOT_ALLOWED');
  });

  it('분류할 수 없으면 UNKNOWN', () => {
    expect(categorizeApiError({})).toBe('UNKNOWN');
    expect(categorizeApiError({ message: '뭔가 이상함' })).toBe('UNKNOWN');
  });
});

describe('상태 판정 헬퍼', () => {
  it('일시적/즉시조치를 구분한다', () => {
    expect(isTransientCategory('RATE_LIMITED')).toBe(true);
    expect(isTransientCategory('TEMPORARY_ERROR')).toBe(true);
    expect(isTransientCategory('AUTH_REQUIRED')).toBe(false);

    expect(isImmediateActionCategory('AUTH_REQUIRED')).toBe(true);
    expect(isImmediateActionCategory('IP_NOT_ALLOWED')).toBe(true);
    expect(isImmediateActionCategory('ACCOUNT_CONFIG_ERROR')).toBe(true);
    expect(isImmediateActionCategory('RATE_LIMITED')).toBe(false);
  });

  it('REQUEST_INVALID와 HEALTHY는 연결 상태를 악화시키지 않는다', () => {
    expect(worsensConnection('HEALTHY')).toBe(false);
    expect(worsensConnection('REQUEST_INVALID')).toBe(false);
    expect(worsensConnection('AUTH_REQUIRED')).toBe(true);
    expect(worsensConnection('TEMPORARY_ERROR')).toBe(true);
  });
});

describe('computeHealthFields', () => {
  const result = (status: ConnectionHealthResult['status'], rawCode?: string): ConnectionHealthResult => ({
    status,
    rawCode,
    checkedAt: NOW,
  });

  it('HEALTHY면 성공 필드를 채우고 연속 실패를 초기화한다', () => {
    const patch = computeHealthFields({ consecutiveFailureCount: 3 }, result('HEALTHY'));
    expect(patch.healthStatus).toBe('HEALTHY');
    expect(patch.lastSuccessAt).toEqual(NOW);
    expect(patch.lastErrorCategory).toBeNull();
    expect(patch.lastErrorCode).toBeNull();
    expect(patch.consecutiveFailureCount).toBe(0);
    expect(patch.lastFailureAt).toBeUndefined();
  });

  it('실패면 카테고리/코드 저장 및 연속 실패를 증가시킨다', () => {
    const patch = computeHealthFields({ consecutiveFailureCount: 2 }, result('AUTH_REQUIRED', 'GW.AUTHN'));
    expect(patch.healthStatus).toBe('AUTH_REQUIRED');
    expect(patch.lastFailureAt).toEqual(NOW);
    expect(patch.lastErrorCategory).toBe('AUTH_REQUIRED');
    expect(patch.lastErrorCode).toBe('GW.AUTHN');
    expect(patch.consecutiveFailureCount).toBe(3);
    expect(patch.lastSuccessAt).toBeUndefined();
  });

  it('REQUEST_INVALID는 lastCheckedAt만 갱신하고 연결 상태를 건드리지 않는다', () => {
    const patch = computeHealthFields({ consecutiveFailureCount: 1, healthStatus: 'HEALTHY' }, result('REQUEST_INVALID'));
    expect(patch.lastCheckedAt).toEqual(NOW);
    expect(patch.healthStatus).toBeUndefined();
    expect(patch.consecutiveFailureCount).toBeUndefined();
    expect(patch.lastFailureAt).toBeUndefined();
    expect(patch.lastSuccessAt).toBeUndefined();
  });

  it('이전 실패 카운트가 없으면 1부터 시작한다', () => {
    const patch = computeHealthFields({}, result('TEMPORARY_ERROR'));
    expect(patch.consecutiveFailureCount).toBe(1);
  });

  it('TEMPORARY_ERROR 1~2회는 기존 healthStatus를 유지하고 카테고리/카운터만 갱신한다', () => {
    const first = computeHealthFields({ consecutiveFailureCount: 0, healthStatus: 'HEALTHY' }, result('TEMPORARY_ERROR'));
    expect(first.healthStatus).toBeUndefined();
    expect(first.lastErrorCategory).toBe('TEMPORARY_ERROR');
    expect(first.lastFailureAt).toEqual(NOW);
    expect(first.consecutiveFailureCount).toBe(1);

    const second = computeHealthFields({ consecutiveFailureCount: 1, healthStatus: 'HEALTHY' }, result('TEMPORARY_ERROR'));
    expect(second.healthStatus).toBeUndefined();
    expect(second.consecutiveFailureCount).toBe(2);
  });

  it('TEMPORARY_ERROR 3회부터 healthStatus를 강등한다', () => {
    const patch = computeHealthFields({ consecutiveFailureCount: 2, healthStatus: 'HEALTHY' }, result('TEMPORARY_ERROR'));
    expect(patch.healthStatus).toBe('TEMPORARY_ERROR');
    expect(patch.consecutiveFailureCount).toBe(3);
  });

  it('UNKNOWN도 연속 실패 기준(3회)을 적용한다', () => {
    expect(computeHealthFields({ consecutiveFailureCount: 1 }, result('UNKNOWN')).healthStatus).toBeUndefined();
    expect(computeHealthFields({ consecutiveFailureCount: 2 }, result('UNKNOWN')).healthStatus).toBe('UNKNOWN');
  });

  it('즉시 조치 오류는 첫 실패부터 상태를 강등한다', () => {
    for (const status of ['AUTH_REQUIRED', 'IP_NOT_ALLOWED', 'PERMISSION_DENIED', 'APPROVAL_REQUIRED', 'ACCOUNT_CONFIG_ERROR'] as const) {
      const patch = computeHealthFields({ consecutiveFailureCount: 0 }, result(status));
      expect(patch.healthStatus).toBe(status);
    }
  });

  it('RATE_LIMITED는 첫 실패부터 기록하되 severity는 warn(일시적)로 구분된다', () => {
    const patch = computeHealthFields({ consecutiveFailureCount: 0 }, result('RATE_LIMITED'));
    expect(patch.healthStatus).toBe('RATE_LIMITED');
    expect(getHealthMessageForStatus('RATE_LIMITED').tone).toBe('warn');
    expect(getHealthMessageForStatus('RATE_LIMITED').description).not.toContain('연결 끊김');
  });
});

describe('messages', () => {
  it('모든 상태에 라벨/설명/톤이 있다', () => {
    for (const status of [
      'HEALTHY',
      'AUTH_REQUIRED',
      'IP_NOT_ALLOWED',
      'PERMISSION_DENIED',
      'APPROVAL_REQUIRED',
      'RATE_LIMITED',
      'TEMPORARY_ERROR',
      'ACCOUNT_CONFIG_ERROR',
      'REQUEST_INVALID',
      'UNKNOWN',
    ] as const) {
      const m = getHealthMessageForStatus(status);
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(0);
    }
  });

  it('CHECKING은 클라이언트 전용 메시지로만 제공된다', () => {
    expect(getHealthMessage('CHECKING').label).toBe('확인 중');
  });
});

describe('provider-health-registry', () => {
  afterEach(() => clearHealthAdaptersForTest());

  it('어댑터 등록/조회가 동작한다', () => {
    expect(hasHealthAdapter('SMARTSTORE')).toBe(false);
    registerHealthAdapter({
      provider: 'SMARTSTORE',
      readiness: 'VERIFIED',
      checkConnection: async () => ({ status: 'HEALTHY', checkedAt: NOW }),
    });
    expect(hasHealthAdapter('SMARTSTORE')).toBe(true);
    expect(getHealthAdapter('SMARTSTORE')).toBeDefined();
    expect(getHealthAdapter('COUPANG')).toBeUndefined();
  });

  it('freshness: 10분 이내는 신선, 이후는 재검사 필요', () => {
    const checkedAt = new Date('2026-07-18T00:00:00.000Z');
    expect(isHealthCheckFresh(checkedAt, new Date('2026-07-18T00:05:00.000Z'))).toBe(true);
    expect(isHealthCheckFresh(checkedAt, new Date('2026-07-18T00:11:00.000Z'))).toBe(false);
    expect(isHealthCheckFresh(null, NOW)).toBe(false);
  });
});
