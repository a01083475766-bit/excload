import { describe, expect, it, vi } from 'vitest';
import {
  SHOPIFY_FETCH_ORDERS_QUERY,
  SHOPIFY_MAX_QUERY_DAYS,
  buildShopifyOrdersDateRange,
  buildShopifyOrdersSearchQuery,
  clampShopifyQueryDays,
  fetchShopifyOrders,
  fetchShopifyOrdersPage,
  testShopifyConnection,
} from '@/app/lib/shopify/orders';

describe('shopify orders date helpers', () => {
  const now = new Date('2026-07-08T12:00:00.000Z');

  it('clamps days to max 60', () => {
    expect(clampShopifyQueryDays()).toBe(7);
    expect(clampShopifyQueryDays(90)).toBe(SHOPIFY_MAX_QUERY_DAYS);
    expect(clampShopifyQueryDays(0)).toBe(1);
  });

  it('clamps start date to 60-day window', () => {
    const range = buildShopifyOrdersDateRange({ days: 90, now });
    const diffDays = Math.round((range.end.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBeLessThanOrEqual(SHOPIFY_MAX_QUERY_DAYS);
    expect(range.days).toBe(SHOPIFY_MAX_QUERY_DAYS);
  });

  it('builds created_at search query with test:false', () => {
    const start = new Date('2026-07-01T00:00:00.000Z');
    const end = new Date('2026-07-08T00:00:00.000Z');
    expect(buildShopifyOrdersSearchQuery({ start, end })).toBe(
      'created_at:>=2026-07-01 created_at:<=2026-07-08 test:false',
    );
    expect(buildShopifyOrdersSearchQuery({ start, end, dateField: 'processed_at' })).toBe(
      'processed_at:>=2026-07-01 processed_at:<=2026-07-08 test:false',
    );
  });

  it('does not include read_all_orders in query string', () => {
    const start = new Date('2026-07-01T00:00:00.000Z');
    const end = new Date('2026-07-08T00:00:00.000Z');
    const query = buildShopifyOrdersSearchQuery({ start, end });
    expect(query).not.toContain('read_all_orders');
    expect(SHOPIFY_FETCH_ORDERS_QUERY).not.toContain('read_all_orders');
  });
});

describe('fetchShopifyOrdersPage', () => {
  it('maps graphql orders response', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            orders: {
              edges: [
                {
                  cursor: 'cursor-1',
                  node: {
                    id: 'gid://shopify/Order/1',
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
                      city: 'Toronto',
                      province: 'ON',
                      zip: 'M5V 1A1',
                      country: 'Canada',
                    },
                    customer: {
                      displayName: 'Jane Doe',
                      phone: '+1 555-0100',
                    },
                    lineItems: {
                      edges: [
                        {
                          node: {
                            id: 'gid://shopify/LineItem/11',
                            title: 'T-Shirt',
                            variantTitle: 'Blue / M',
                            quantity: 2,
                          },
                        },
                      ],
                    },
                  },
                },
              ],
              pageInfo: {
                hasNextPage: false,
                endCursor: 'cursor-1',
              },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const page = await fetchShopifyOrdersPage({
      shopDomain: 'mystore.myshopify.com',
      accessToken: 'fake-access-token',
      searchQuery: 'created_at:>=2026-07-01 created_at:<=2026-07-08 test:false',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(page.orders).toHaveLength(1);
    expect(page.orders[0]?.name).toBe('#1001');
    expect(page.orders[0]?.lineItems).toHaveLength(1);
    expect(page.orders[0]?.lineItems[0]?.title).toBe('T-Shirt');
  });
});

describe('fetchShopifyOrders pagination', () => {
  it('follows pageInfo cursor until complete', async () => {
    let callCount = 0;
    const fetchImpl = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            data: {
              orders: {
                edges: [
                  {
                    node: {
                      id: 'gid://shopify/Order/1',
                      name: '#1001',
                      createdAt: '2026-07-01T10:00:00Z',
                      lineItems: { edges: [] },
                    },
                  },
                ],
                pageInfo: { hasNextPage: true, endCursor: 'cursor-2' },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({
          data: {
            orders: {
              edges: [
                {
                  node: {
                    id: 'gid://shopify/Order/2',
                    name: '#1002',
                    createdAt: '2026-07-02T10:00:00Z',
                    lineItems: { edges: [] },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: 'cursor-3' },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const orders = await fetchShopifyOrders({
      shopDomain: 'mystore.myshopify.com',
      accessToken: 'fake-access-token',
      days: 7,
      now: new Date('2026-07-08T12:00:00.000Z'),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(orders).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('testShopifyConnection', () => {
  it('returns shop info from mocked graphql', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            shop: {
              name: 'Test Shop',
              myshopifyDomain: 'mystore.myshopify.com',
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await testShopifyConnection({
      shopDomain: 'mystore.myshopify.com',
      accessToken: 'fake-access-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      shopName: 'Test Shop',
      myshopifyDomain: 'mystore.myshopify.com',
    });
  });
});
