import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import { createEmptyBaseHeaderRow, type BaseHeaderRow } from '@/app/pipeline/base/base-headers';
import type { OrderStandardFile, StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import type { ShopifyLineItem, ShopifyOrderRecord } from '@/app/lib/shopify/orders';

export const SHOPIFY_PREVIEW_HEADERS = [
  '주문번호',
  '상품주문번호',
  '주문상태',
  '받는사람',
  '받는사람전화1',
  '받는사람주소1',
  '상품명',
  '상품옵션',
  '수량',
  '결제일시',
  '배송메시지',
  'shopDomain',
] as const;

export type ShopifyPreviewRow = Record<(typeof SHOPIFY_PREVIEW_HEADERS)[number], string>;

function normalizePhone(value?: string | null): string {
  if (!value) return '';
  return value.replace(/[^\d+]/g, '').replace(/^\+82/, '0');
}

function formatShopifyDateTime(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed.length >= 19 ? trimmed.slice(0, 19).replace('T', ' ') : trimmed;
  }

  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  const hours = String(parsed.getUTCHours()).padStart(2, '0');
  const minutes = String(parsed.getUTCMinutes()).padStart(2, '0');
  const seconds = String(parsed.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function extractShopifyGidNumericId(gid: string): string {
  const match = gid.match(/\/(\d+)$/);
  return match?.[1] ?? gid;
}

export function formatShopifyOrderStatus(order: ShopifyOrderRecord): string {
  const financial = order.displayFinancialStatus?.trim() || '';
  const fulfillment = order.displayFulfillmentStatus?.trim() || '';

  if (financial && fulfillment) {
    return `${financial} / ${fulfillment}`;
  }

  return financial || fulfillment || '';
}

export function formatShopifyShippingAddress(
  address?: ShopifyOrderRecord['shippingAddress'],
): { address1: string; address2: string } {
  if (!address) {
    return { address1: '', address2: '' };
  }

  const address1Parts = [
    address.address1,
    address.city,
    address.province,
    address.zip,
    address.country,
  ]
    .map((part) => part?.trim())
    .filter(Boolean);

  return {
    address1: address1Parts.join(', '),
    address2: address.address2?.trim() ?? '',
  };
}

/** line item 1개를 상품요약 조각으로 변환 — 예: `반팔티 (블랙/L) x1` */
export function formatShopifyLineItemSummary(lineItem: ShopifyLineItem): string {
  const title = lineItem.title?.trim() ?? '';
  if (!title) return '';

  const variant = lineItem.variantTitle?.trim();
  const quantity = lineItem.quantity > 0 ? lineItem.quantity : 1;

  if (variant) {
    return `${title} (${variant}) x${quantity}`;
  }

  return `${title} x${quantity}`;
}

/** 주문 내 lineItems를 택배 업로드용 상품요약 문자열로 합칩니다. */
export function formatShopifyLineItemsSummary(lineItems: ShopifyLineItem[]): string {
  return lineItems.map(formatShopifyLineItemSummary).filter(Boolean).join(' / ');
}

export function sumShopifyLineItemQuantities(lineItems: ShopifyLineItem[]): number {
  return lineItems.reduce((sum, item) => sum + (item.quantity > 0 ? item.quantity : 0), 0);
}

/**
 * Shopify 주문 1건 → 표준 행 1개 (배송/택배 업로드 기준).
 * lineItems 상세 배열은 OrderStandardFile row에 별도 필드가 없어 상품명 요약 문자열로만 반영합니다.
 *
 * TODO(2차): 부분배송·상품별 송장·품절 분리 등 — line item별 행 분리 옵션 검토
 */
export function mapShopifyOrderToStandardRow(
  order: ShopifyOrderRecord,
  shopDomain?: string,
): BaseHeaderRow {
  const row = createEmptyBaseHeaderRow();
  const shipping = order.shippingAddress;
  const customer = order.customer;
  const addresses = formatShopifyShippingAddress(shipping);
  const productSummary = formatShopifyLineItemsSummary(order.lineItems);
  const totalQuantity = sumShopifyLineItemQuantities(order.lineItems);

  row['주문번호'] = order.name;
  row['상품주문번호'] = order.name;
  row['주문상태'] = formatShopifyOrderStatus(order);
  row['주문일시'] = formatShopifyDateTime(order.createdAt);
  row['결제일시'] = formatShopifyDateTime(order.processedAt || order.createdAt);
  row['받는사람'] = shipping?.name?.trim() || customer?.displayName?.trim() || '';
  row['받는사람전화1'] = normalizePhone(shipping?.phone || customer?.phone);
  row['받는사람주소1'] = addresses.address1;
  row['받는사람주소2'] = addresses.address2;
  row['주문자'] = customer?.displayName?.trim() || '';
  row['주문자연락처'] = normalizePhone(customer?.phone);
  row['상품명'] = productSummary;
  row['상품옵션'] = '';
  row['수량'] = String(totalQuantity);
  row['배송메시지'] = order.note?.trim() || '';
  row['판매처'] = 'Shopify';

  if (shopDomain) {
    row['내부메모'] = shopDomain;
  }

  return row;
}

export function mapShopifyOrderToStandardRows(
  order: ShopifyOrderRecord,
  shopDomain?: string,
): BaseHeaderRow[] {
  return [mapShopifyOrderToStandardRow(order, shopDomain)];
}

export function mapShopifyOrdersToStandardRows(
  orders: ShopifyOrderRecord[],
  shopDomain?: string,
): BaseHeaderRow[] {
  return orders.map((order) => mapShopifyOrderToStandardRow(order, shopDomain));
}

export function mapShopifyOrdersToOrderStandardFile(
  orders: ShopifyOrderRecord[],
  shopDomain?: string,
): OrderStandardFile {
  const rows: StandardOrderRow[] = mapShopifyOrdersToStandardRows(orders, shopDomain).map((row) => ({
    ...row,
  }));

  return {
    baseHeaders: BASE_HEADERS,
    rows,
    unknownHeaders: [],
  };
}

export function mapShopifyOrdersToPreviewRows(
  orders: ShopifyOrderRecord[],
  shopDomain?: string,
): ShopifyPreviewRow[] {
  return mapShopifyOrdersToStandardRows(orders, shopDomain).map((row) => ({
    주문번호: row['주문번호'],
    상품주문번호: row['상품주문번호'] ?? row['주문번호'],
    주문상태: row['주문상태'],
    받는사람: row['받는사람'],
    받는사람전화1: row['받는사람전화1'],
    받는사람주소1: [row['받는사람주소1'], row['받는사람주소2']].filter(Boolean).join(' ').trim(),
    상품명: row['상품명'],
    상품옵션: row['상품옵션'] ?? '',
    수량: row['수량'],
    결제일시: row['결제일시'],
    배송메시지: row['배송메시지'],
    shopDomain: shopDomain ?? row['내부메모'] ?? '',
  }));
}
