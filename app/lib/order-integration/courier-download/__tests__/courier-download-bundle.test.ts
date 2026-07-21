import { describe, expect, it } from 'vitest';

import {
  buildCourierDownloadMallOrderMatchKey,
  countBundleSourceStats,
  formatCourierDownloadBundleLabel,
  resolveUniqueWorkItemByMallOrderKey,
} from '@/app/lib/order-integration/courier-download/persist-courier-download-bundle';
import { buildManualRegistrationRows } from '@/app/lib/order-integration/courier-download/manual-registration-view';
import { parseCourierDownloadBundleBody } from '@/app/lib/order-integration/courier-download/parse-courier-download-bundle-body';
import { buildCourierDownloadWorkItemDraftsFromPreviewRows } from '@/app/lib/order-integration/courier-download/build-work-item-drafts-from-preview';

describe('courier download bundle helpers', () => {
  it('counts api vs manual', () => {
    expect(
      countBundleSourceStats([
        { inputSource: 'API' },
        { inputSource: 'EXCEL' },
        { inputSource: 'TEXT' },
      ]),
    ).toEqual({ rowCount: 3, apiCount: 1, manualCount: 2 });
  });

  it('builds match key only when complete', () => {
    expect(
      buildCourierDownloadMallOrderMatchKey({
        downloadBundleId: 'b1',
        sourceMallKey: 'EXCEL-MALL',
        mallOrderNo: 'O-1',
      }),
    ).toBe('b1::EXCEL-MALL::O-1');
    expect(
      buildCourierDownloadMallOrderMatchKey({
        downloadBundleId: 'b1',
        sourceMallKey: null,
        mallOrderNo: 'O-1',
      }),
    ).toBeNull();
  });

  it('auto-resolves only unique mall-order candidates', () => {
    const items = [
      {
        id: 'w1',
        downloadBundleId: 'b1',
        sourceMallKey: 'M',
        mallOrderNo: '1',
      },
      {
        id: 'w2',
        downloadBundleId: 'b1',
        sourceMallKey: 'M',
        mallOrderNo: '1',
      },
    ];
    expect(
      resolveUniqueWorkItemByMallOrderKey(items, {
        downloadBundleId: 'b1',
        sourceMallKey: 'M',
        mallOrderNo: '1',
      }).ok,
    ).toBe(false);
    expect(
      resolveUniqueWorkItemByMallOrderKey([items[0]!], {
        downloadBundleId: 'b1',
        sourceMallKey: 'M',
        mallOrderNo: '1',
      }),
    ).toEqual({ ok: true, workItemId: 'w1' });
  });

  it('formats bundle label', () => {
    const label = formatCourierDownloadBundleLabel({
      createdAt: new Date('2026-07-21T05:30:00.000Z'),
      rowCount: 25,
      apiCount: 18,
      manualCount: 7,
    });
    expect(label).toMatch(/택배양식 다운로드/);
    expect(label).toMatch(/총 25건/);
    expect(label).toMatch(/API 18/);
    expect(label).toMatch(/수동 7/);
  });
});

