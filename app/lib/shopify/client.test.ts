import { describe, expect, it, vi } from 'vitest';
import {
  ShopifyApiError,
  buildShopifyGraphqlUrl,
  shopifyGraphqlRequest,
  toUserFacingShopifyErrorMessage,
} from '@/app/lib/shopify/client';

describe('buildShopifyGraphqlUrl', () => {
  it('builds graphql admin endpoint for normalized shop domain', () => {
    expect(buildShopifyGraphqlUrl('mystore', '2026-01')).toBe(
      'https://mystore.myshopify.com/admin/api/2026-01/graphql.json',
    );
  });
});

describe('shopifyGraphqlRequest', () => {
  it('sends X-Shopify-Access-Token header and returns data', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers['X-Shopify-Access-Token']).toBe('fake-access-token');
      expect(headers['Content-Type']).toBe('application/json');

      return new Response(
        JSON.stringify({
          data: {
            shop: {
              name: 'Test Shop',
              myshopifyDomain: 'mystore.myshopify.com',
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const data = await shopifyGraphqlRequest<{ shop: { name: string } }>({
      shopDomain: 'mystore.myshopify.com',
      accessToken: 'fake-access-token',
      query: '{ shop { name } }',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(data.shop.name).toBe('Test Shop');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('handles HTTP 401 without exposing token', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response('Unauthorized', { status: 401 });
    });

    await expect(
      shopifyGraphqlRequest({
        shopDomain: 'mystore.myshopify.com',
        accessToken: 'shpat_secret_value',
        query: '{ shop { name } }',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      userMessage: 'Shopify OAuth 인증에 실패했습니다. 연동을 다시 진행해 주세요.',
    });

    expect(toUserFacingShopifyErrorMessage(new Error('token shpat_secret_value leaked'))).toBe(
      'Shopify API 호출에 실패했습니다.',
    );
  });

  it('handles HTTP 403', async () => {
    const fetchImpl = vi.fn(async () => new Response('Forbidden', { status: 403 }));

    await expect(
      shopifyGraphqlRequest({
        shopDomain: 'mystore.myshopify.com',
        accessToken: 'fake-access-token',
        query: '{ shop { name } }',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(ShopifyApiError);
  });

  it('handles HTTP 429 and GraphQL THROTTLED errors', async () => {
    const fetch429 = vi.fn(async () => new Response('Too Many Requests', { status: 429 }));
    await expect(
      shopifyGraphqlRequest({
        shopDomain: 'mystore.myshopify.com',
        accessToken: 'fake-access-token',
        query: '{ shop { name } }',
        fetchImpl: fetch429 as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      userMessage: 'Shopify API 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
    });

    const fetchThrottled = vi.fn(async () =>
      new Response(
        JSON.stringify({
          errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      shopifyGraphqlRequest({
        shopDomain: 'mystore.myshopify.com',
        accessToken: 'fake-access-token',
        query: '{ shop { name } }',
        fetchImpl: fetchThrottled as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      userMessage: 'Shopify API 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
    });
  });

  it('handles GraphQL errors in 200 response', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          errors: [{ message: 'Field error' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      shopifyGraphqlRequest({
        shopDomain: 'mystore.myshopify.com',
        accessToken: 'fake-access-token',
        query: '{ shop { name } }',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      userMessage: 'Field error',
    });
  });
});
