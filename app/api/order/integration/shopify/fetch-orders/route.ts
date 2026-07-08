import { OrderIntegrationProvider } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import {
  decryptShopifyAccountCredentials,
  getShopifyAccountForUser,
  markShopifyAccountSyncResult,
} from '@/app/lib/order-integration/shopify-account';
import { toUserFacingShopifyErrorMessage } from '@/app/lib/shopify/client';
import {
  isShopifyIntegrationEnabled,
  shopifyIntegrationDisabledJsonResponse,
} from '@/app/lib/shopify/oauth-credentials';
import {
  SHOPIFY_PREVIEW_HEADERS,
  mapShopifyOrdersToOrderStandardFile,
  mapShopifyOrdersToPreviewRows,
} from '@/app/lib/shopify/map-shopify-orders';
import { fetchShopifyOrders } from '@/app/lib/shopify/orders';
import {
  isOrderSyncSnapshotPersistEnabled,
  maybePersistOrderFetchResult,
} from '@/app/lib/order-integration/snapshots/persist-order-fetch-result';

export async function POST() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  if (!isShopifyIntegrationEnabled()) {
    return shopifyIntegrationDisabledJsonResponse();
  }

  const account = await getShopifyAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 Shopify 연동 정보가 없습니다. 먼저 OAuth 연동을 완료해 주세요.' },
      { status: 404 },
    );
  }

  try {
    const credentials = decryptShopifyAccountCredentials(account);
    if (!credentials.accessToken) {
      return NextResponse.json(
        { error: 'Shopify access token이 없습니다. OAuth 연동을 먼저 완료해 주세요.' },
        { status: 400 },
      );
    }

    if (credentials.scope?.split(',').some((item) => item.trim() === 'read_all_orders')) {
      return NextResponse.json(
        { error: 'read_all_orders scope는 1차 Shopify 연동에서 지원하지 않습니다.' },
        { status: 400 },
      );
    }

    const orders = await fetchShopifyOrders({
      shopDomain: credentials.shopDomain,
      accessToken: credentials.accessToken,
      days: 7,
    });
    const orderStandardFile = mapShopifyOrdersToOrderStandardFile(orders, credentials.shopDomain);
    const previewRows = mapShopifyOrdersToPreviewRows(orders, credentials.shopDomain);

    await markShopifyAccountSyncResult({ accountId: account.id, success: true });

    const snapshotPersist = await maybePersistOrderFetchResult({
      client: prisma,
      enabled: isOrderSyncSnapshotPersistEnabled(),
      userId: auth.userId,
      provider: OrderIntegrationProvider.SHOPIFY,
      integrationAccountId: account.id,
      orderStandardFile,
      rawOrders: undefined,
      fetchedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: `Shopify 주문 ${previewRows.length}건을 불러왔습니다.`,
      count: previewRows.length,
      previewHeaders: SHOPIFY_PREVIEW_HEADERS,
      previewRows,
      orderStandardFile,
      snapshotPersist,
      debug: {
        transport: { mode: 'direct' as const },
        rawOrderCount: orders.length,
        shopDomain: credentials.shopDomain,
      },
    });
  } catch (error) {
    const message = toUserFacingShopifyErrorMessage(error);
    console.error('[Shopify Integration Fetch] failed:', error instanceof Error ? error.message : error);
    await markShopifyAccountSyncResult({
      accountId: account.id,
      success: false,
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
