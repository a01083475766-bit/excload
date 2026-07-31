import { describe, expect, it, vi } from 'vitest';
import { CAFE24_OAUTH_SCOPES, CAFE24_REQUIRED_SCOPES } from '@/app/lib/cafe24/constants';
import { buildCafe24AuthorizeUrl } from '@/app/lib/cafe24/client';
import {
  hasAllCafe24RequiredScopes,
  listMissingCafe24Scopes,
} from '@/app/lib/cafe24/scopes';
import {
  buildCafe24CreateShipmentBody,
  classifyCafe24ShipmentHttpError,
  extractCafe24OrderItemCodes,
  extractCafe24ShopNoFromMallLineItemIds,
  findConflictingCafe24Shipment,
  findMatchingCafe24Shipment,
  mapCafe24ShipmentVerifyStatus,
  runCafe24InvoiceTransmission,
} from '@/app/lib/cafe24/cafe24-invoice';
import {
  createCafe24CarrierListCache,
  resolveCafe24ShippingCompanyCode,
} from '@/app/lib/cafe24/cafe24-carrier-resolve';
import { mapCafe24OrdersToStandardRows } from '@/app/lib/cafe24/map-cafe24-orders';
import { buildOrderSyncSnapshots } from '@/app/lib/order-integration/snapshots/build-order-sync-snapshots';
import { createRealShipmentTransmissionAdapterRegistry } from '@/app/lib/order-integration/transmission/real-adapters';
import type { OrderIntegrationAccount } from '@prisma/client';

describe('Cafe24 OAuth scopes', () => {
  it('includes all three required scopes in authorize URL', () => {
    for (const scope of CAFE24_REQUIRED_SCOPES) {
      expect(CAFE24_OAUTH_SCOPES.split(/\s+/)).toContain(scope);
    }
    const url = buildCafe24AuthorizeUrl({
      mallId: 'demomall',
      clientId: 'client-id',
      state: 'state-1',
    });
    const scopeParam = new URL(url).searchParams.get('scope') ?? '';
    expect(scopeParam).toContain('mall.read_order');
    expect(scopeParam).toContain('mall.write_order');
    expect(scopeParam).toContain('mall.read_shipping');
  });

  it('flags read-only tokens as needing reauth', () => {
    expect(hasAllCafe24RequiredScopes(['mall.read_order'])).toBe(false);
    expect(listMissingCafe24Scopes(['mall.read_order'])).toEqual([
      'mall.write_order',
      'mall.read_shipping',
    ]);
  });
});

