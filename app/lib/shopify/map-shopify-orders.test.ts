import { describe, expect, it } from 'vitest';
import {
  extractShopifyGidNumericId,
  formatShopifyLineItemSummary,
  formatShopifyLineItemsSummary,
  formatShopifyShippingAddress,
  mapShopifyOrdersToOrderStandardFile,
  mapShopifyOrdersToPreviewRows,
  mapShopifyOrdersToStandardRows,
  sumShopifyLineItemQuantities,
} from '@/app/lib/shopify/map-shopify-orders';
import type { ShopifyOrderRecord } from '@/app/lib/shopify/orders';

function buildOrder(overrides: Partial<ShopifyOrderRecord> = {}): ShopifyOrderRecord {
  return {
    id: 'gid://shopify/Order/1001',
    name: '#1001',
    createdAt: '2026-07-01T10:00:00Z',
    processedAt: '2026-07-01T10:05:00Z',
    displayFinancialStatus: 'PAID',
    displayFulfillmentStatus: 'UNFULFILLED',
    note: 'Leave at door',
    shippingAddress: {
      name: 'Jane Doe',
      phone: '+1 555-0100',
      address1: '123 Main St',
      address2: 'Apt 4',
      city: 'Toronto',
      province: 'ON',
      zip: 'M5V 1A1',
      country: 'Canada',
    },
    customer: {
      displayName: 'Jane Doe',
      phone: '+1 555-0100',
    },
    lineItems: [
      {
        id: 'gid://shopify/LineItem/11',
        title: 'T-Shirt',
        variantTitle: 'Blue / M',
        quantity: 2,
      },
      {
        id: 'gid://shopify/LineItem/12',
        title: 'Cap',
        variantTitle: 'Black',
        quantity: 1,
      },
    ],
    ...overrides,
  };
}

describe('formatShopifyLineItemsSummary', () => {
  it('combines line items with options and quantities', () => {
    expect(formatShopifyLineItemSummary(buildOrder().lineItems[0]!)).toBe('T-Shirt (Blue / M) x2');
    expect(formatShopifyLineItemsSummary(buildOrder().lineItems)).toBe(
      'T-Shirt (Blue / M) x2 / Cap (Black) x1',
    );
    expect(sumShopifyLineItemQuantities(buildOrder().lineItems)).toBe(3);
  });
});

describe('mapShopifyOrdersToStandardRows', () => {
  it('maps order 1건 = 1행 (lineItems 2개여도 배송 기준 1행)', () => {
    const rows = mapShopifyOrdersToStandardRows([buildOrder()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.['주문번호']).toBe('#1001');
    expect(rows[0]?.['상품주문번호']).toBe('#1001');
    expect(rows[0]?.['상품명']).toBe('T-Shirt (Blue / M) x2 / Cap (Black) x1');
    expect(rows[0]?.['수량']).toBe('3');
    expect(rows[0]?.['상품옵션']).toBe('');
  });

  it('uses shippingAddress with international address fallback', () => {
    const rows = mapShopifyOrdersToStandardRows([buildOrder()]);
    expect(rows[0]?.['받는사람']).toBe('Jane Doe');
    expect(rows[0]?.['받는사람전화1']).toBe('+15550100');
    expect(rows[0]?.['받는사람주소1']).toContain('123 Main St');
    expect(rows[0]?.['받는사람주소1']).toContain('Canada');
    expect(rows[0]?.['받는사람주소2']).toBe('Apt 4');
  });

  it('falls back to customer when shippingAddress is missing', () => {
    const rows = mapShopifyOrdersToStandardRows([
      buildOrder({
        shippingAddress: null,
        customer: {
          displayName: 'John Smith',
          phone: '+82 10-1234-5678',
        },
      }),
    ]);

    expect(rows[0]?.['받는사람']).toBe('John Smith');
    expect(rows[0]?.['받는사람전화1']).toBe('01012345678');
    expect(rows[0]?.['받는사람주소1']).toBe('');
  });

  it('builds OrderStandardFile with one row per order', () => {
    const file = mapShopifyOrdersToOrderStandardFile([buildOrder()], 'mystore.myshopify.com');
    expect(file.unknownHeaders).toEqual([]);
    expect(file.rows).toHaveLength(1);
    expect(file.baseHeaders).toContain('주문번호');
    expect(file.rows[0]?.['판매처']).toBe('Shopify');
    expect(file.rows[0]?.['내부메모']).toBe('mystore.myshopify.com');
    expect(file.rows[0]?.['상품명']).toContain('T-Shirt');
    expect(file.rows[0]?.['상품명']).toContain('Cap');
  });

  it('maps preview rows as one row per order with combined product summary', () => {
    const previewRows = mapShopifyOrdersToPreviewRows([buildOrder()], 'mystore.myshopify.com');
    expect(previewRows).toHaveLength(1);
    expect(previewRows[0]?.shopDomain).toBe('mystore.myshopify.com');
    expect(previewRows[0]?.['상품명']).toBe('T-Shirt (Blue / M) x2 / Cap (Black) x1');
    expect(previewRows[0]?.['수량']).toBe('3');
    expect(previewRows[0]?.['상품옵션']).toBe('');
  });

  it('does not repeat the same order number across multiple preview rows', () => {
    const previewRows = mapShopifyOrdersToPreviewRows([buildOrder(), buildOrder({ name: '#1002' })]);
    expect(previewRows).toHaveLength(2);
    expect(previewRows.map((row) => row['주문번호'])).toEqual(['#1001', '#1002']);
  });
});

describe('formatShopifyShippingAddress', () => {
  it('joins international address parts safely', () => {
    const formatted = formatShopifyShippingAddress({
      address1: '10 Downing St',
      city: 'London',
      province: 'England',
      zip: 'SW1A 2AA',
      country: 'United Kingdom',
    });
    expect(formatted.address1).toBe('10 Downing St, London, England, SW1A 2AA, United Kingdom');
  });
});

describe('extractShopifyGidNumericId', () => {
  it('extracts numeric id from gid', () => {
    expect(extractShopifyGidNumericId('gid://shopify/LineItem/123456')).toBe('123456');
  });
});
