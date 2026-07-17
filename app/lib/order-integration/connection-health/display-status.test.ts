import { describe, expect, it } from 'vitest';
import { resolveConnectionHealthDisplay } from './display-status';

const T0 = '2026-07-18T00:00:00.000Z';
const T1 = '2026-07-18T00:10:00.000Z';

describe('resolveConnectionHealthDisplay', () => {
  it('미확인(null)은 문제 아님', () => {
    expect(resolveConnectionHealthDisplay({ healthStatus: null })).toEqual({
      status: null,
      isProblem: false,
      soft: false,
    });
  });

  it('HEALTHY이고 최근 실패 없음 → 연결 정상', () => {
    const d = resolveConnectionHealthDisplay({ healthStatus: 'HEALTHY', lastSuccessAt: T1 });
    expect(d.status).toBe('HEALTHY');
    expect(d.isProblem).toBe(false);
  });

  it('HEALTHY지만 최근 실패가 더 최신 + TEMPORARY_ERROR + 1~2회 → 경고(soft)', () => {
    const d = resolveConnectionHealthDisplay({
      healthStatus: 'HEALTHY',
      lastErrorCategory: 'TEMPORARY_ERROR',
      lastSuccessAt: T0,
      lastFailureAt: T1,
      consecutiveFailureCount: 2,
    });
    expect(d.status).toBe('TEMPORARY_ERROR');
    expect(d.isProblem).toBe(true);
    expect(d.soft).toBe(true);
  });

  it('RATE_LIMITED → 문제지만 soft(연결 해제 아님)', () => {
    const d = resolveConnectionHealthDisplay({
      healthStatus: 'RATE_LIMITED',
      lastFailureAt: T1,
    });
    expect(d.status).toBe('RATE_LIMITED');
    expect(d.isProblem).toBe(true);
    expect(d.soft).toBe(true);
  });

  it('AUTH_REQUIRED → 조치 필요(soft 아님)', () => {
    const d = resolveConnectionHealthDisplay({
      healthStatus: 'AUTH_REQUIRED',
      lastFailureAt: T1,
    });
    expect(d.status).toBe('AUTH_REQUIRED');
    expect(d.isProblem).toBe(true);
    expect(d.soft).toBe(false);
  });

  it('성공이 최근 실패보다 나중이면 정상 복귀', () => {
    const d = resolveConnectionHealthDisplay({
      healthStatus: 'AUTH_REQUIRED',
      lastFailureAt: T0,
      lastSuccessAt: T1,
    });
    expect(d.status).toBe('HEALTHY');
    expect(d.isProblem).toBe(false);
  });

  it('REQUEST_INVALID는 배지에 표시하지 않음(정상 처리)', () => {
    const d = resolveConnectionHealthDisplay({
      healthStatus: 'REQUEST_INVALID',
      lastFailureAt: T1,
    });
    expect(d.status).toBe('HEALTHY');
    expect(d.isProblem).toBe(false);
  });
});
