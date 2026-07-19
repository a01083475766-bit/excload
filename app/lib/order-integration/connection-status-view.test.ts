import { describe, expect, it } from 'vitest';
import { ORDER_INTEGRATION_MALLS } from '@/app/lib/order-integration/malls';
import {
  buildMallOverviewRows,
  isMallConnected,
  toConnectedMallMap,
  type ConnectedMallSummary,
} from '@/app/lib/order-integration/connection-status-view';

const connected: ConnectedMallSummary[] = [
  {
    mallId: 'smartstore',
    name: '스마트스토어',
    accountName: '원클Excload',
    status: 'ACTIVE',
    lastCheckedAt: '2026-07-17T00:00:00.000Z',
  },
];

describe('isMallConnected', () => {
  it('저장된 연결이 있으면 true, 없으면 false', () => {
    expect(isMallConnected('smartstore', connected)).toBe(true);
    expect(isMallConnected('coupang', connected)).toBe(false);
  });
});

describe('toConnectedMallMap', () => {
  it('같은 mallId가 중복되면 첫 항목만 유지한다', () => {
    const map = toConnectedMallMap([
      { mallId: 'smartstore', name: '스마트스토어', accountName: 'A', status: 'ACTIVE', lastCheckedAt: null },
      { mallId: 'smartstore', name: '스마트스토어', accountName: 'B', status: 'INACTIVE', lastCheckedAt: null },
    ]);
    expect(map.size).toBe(1);
    expect(map.get('smartstore')?.accountName).toBe('A');
  });
});

describe('buildMallOverviewRows', () => {
  it('설정된 몰은 설정됨 + 설정 관리 + 계정명/확인시각을 노출한다', () => {
    const rows = buildMallOverviewRows(connected);
    const ss = rows.find((r) => r.mallId === 'smartstore');

    expect(ss).toBeDefined();
    expect(ss?.connected).toBe(true);
    expect(ss?.statusLabel).toBe('설정됨');
    expect(ss?.action).toBe('manage');
    expect(ss?.actionLabel).toBe('설정 관리');
    expect(ss?.accountName).toBe('원클Excload');
    expect(ss?.lastCheckedAt).toBe('2026-07-17T00:00:00.000Z');
    expect(ss?.isPreparing).toBe(false);
  });

  it('연결되지 않은 available 몰은 미연결 + 연결하기로 표시한다', () => {
    const rows = buildMallOverviewRows(connected);
    const coupang = rows.find((r) => r.mallId === 'coupang');

    expect(coupang?.connected).toBe(false);
    expect(coupang?.statusLabel).toBe('미연결');
    expect(coupang?.action).toBe('connect');
    expect(coupang?.actionLabel).toBe('연결하기');
    expect(coupang?.accountName).toBeNull();
  });

  it('준비중 몰은 기존 상태를 유지하고 작업을 제공하지 않는다', () => {
    const rows = buildMallOverviewRows(connected);
    const gmarket = rows.find((r) => r.mallId === 'gmarket');

    expect(gmarket?.isPreparing).toBe(true);
    expect(gmarket?.connected).toBe(false);
    expect(gmarket?.action).toBe('none');
    expect(gmarket?.statusLabel).toBe('제휴 준비 중');
  });

  it('모든 몰을 우선순위 순서로 포함한다', () => {
    const rows = buildMallOverviewRows(connected);
    expect(rows).toHaveLength(ORDER_INTEGRATION_MALLS.length);

    const idxCoupang = rows.findIndex((r) => r.mallId === 'coupang');
    const idxSmart = rows.findIndex((r) => r.mallId === 'smartstore');
    const idxGmarket = rows.findIndex((r) => r.mallId === 'gmarket');

    expect(idxSmart).toBeGreaterThanOrEqual(0);
    expect(idxSmart).toBeLessThan(idxCoupang);
    expect(idxCoupang).toBeLessThan(idxGmarket);
  });

  it('연결이 하나도 없으면 available 몰은 모두 미연결이다', () => {
    const rows = buildMallOverviewRows([]);
    const available = rows.filter((r) => !r.isPreparing);
    expect(available.every((r) => !r.connected && r.statusLabel === '미연결')).toBe(true);
  });
});
