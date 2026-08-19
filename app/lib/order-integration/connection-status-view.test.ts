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

  it('노출 대상 몰은 priority 순서대로 7개이다', () => {
    const rows = buildMallOverviewRows(connected);
    expect(rows.map((r) => r.mallId)).toEqual([
      'smartstore',
      'coupang',
      'eleven',
      'lotteon',
      'cafe24',
      'domeggook',
      'shopby',
    ]);
    expect(rows).toHaveLength(ORDER_INTEGRATION_MALLS.length);
    expect(rows.every((r) => !r.isPreparing)).toBe(true);
  });

  it('연결이 하나도 없으면 노출 몰은 모두 미연결이다', () => {
    const rows = buildMallOverviewRows([]);
    expect(rows.every((r) => !r.connected && r.statusLabel === '미연결')).toBe(true);
  });
});