describe('Cafe24 carrier resolve', () => {
  it('maps aliases via carriers list without guessing on ambiguity', () => {
    const ok = resolveCafe24ShippingCompanyCode({
      carriers: [{ shipping_company_code: '0004', shipping_company_name: 'CJ대한통운' }],
      courierCode: 'CJ',
      courierName: 'CJ대한통운',
    });
    expect(ok).toEqual({ ok: true, shippingCompanyCode: '0004' });

    const unmapped = resolveCafe24ShippingCompanyCode({
      carriers: [{ shipping_company_code: '9999', shipping_company_name: '기타택배' }],
      courierCode: 'CJ',
      courierName: 'CJ대한통운',
    });
    expect(unmapped.ok).toBe(false);
    if (!unmapped.ok) expect(unmapped.errorCode).toBe('COURIER_CODE_UNMAPPED');
  });

  it('caches carrier list per request key', async () => {
    const cache = createCafe24CarrierListCache();
    const loader = vi.fn(async () => [{ shipping_company_code: '0004', shipping_company_name: 'CJ' }]);
    await cache.get('acct:1', loader);
    await cache.get('acct:1', loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe('Cafe24 invoice transmission', () => {
  const carriers = [{ shipping_company_code: '0004', shipping_company_name: 'CJ대한통운' }];

  it('builds POST body with order_item_code array and shipping status', () => {
    expect(
      buildCafe24CreateShipmentBody({
        shopNo: 1,
        trackingNo: '123456789012',
        shippingCompanyCode: '0004',
        orderItemCodes: ['20260101-0001-01', '20260101-0001-02'],
      }),
    ).toEqual({
      shop_no: 1,
      request: {
        tracking_no: '123456789012',
        shipping_company_code: '0004',
        order_item_code: ['20260101-0001-01', '20260101-0001-02'],
        status: 'shipping',
      },
    });
  });

  it('dedupes order_item_code and preserves shop_no prefix separately', () => {
    expect(
      extractCafe24OrderItemCodes([
        'shop_no:2',
        'ITEM-1',
        'ITEM-1',
        'ITEM-2',
      ]),
    ).toEqual(['ITEM-1', 'ITEM-2']);
    expect(extractCafe24ShopNoFromMallLineItemIds(['shop_no:2', 'ITEM-1'])).toBe(2);
  });

  it('skips duplicate POST when same shipment already exists (idempotent)', async () => {
    const postShipment = vi.fn();
    const result = await runCafe24InvoiceTransmission({
      credentials: { mallId: 'demo', clientId: 'id', clientSecret: 'secret' },
      accessToken: 'token',
      tokenScopes: [...CAFE24_REQUIRED_SCOPES],
      mallOrderNo: '20260101-0001',
      mallLineItemIds: ['shop_no:1', '20260101-0001-01'],
      courierCode: 'CJ',
      courierName: 'CJ대한통운',
      trackingNumber: 'TRACK-1',
      fetchCarriers: async () => carriers,
      fetchShipments: async () => [
        {
          tracking_no: 'TRACK-1',
          shipping_company_code: '0004',
          order_item_code: ['20260101-0001-01'],
          status: 'shipping',
          shipping_code: 'S-1',
        },
      ],
      postShipment,
    });
    expect(result.success).toBe(true);
    expect(result.responseSummary.providerStatusCode).toBe('IDEMPOTENT_SUCCESS');
    expect(postShipment).not.toHaveBeenCalled();
  });

  it('returns conflict when another tracking exists for the same items', async () => {
    const result = await runCafe24InvoiceTransmission({
      credentials: { mallId: 'demo', clientId: 'id', clientSecret: 'secret' },
      accessToken: 'token',
      tokenScopes: [...CAFE24_REQUIRED_SCOPES],
      mallOrderNo: '20260101-0001',
      mallLineItemIds: ['20260101-0001-01'],
      courierCode: 'CJ',
      courierName: 'CJ대한통운',
      trackingNumber: 'TRACK-NEW',
      fetchCarriers: async () => carriers,
      fetchShipments: async () => [
        {
          tracking_no: 'TRACK-OLD',
          shipping_company_code: '0004',
          order_item_code: ['20260101-0001-01'],
          status: 'shipping',
        },
      ],
      postShipment: async () => ({ httpStatus: 200, bodyText: '{}' }),
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('SHIPMENT_CONFLICT');
  });

  it('posts correct URL path body and maps http errors', async () => {
    const postShipment = vi.fn(async ({ orderId, body }) => {
      expect(orderId).toBe('20260101-0001');
      expect(body.request.status).toBe('shipping');
      expect(body.request.order_item_code).toEqual(['20260101-0001-01']);
      return { httpStatus: 200, bodyText: '{}' };
    });
    const result = await runCafe24InvoiceTransmission({
      credentials: { mallId: 'demo', clientId: 'id', clientSecret: 'secret' },
      accessToken: 'token',
      tokenScopes: [...CAFE24_REQUIRED_SCOPES],
      mallOrderNo: '20260101-0001',
      mallLineItemIds: ['20260101-0001-01'],
      courierCode: 'CJ',
      courierName: 'CJ대한통운',
      trackingNumber: 'TRACK-1',
      fetchCarriers: async () => carriers,
      fetchShipments: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            tracking_no: 'TRACK-1',
            shipping_company_code: '0004',
            order_item_code: ['20260101-0001-01'],
            status: 'shipping',
            shipping_code: 'S-9',
          },
        ]),
      postShipment,
    });
    expect(result.success).toBe(true);
    expect(postShipment).toHaveBeenCalledTimes(1);

    expect(classifyCafe24ShipmentHttpError(401).errorCode).toBe('REAUTH_REQUIRED');
    expect(classifyCafe24ShipmentHttpError(403).errorCode).toBe('SCOPE_INSUFFICIENT');
    expect(classifyCafe24ShipmentHttpError(422).errorCode).toBe('VALIDATION_ERROR');
    expect(classifyCafe24ShipmentHttpError(429).retryable).toBe(true);
    expect(classifyCafe24ShipmentHttpError(503).outcomeKind).toBe('unknown');
  });

  it('maps verify shipment statuses', () => {
    expect(mapCafe24ShipmentVerifyStatus('shipping').verifyKind).toBe('confirmed');
    expect(mapCafe24ShipmentVerifyStatus('shipped').verifyKind).toBe('confirmed');
    expect(mapCafe24ShipmentVerifyStatus('standby').verifyKind).toBe('standby');
    expect(findMatchingCafe24Shipment({
      shipments: [{ tracking_no: 'T1', shipping_company_code: '0004', status: 'shipping' }],
      trackingNo: 'T1',
      shippingCompanyCode: '0004',
      orderItemCodes: ['A'],
    })?.status).toBe('shipping');
    expect(
      findConflictingCafe24Shipment({
        shipments: [{ tracking_no: 'OTHER', order_item_code: ['A'] }],
        trackingNo: 'T1',
        orderItemCodes: ['A'],
      }),
    ).toBeTruthy();
  });

  it('rejects read-only token scopes before POST', async () => {
    const postShipment = vi.fn();
    const result = await runCafe24InvoiceTransmission({
      credentials: { mallId: 'demo', clientId: 'id', clientSecret: 'secret' },
      accessToken: 'token',
      tokenScopes: ['mall.read_order'],
      mallOrderNo: '20260101-0001',
      mallLineItemIds: ['20260101-0001-01'],
      courierCode: 'CJ',
      courierName: 'CJ대한통운',
      trackingNumber: 'TRACK-1',
      fetchCarriers: async () => carriers,
      fetchShipments: async () => [],
      postShipment,
    });
    expect(result.errorCode).toBe('SCOPE_INSUFFICIENT');
    expect(postShipment).not.toHaveBeenCalled();
  });
});

describe('Cafe24 snapshot identifiers', () => {
  it('preserves shop_no and order_item_code into mallLineItemIds', () => {
    const rows = mapCafe24OrdersToStandardRows([
      {
        shop_no: 3,
        order_id: '20260101-0001',
        order_status: 'N20',
        items: [
          { order_item_code: '20260101-0001-01', product_name: 'A', quantity: 1 },
          { order_item_code: '20260101-0001-02', product_name: 'B', quantity: 1 },
        ],
      },
    ]);
    const snapshots = buildOrderSyncSnapshots({
      userId: 'u1',
      provider: 'CAFE24',
      accountId: 'a1',
      fetchedAt: new Date('2026-01-01T00:00:00.000Z'),
      rows,
    });
    expect(snapshots[0]?.mallLineItemIds).toEqual([
      'shop_no:3',
      '20260101-0001-01',
      '20260101-0001-02',
    ]);
    expect(snapshots[0]?.normalizedPayloadJson).toMatchObject({ shopNo: 3 });
  });
});

describe('Cafe24 live adapter registration', () => {
  it('does not return PROVIDER_SPEC_INCOMPLETE for CAFE24', async () => {
    const account = {
      id: 'acct-1',
      userId: 'user-1',
      provider: 'CAFE24',
      accountName: 't',
      vendorId: 'demo',
      sellerId: null,
      accessKeyCiphertext: 'x',
      accessKeyIv: 'x',
      accessKeyAuthTag: 'x',
      secretKeyCiphertext: 'x',
      secretKeyIv: 'x',
      secretKeyAuthTag: 'x',
      apiKeyCiphertext: 'x',
      apiKeyIv: 'x',
      apiKeyAuthTag: 'x',
      encryptionKeyVersion: 1,
      expiresAt: null,
      status: 'ACTIVE',
      lastTestedAt: null,
      lastSyncedAt: null,
      lastErrorMessage: null,
      healthStatus: null,
      lastCheckedAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastErrorCategory: null,
      lastErrorCode: null,
      consecutiveFailureCount: 0,
      healthOperationSequence: BigInt(0),
      healthAppliedOperationSequence: BigInt(0),
      healthCheckLeaseToken: null,
      healthCheckLeaseUntil: null,
      authorizationPeriodStart: null,
      authorizationPeriodEnd: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as OrderIntegrationAccount;

    const registry = createRealShipmentTransmissionAdapterRegistry({
      userId: 'user-1',
      loadAccount: async () => account,
      resolveAccountSecrets: () => ({
        accountId: 'acct-1',
        vendorId: 'demo',
        sellerId: null,
        accessKey: 'a',
        secretKey: 'b',
        apiKey: 'c',
      }),
    });
    const adapter = registry.get('CAFE24');
    expect(adapter).toBeTruthy();
    // credentials decrypt will fail without real crypto key — but must not be deferred stub.
    // Call with mocked path: buildPayload only.
    expect(adapter!.buildPayload({
      provider: 'CAFE24',
      integrationAccountId: 'acct-1',
      uploadBatchId: 'b',
      matchId: 'm',
      orderSyncOrderId: 'o',
      mallOrderNo: 'ORD',
      excloadOrderNo: 'EXC',
      mallLineItemIds: ['ITEM'],
      trackingNumber: 'T',
      courierCode: 'CJ',
      courierName: 'CJ',
    })).toMatchObject({ provider: 'CAFE24' });
  });
});
