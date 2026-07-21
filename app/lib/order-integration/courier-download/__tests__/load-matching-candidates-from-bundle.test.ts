import { OrderIntegrationProvider } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  buildMatchFingerprintHmac,
  fingerprintMatchesPhone,
  parseMatchFingerprintHmac,
} from '@/app/lib/order-integration/courier-download/match-fingerprint';
import {
  loadMatchingCandidatesFromBundle,
  type LoadMatchingCandidatesFromBundleClient,
  workItemHasMatchablePayload,
  workItemToOrderSyncSnapshot,
} from '@/app/lib/order-integration/courier-download/load-matching-candidates-from-bundle';
import { buildCourierDownloadWorkItemDraftsFromPreviewRows } from '@/app/lib/order-integration/courier-download/build-work-item-drafts-from-preview';
import { getEmptyOrderSnapshotMessage } from '@/app/lib/order-integration/shipments/shipment-match-ui';
import { scoreShipmentOrderPair } from '@/app/lib/order-integration/shipments/match-shipment-row';
import type { NormalizedShipmentRow, OrderSyncOrderSnapshot } from '@/app/lib/order-integration/shipments/types';
import type { PersistedOrderSyncOrderLike } from '@/app/lib/order-integration/snapshots/types';

const SECRET = 'test-match-fingerprint-secret';