describe('parseCourierDownloadBundleBody', () => {
  it('accepts valid items', () => {
    const parsed = parseCourierDownloadBundleBody({
      courierTemplateLabel: '양식',
      items: [{ inputSource: 'excel', mallOrderNo: 'A-1', sourceMallLabel: '자사몰' }],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.body.items[0]?.inputSource).toBe('EXCEL');
  });

  it('rejects empty items', () => {
    const parsed = parseCourierDownloadBundleBody({ items: [] });
    expect(parsed.ok).toBe(false);
  });
});

describe('buildManualRegistrationRows', () => {
  it('keeps excel items needing tracking link visible', () => {
    const rows = buildManualRegistrationRows({
      workItems: [
        {
          id: 'w1',
          downloadBundleId: 'b1',
          inputSource: 'EXCEL',
          sourceMallKey: '자사몰',
          sourceMallLabel: '자사몰',
          mallOrderNo: 'M-1',
          excloadOrderNo: 'EXC-1',
        },
      ],
      shipmentLinks: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('NEEDS_TRACKING_LINK');
  });

  it('marks ready when unique mall-order has tracking', () => {
    const rows = buildManualRegistrationRows({
      workItems: [
        {
          id: 'w1',
          downloadBundleId: 'b1',
          inputSource: 'TEXT',
          sourceMallKey: '자사몰',
          sourceMallLabel: '자사몰',
          mallOrderNo: 'M-1',
          excloadOrderNo: 'EXC-1',
        },
      ],
      shipmentLinks: [
        {
          mallOrderNo: 'M-1',
          excloadOrderNo: null,
          sourceMallKey: '자사몰',
          trackingNumber: 'TN-1',
          carrierName: 'CJ',
        },
      ],
    });
    expect(rows[0]?.status).toBe('READY');
    expect(rows[0]?.trackingNumber).toBe('TN-1');
  });

  it('needs mall info when source incomplete', () => {
    const rows = buildManualRegistrationRows({
      workItems: [
        {
          id: 'w1',
          downloadBundleId: 'b1',
          inputSource: 'EXCEL',
          sourceMallKey: null,
          sourceMallLabel: null,
          mallOrderNo: null,
          excloadOrderNo: 'EXC-1',
        },
      ],
      shipmentLinks: [],
    });
    expect(rows[0]?.status).toBe('NEEDS_MALL_ORDER_INFO');
  });
});

describe('buildCourierDownloadWorkItemDraftsFromPreviewRows', () => {
  it('tags api and excel rows', () => {
    const drafts = buildCourierDownloadWorkItemDraftsFromPreviewRows([
      {
        rowId: '1',
        data: { 주문번호: 'X' } as never,
        courierDownloadInputSource: 'EXCEL',
      },
      {
        rowId: '2',
        data: {} as never,
        orderSyncSource: {
          mallId: 'coupang',
          accountId: 'acc-1',
          standardRow: { 주문번호: 'CP-1' },
        },
      },
    ]);
    expect(drafts[0]?.inputSource).toBe('EXCEL');
    expect(drafts[1]?.inputSource).toBe('API');
    expect(drafts[1]?.sourceMallKey).toBe('coupang::acc-1');
    expect(drafts[1]?.mallOrderNo).toBe('CP-1');
  });

  it('skips example preview rows with empty accountId', () => {
    const drafts = buildCourierDownloadWorkItemDraftsFromPreviewRows([
      {
        rowId: '1',
        data: {} as never,
        orderSyncSource: {
          mallId: 'smartstore',
          accountId: '',
          standardRow: { 주문번호: 'DEMO-1' },
          isExamplePreview: true,
        },
      },
    ]);
    expect(drafts).toHaveLength(0);
  });

  it('stores mallOrderNo from sourceMallOrderNo when preview uses courier headers only', () => {
    const drafts = buildCourierDownloadWorkItemDraftsFromPreviewRows([
      {
        rowId: '1',
        data: {
          받는분성명: '가상수령인갑',
          받는분전화번호: '010-7001-0001',
          판매처: '가상몰A',
        } as never,
        courierDownloadInputSource: 'EXCEL',
        sourceMallOrderNo: 'VIRT-ORD-001',
      },
      {
        rowId: '2',
        data: {
          받는분성명: '가상수령인을',
          받는분전화번호: '010-7002-0002',
          판매처: '가상몰A',
        } as never,
        courierDownloadInputSource: 'EXCEL',
        sourceMallOrderNo: 'VIRT-ORD-002',
      },
    ]);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]?.inputSource).toBe('EXCEL');
    expect(drafts[0]?.mallOrderNo).toBe('VIRT-ORD-001');
    expect(drafts[1]?.mallOrderNo).toBe('VIRT-ORD-002');
    expect(drafts[0]?.matchMaterial?.receiverPhone).toBe('010-7001-0001');
  });

  it('does not invent mallOrderNo when missing', () => {
    const drafts = buildCourierDownloadWorkItemDraftsFromPreviewRows([
      {
        rowId: '1',
        data: { 받는분성명: '이름만' } as never,
        courierDownloadInputSource: 'EXCEL',
      },
    ]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.mallOrderNo).toBeNull();
  });
});
