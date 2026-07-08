import { shopifyGraphqlRequest } from '@/app/lib/shopify/client';

export const SHOPIFY_MAX_QUERY_DAYS = 60;
export const SHOPIFY_DEFAULT_FETCH_DAYS = 7;
export const SHOPIFY_ORDERS_PAGE_SIZE = 50;

export type ShopifyDateField = 'created_at' | 'processed_at';

export type ShopifyShippingAddress = {
  name?: string | null;
  phone?: string | null;
  address1?: string | null;
  address2?: string | null;
  zip?: string | null;
  province?: string | null;
  city?: string | null;
  country?: string | null;
};

export type ShopifyCustomer = {
  displayName?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type ShopifyLineItem = {
  id: string;
  title: string;
  variantTitle?: string | null;
  quantity: number;
  sku?: string | null;
};

export type ShopifyOrderRecord = {
  id: string;
  name: string;
  createdAt: string;
  processedAt?: string | null;
  displayFinancialStatus?: string | null;
  displayFulfillmentStatus?: string | null;
  note?: string | null;
  shippingAddress?: ShopifyShippingAddress | null;
  customer?: ShopifyCustomer | null;
  lineItems: ShopifyLineItem[];
};

type ShopifyOrdersPageInfo = {
  hasNextPage: boolean;
  endCursor?: string | null;
};

type ShopifyOrdersGraphqlNode = {
  id: string;
  name: string;
  createdAt: string;
  processedAt?: string | null;
  displayFinancialStatus?: string | null;
  displayFulfillmentStatus?: string | null;
  note?: string | null;
  shippingAddress?: ShopifyShippingAddress | null;
  customer?: ShopifyCustomer | null;
  lineItems?: {
    edges?: Array<{
      node?: {
        id?: string;
        title?: string;
        variantTitle?: string | null;
        quantity?: number;
        sku?: string | null;
      };
    }>;
  };
};

type ShopifyOrdersGraphqlResponse = {
  orders?: {
    edges?: Array<{
      cursor?: string;
      node?: ShopifyOrdersGraphqlNode;
    }>;
    pageInfo?: ShopifyOrdersPageInfo;
  };
};

export const SHOPIFY_FETCH_ORDERS_QUERY = `
query FetchOrders($first: Int!, $after: String, $query: String) {
  orders(first: $first, after: $after, query: $query, sortKey: PROCESSED_AT, reverse: true) {
    edges {
      cursor
      node {
        id
        name
        createdAt
        processedAt
        displayFinancialStatus
        displayFulfillmentStatus
        note
        shippingAddress {
          name
          phone
          address1
          address2
          zip
          province
          city
          country
        }
        customer {
          displayName
          phone
          email
        }
        lineItems(first: 50) {
          edges {
            node {
              id
              title
              variantTitle
              quantity
              sku
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`.trim();

export const SHOPIFY_TEST_SHOP_QUERY = `
query ShopifyConnectionTest {
  shop {
    name
    myshopifyDomain
  }
}
`.trim();

export function clampShopifyQueryDays(days?: number): number {
  const requested = days ?? SHOPIFY_DEFAULT_FETCH_DAYS;
  if (!Number.isFinite(requested) || requested < 1) return 1;
  return Math.min(Math.floor(requested), SHOPIFY_MAX_QUERY_DAYS);
}

export function formatShopifySearchDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildShopifyOrdersDateRange(input: {
  days?: number;
  now?: Date;
}): { start: Date; end: Date; days: number } {
  const now = input.now ?? new Date();
  const days = clampShopifyQueryDays(input.days);
  const end = now;
  const requestedStart = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const maxStart = new Date(end.getTime() - SHOPIFY_MAX_QUERY_DAYS * 24 * 60 * 60 * 1000);
  const start = requestedStart < maxStart ? maxStart : requestedStart;
  return { start, end, days };
}

export function buildShopifyOrdersSearchQuery(input: {
  start: Date;
  end: Date;
  dateField?: ShopifyDateField;
}): string {
  const dateField = input.dateField ?? 'created_at';
  const start = formatShopifySearchDate(input.start);
  const end = formatShopifySearchDate(input.end);
  return `${dateField}:>=${start} ${dateField}:<=${end} test:false`;
}

function mapGraphqlOrderNode(node: ShopifyOrdersGraphqlNode): ShopifyOrderRecord {
  const lineItems =
    node.lineItems?.edges
      ?.map((edge) => edge.node)
      .filter((item): item is NonNullable<typeof item> => Boolean(item?.id && item.title))
      .map((item) => ({
        id: item.id!,
        title: item.title!,
        variantTitle: item.variantTitle ?? null,
        quantity: typeof item.quantity === 'number' ? item.quantity : 1,
        sku: item.sku ?? null,
      })) ?? [];

  return {
    id: node.id,
    name: node.name,
    createdAt: node.createdAt,
    processedAt: node.processedAt ?? null,
    displayFinancialStatus: node.displayFinancialStatus ?? null,
    displayFulfillmentStatus: node.displayFulfillmentStatus ?? null,
    note: node.note ?? null,
    shippingAddress: node.shippingAddress ?? null,
    customer: node.customer ?? null,
    lineItems,
  };
}

export async function fetchShopifyOrdersPage(input: {
  shopDomain: string;
  accessToken: string;
  searchQuery: string;
  first?: number;
  after?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<{
  orders: ShopifyOrderRecord[];
  pageInfo: ShopifyOrdersPageInfo;
}> {
  const data = await shopifyGraphqlRequest<ShopifyOrdersGraphqlResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    query: SHOPIFY_FETCH_ORDERS_QUERY,
    variables: {
      first: input.first ?? SHOPIFY_ORDERS_PAGE_SIZE,
      after: input.after ?? null,
      query: input.searchQuery,
    },
    fetchImpl: input.fetchImpl,
  });

  const edges = data.orders?.edges ?? [];
  const orders = edges
    .map((edge) => edge.node)
    .filter((node): node is ShopifyOrdersGraphqlNode => Boolean(node?.id && node?.name))
    .map((node) => mapGraphqlOrderNode(node));

  return {
    orders,
    pageInfo: data.orders?.pageInfo ?? { hasNextPage: false, endCursor: null },
  };
}

export async function fetchShopifyOrders(input: {
  shopDomain: string;
  accessToken: string;
  days?: number;
  dateField?: ShopifyDateField;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<ShopifyOrderRecord[]> {
  const { start, end } = buildShopifyOrdersDateRange({
    days: input.days,
    now: input.now,
  });
  const searchQuery = buildShopifyOrdersSearchQuery({
    start,
    end,
    dateField: input.dateField,
  });

  const allOrders: ShopifyOrderRecord[] = [];
  let after: string | null = null;

  do {
    const page = await fetchShopifyOrdersPage({
      shopDomain: input.shopDomain,
      accessToken: input.accessToken,
      searchQuery,
      after,
      fetchImpl: input.fetchImpl,
    });

    allOrders.push(...page.orders);

    if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) {
      break;
    }

    after = page.pageInfo.endCursor;
  } while (true);

  return allOrders;
}

export async function testShopifyConnection(input: {
  shopDomain: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<{ shopName: string; myshopifyDomain: string }> {
  const data = await shopifyGraphqlRequest<{
    shop?: {
      name?: string | null;
      myshopifyDomain?: string | null;
    };
  }>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    query: SHOPIFY_TEST_SHOP_QUERY,
    fetchImpl: input.fetchImpl,
  });

  const shopName = data.shop?.name?.trim();
  const myshopifyDomain = data.shop?.myshopifyDomain?.trim();

  if (!shopName || !myshopifyDomain) {
    throw new Error('Shopify shop 정보를 확인하지 못했습니다.');
  }

  return { shopName, myshopifyDomain };
}