function persistedOrder(
  overrides: Partial<PersistedOrderSyncOrderLike> = {},
): PersistedOrderSyncOrderLike {
  return {
    id: 'ord-1',
    batchId: 'batch-1',
    userId: 'user-a',
    provider: OrderIntegrationProvider.SMARTSTORE,
    integrationAccountId: 'acc-1',
    excloadOrderNo: 'EXC-1',
    mallOrderNo: 'M-1',
    mallOrderId: null,
    mallLineItemIds: null,
    receiverName: '홍길동',
    receiverPhone: '01012345678',
    receiverAddress: '서울',
    productSummary: '상품',
    quantity: 1,
    deliveryMemo: null,
    orderedAt: null,
    orderStatus: '결제완료',
    rawPayloadJson: null,
    normalizedPayloadJson: null,
    trackingNumber: null,
    carrierCode: null,
    shippedAt: null,
    transmissionStatus: 'NONE',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}
function shipment(overrides: Partial<NormalizedShipmentRow> = {}): NormalizedShipmentRow {
  return {
    originalRowIndex: 0,
    trackingNumber: '123456789012',
    trackingNumberNormalized: '123456789012',
    carrierName: 'CJ',
    standardCarrierCode: 'CJ',
    excloadOrderNo: '',
    mallOrderNo: '',
    receiverName: '김예시',
    receiverPhone: '010-1000-0001',
    receiverPhoneNormalized: '01010000001',
    receiverAddress: '서울특별시 강남구 테헤란로 1',
    receiverAddressNormalized: '서울특별시강남구테헤란로1',
    productText: '',
    shippedAt: '',
    parseWarnings: [],
    ...overrides,
  };
}

describe('match fingerprint', () => {
  it('builds and matches phone fingerprint without storing plaintext', () => {
    const hmac = buildMatchFingerprintHmac(
      { receiverPhone: '010-1000-0001', receiverName: '김예시' },
      SECRET,
    );
    expect(hmac).toBeTruthy();
    expect(hmac).not.toContain('010');
    expect(hmac).not.toContain('김예시');
    const parsed = parseMatchFingerprintHmac(hmac);
    expect(fingerprintMatchesPhone(parsed, '01010000001', SECRET)).toBe(true);
    expect(fingerprintMatchesPhone(parsed, '01099999999', SECRET)).toBe(false);
  });
});

describe('workItem candidate payload', () => {
  it('accepts mallOrderNo or fingerprint as matchable', () => {
    expect(workItemHasMatchablePayload({ mallOrderNo: 'O-1' })).toBe(true);
    expect(workItemHasMatchablePayload({ matchFingerprintHmac: 'v1|p:abc' })).toBe(true);
    expect(workItemHasMatchablePayload({ excloadOrderNo: 'EXC-1' })).toBe(true);
    expect(workItemHasMatchablePayload({})).toBe(false);
  });
});

describe('loadMatchingCandidatesFromBundle', () => {
  it('loads linked OrderSyncOrder candidates from bundle work items only', async () => {
    const client: LoadMatchingCandidatesFromBundleClient = {
      courierDownloadBundle: {
        findFirst: async () => ({
          id: 'bundle-1',
          userId: 'user-a',
          expiresAt: new Date('2099-01-01'),
          workItems: [
            {
              id: 'wi-1',
              userId: 'user-a',
              excloadOrderNo: 'EXC-1',
              inputSource: 'API',
              sourceMallKey: 'smartstore::acc-1',
              sourceMallLabel: '스마트스토어',
              mallOrderNo: 'M-1',
              orderSyncOrderId: 'ord-1',
              matchFingerprintHmac: null,
              expiresAt: new Date('2099-01-01'),
            },
          ],
        }),
      },
      orderSyncOrder: {
        findMany: async () => [persistedOrder()],
      },
    };

    const result = await loadMatchingCandidatesFromBundle(client, {
      userId: 'user-a',
      downloadBundleId: 'bundle-1',
      now: new Date('2026-07-21'),
    });
    expect(result.emptyReason).toBeNull();
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0]?.id).toBe('ord-1');
    expect(result.snapshots[0]?.workItemCandidate).toBe(false);
  });

  it('loads WorkItem-only candidates when persist flag produced no OrderSyncOrder', async () => {
    const hmac = buildMatchFingerprintHmac({ receiverPhone: '01010000001' }, SECRET);
    const client = {
      courierDownloadBundle: {
        findFirst: async () => ({
          id: 'bundle-2',
          userId: 'user-a',
          expiresAt: new Date('2099-01-01'),
          workItems: [
            {
              id: 'wi-2',
              userId: 'user-a',
              excloadOrderNo: 'EXC-2',
              inputSource: 'EXCEL',
              sourceMallKey: '자사몰',
              sourceMallLabel: '자사몰',
              mallOrderNo: 'MANUAL-1',
              orderSyncOrderId: null,
              matchFingerprintHmac: hmac,
              expiresAt: new Date('2099-01-01'),
            },
          ],
        }),
      },
      orderSyncOrder: {
        findMany: async () => [],
      },
    };

    const result = await loadMatchingCandidatesFromBundle(client, {
      userId: 'user-a',
      downloadBundleId: 'bundle-2',
    });
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0]?.workItemCandidate).toBe(true);
    expect(result.snapshots[0]?.mallOrderNo).toBe('MANUAL-1');

    const prev = process.env.EXCLOAD_MATCH_FINGERPRINT_SECRET;
    process.env.EXCLOAD_MATCH_FINGERPRINT_SECRET = SECRET;
    try {
      const score = scoreShipmentOrderPair(shipment({ mallOrderNo: 'MANUAL-1' }), result.snapshots[0]!);
      expect(score.reasons).toContain('mallOrderNo');
      expect(score.reasons).toContain('phone');
      expect(score.score).toBeGreaterThanOrEqual(70);
    } finally {
      if (prev === undefined) delete process.env.EXCLOAD_MATCH_FINGERPRINT_SECRET;
      else process.env.EXCLOAD_MATCH_FINGERPRINT_SECRET = prev;
    }
  });

  it('does not mix unrelated user bundles', async () => {
    const client = {
      courierDownloadBundle: {
        findFirst: async () => ({
          id: 'bundle-x',
          userId: 'other-user',
          expiresAt: new Date('2099-01-01'),
          workItems: [],
        }),
      },
      orderSyncOrder: { findMany: async () => [] },
    };
    const result = await loadMatchingCandidatesFromBundle(client, {
      userId: 'user-a',
      downloadBundleId: 'bundle-x',
    });
    expect(result.emptyReason).toBe('bundle_forbidden');
    expect(result.snapshots).toHaveLength(0);
  });

  it('excludes expired bundles and reports bundle_expired', async () => {
    const client = {
      courierDownloadBundle: {
        findFirst: async () => ({
          id: 'bundle-old',
          userId: 'user-a',
          expiresAt: new Date('2020-01-01'),
          workItems: [
            {
              id: 'wi-old',
              userId: 'user-a',
              excloadOrderNo: 'EXC',
              inputSource: 'API',
              sourceMallKey: 'smartstore::a',
              sourceMallLabel: null,
              mallOrderNo: 'M',
              orderSyncOrderId: null,
              matchFingerprintHmac: null,
              expiresAt: new Date('2020-01-01'),
            },
          ],
        }),
      },
      orderSyncOrder: { findMany: async () => [] },
    };
    const result = await loadMatchingCandidatesFromBundle(client, {
      userId: 'user-a',
      downloadBundleId: 'bundle-old',
      now: new Date('2026-07-21'),
    });
    expect(result.emptyReason).toBe('bundle_expired');
    expect(result.bundle?.expired).toBe(true);
    expect(result.snapshots).toHaveLength(0);
  });

  it('reports bundle_no_candidates without marking expired', async () => {
    const client = {
      courierDownloadBundle: {
        findFirst: async () => ({
          id: 'bundle-empty',
          userId: 'user-a',
          expiresAt: new Date('2099-01-01'),
          workItems: [
            {
              id: 'wi-empty',
              userId: 'user-a',
              excloadOrderNo: '',
              inputSource: 'API',
              sourceMallKey: null,
              sourceMallLabel: null,
              mallOrderNo: null,
              orderSyncOrderId: null,
              matchFingerprintHmac: null,
              expiresAt: new Date('2099-01-01'),
            },
          ],
        }),
      },
      orderSyncOrder: { findMany: async () => [] },
    };
    const result = await loadMatchingCandidatesFromBundle(client, {
      userId: 'user-a',
      downloadBundleId: 'bundle-empty',
    });
    expect(result.emptyReason).toBe('bundle_no_candidates');
    expect(result.bundle?.expired).toBe(false);
  });
});

