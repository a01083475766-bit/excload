import { describe, expect, it, vi } from 'vitest';

import {
  formatCourierDownloadOrderSourceTypeLabel,
  listCourierDownloadBundleOrders,
  mapCourierDownloadWorkItemSourceType,
  shouldShowExcloadOrderNoHelper,
  toCourierDownloadBundleOrderRow,
  type CourierDownloadBundleOrdersClient,
} from '@/app/lib/order-integration/courier-download/list-courier-download-bundle-orders';
import {
  formatCourierDownloadOrdersScrollHint,
  shouldShowCourierDownloadOrdersScrollHint,
} from '@/app/lib/order-integration/courier-download/courier-download-bundle-orders-view';

function buildClient(
  findFirst: CourierDownloadBundleOrdersClient['courierDownloadBundle']['findFirst'],
): CourierDownloadBundleOrdersClient {
  // 테스트용 최소 mock — Prisma delegate 전체 구현 없이 Pick 타입만 맞춤
  return {
    courierDownloadBundle: { findFirst },
  } as CourierDownloadBundleOrdersClient;
}

describe('listCourierDownloadBundleOrders', () => {
  it('returns work item order summary for owned active bundle', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'bundle-1',
      workItems: [
        {
          id: 'w1',
          inputSource: 'API',
          sourceMallKey: 'SMARTSTORE',
          sourceMallLabel: '스마트스토어',
          mallOrderNo: '20260722-1234567',
          excloadOrderNo: 'EXC-1',
        },
        {
          id: 'w2',
          inputSource: 'EXCEL',
          sourceMallKey: null,
          sourceMallLabel: '쿠팡',
          mallOrderNo: '123456789012345678',
          excloadOrderNo: 'EXC-2',
        },
      ],
    });

    const result = await listCourierDownloadBundleOrders(buildClient(findFirst), {
      userId: 'user-a',
      bundleId: 'bundle-1',
      now: new Date('2026-07-22T12:00:00.000Z'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.orderCount).toBe(2);
    expect(result.orders).toEqual([
      {
        id: 'w1',
        mallLabel: '스마트스토어',
        mallOrderNo: '20260722-1234567',
        sourceType: 'API',
        sourceTypeLabel: 'API 주문',
        excloadOrderNo: 'EXC-1',
      },
      {
        id: 'w2',
        mallLabel: '쿠팡',
        mallOrderNo: '123456789012345678',
        sourceType: 'MANUAL',
        sourceTypeLabel: '엑셀·수동 주문',
        excloadOrderNo: 'EXC-2',
      },
    ]);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'bundle-1',
          userId: 'user-a',
          expiresAt: { gte: new Date('2026-07-22T12:00:00.000Z') },
        },
      }),
    );
    const select = findFirst.mock.calls[0]?.[0]?.select as {
      workItems: { select: Record<string, boolean> };
    };
    expect(select.workItems.select).toEqual({
      id: true,
      inputSource: true,
      sourceMallKey: true,
      sourceMallLabel: true,
      mallOrderNo: true,
      excloadOrderNo: true,
    });
    expect(select.workItems.select).not.toHaveProperty('rawRowJson');
    expect(JSON.stringify(result.orders)).not.toMatch(/recipient|phone|address|rawPayload|secret|apiKey/i);
  });

  it('returns NOT_FOUND for other user / expired / missing bundle', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const result = await listCourierDownloadBundleOrders(buildClient(findFirst), {
      userId: 'user-a',
      bundleId: 'foreign-bundle',
    });
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('returns empty orders for active bundle with no work items', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'bundle-empty', workItems: [] });
    const result = await listCourierDownloadBundleOrders(buildClient(findFirst), {
      userId: 'user-a',
      bundleId: 'bundle-empty',
    });
    expect(result).toEqual({
      ok: true,
      bundleId: 'bundle-empty',
      orderCount: 0,
      orders: [],
    });
  });
});

describe('source type and excload helper', () => {
  it('maps API vs manual labels', () => {
    expect(mapCourierDownloadWorkItemSourceType('API')).toBe('API');
    expect(mapCourierDownloadWorkItemSourceType('EXCEL')).toBe('MANUAL');
    expect(mapCourierDownloadWorkItemSourceType('TEXT')).toBe('MANUAL');
    expect(formatCourierDownloadOrderSourceTypeLabel('API')).toBe('API 주문');
    expect(formatCourierDownloadOrderSourceTypeLabel('MANUAL')).toBe('엑셀·수동 주문');
  });

  it('shows excload helper only when distinct', () => {
    expect(shouldShowExcloadOrderNoHelper('M-1', 'EXC-1')).toBe(true);
    expect(shouldShowExcloadOrderNoHelper(null, 'EXC-1')).toBe(true);
    expect(shouldShowExcloadOrderNoHelper('SAME', 'SAME')).toBe(false);
    expect(shouldShowExcloadOrderNoHelper('M-1', '')).toBe(false);
  });

  it('falls back mall label to key', () => {
    expect(
      toCourierDownloadBundleOrderRow({
        id: 'w',
        inputSource: 'API',
        sourceMallKey: 'COUPANG',
        sourceMallLabel: null,
        mallOrderNo: '1',
        excloadOrderNo: 'EXC',
      }).mallLabel,
    ).toBe('COUPANG');
  });
});

describe('courier download orders scroll preview', () => {
  it('hides scroll hint when 5 or fewer', () => {
    expect(shouldShowCourierDownloadOrdersScrollHint(5)).toBe(false);
    expect(shouldShowCourierDownloadOrdersScrollHint(1)).toBe(false);
  });

  it('shows scroll hint when more than 5', () => {
    expect(shouldShowCourierDownloadOrdersScrollHint(6)).toBe(true);
    expect(shouldShowCourierDownloadOrdersScrollHint(200)).toBe(true);
    expect(formatCourierDownloadOrdersScrollHint(200)).toBe('총 200건 · 스크롤하여 더 보기');
  });
});