describe('getEmptyOrderSnapshotMessage status copy', () => {
  it('shows expiry only when bundle_expired', () => {
    expect(
      getEmptyOrderSnapshotMessage(0, 4, { emptyReason: 'bundle_expired', bundleExpired: true }),
    ).toBe('선택한 다운로드 내역의 보관기간이 만료되었습니다.');
  });

  it('does not mention expiry for missing candidates on active bundle', () => {
    const msg = getEmptyOrderSnapshotMessage(0, 4, { emptyReason: 'bundle_no_candidates' });
    expect(msg).toContain('매칭 가능한 주문 데이터가 저장되지 않았습니다');
    expect(msg).not.toContain('만료');
  });

  it('shows example preview message', () => {
    expect(getEmptyOrderSnapshotMessage(0, 4, { emptyReason: 'example_preview' })).toContain(
      '예시 미리보기',
    );
  });
});

describe('example preview drafts', () => {
  it('does not create API work items for empty accountId fixture', () => {
    const drafts = buildCourierDownloadWorkItemDraftsFromPreviewRows([
      {
        rowId: '1',
        data: { 주문번호: 'DEMO-1' } as never,
        orderSyncSource: {
          mallId: 'smartstore',
          accountId: '',
          standardRow: { 주문번호: 'DEMO-1', 받는사람전화1: '010-1000-0001' },
          isExamplePreview: true,
        },
      },
    ]);
    expect(drafts).toHaveLength(0);
  });

  it('stores API refs for real account downloads', () => {
    const drafts = buildCourierDownloadWorkItemDraftsFromPreviewRows([
      {
        rowId: '1',
        data: {} as never,
        orderSyncSource: {
          mallId: 'coupang',
          accountId: 'acc-real',
          standardRow: {
            주문번호: 'CP-1',
            받는사람: '홍길동',
            받는사람전화1: '01012345678',
          },
        },
      },
    ]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.inputSource).toBe('API');
    expect(drafts[0]?.sourceMallKey).toBe('coupang::acc-real');
    expect(drafts[0]?.mallOrderNo).toBe('CP-1');
    expect(drafts[0]?.matchMaterial?.receiverPhone).toBeTruthy();
  });

  it('uses sourceMallOrderNo for excel preview without 주문번호 courier column', () => {
    const drafts = buildCourierDownloadWorkItemDraftsFromPreviewRows([
      {
        rowId: '1',
        data: { 받는분성명: '가상수령인갑', 받는분전화번호: '010-7001-0001' } as never,
        courierDownloadInputSource: 'EXCEL',
        sourceMallOrderNo: 'VIRT-ORD-001',
      },
      {
        rowId: '2',
        data: { 받는분성명: '이름만' } as never,
        courierDownloadInputSource: 'EXCEL',
      },
    ]);
    expect(drafts[0]?.mallOrderNo).toBe('VIRT-ORD-001');
    expect(drafts[1]?.mallOrderNo).toBeNull();
  });
});

describe('workItemToOrderSyncSnapshot', () => {
  it('builds manual work item candidate', () => {
    const snap: OrderSyncOrderSnapshot = workItemToOrderSyncSnapshot({
      id: 'wi-m',
      userId: 'u1',
      excloadOrderNo: 'EXC-M',
      inputSource: 'TEXT',
      sourceMallKey: '자사몰',
      sourceMallLabel: '자사몰',
      mallOrderNo: 'T-1',
      orderSyncOrderId: null,
      matchFingerprintHmac: 'v1|p:abc',
      expiresAt: new Date(),
    });
    expect(snap.workItemCandidate).toBe(true);
    expect(snap.mallOrderNo).toBe('T-1');
  });
});
