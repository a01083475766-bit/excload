import { OrderIntegrationProvider } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getIntegrationTransportInfo, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { prisma } from '@/app/lib/prisma';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import {
  getShopbyAccountForUser,
  markShopbyAccountSyncResult,
  toShopbyCredentials,
} from '@/app/lib/order-integration/shopby-account';
import { fetchShopbyOrders, toUserFacingShopbyErrorMessage } from '@/app/lib/shopby/client';
import {
  SHOPBY_PREVIEW_HEADERS,
  mapShopbyOrdersToOrderStandardFile,
  mapShopbyOrdersToPreviewRows,
} from '@/app/lib/shopby/map-shopby-orders';
import {
  isOrderSyncSnapshotPersistEnabled,
  maybePersistOrderFetchResult,
} from '@/app/lib/order-integration/snapshots/persist-order-fetch-result';
import { readFetchOrderDays } from '@/app/lib/order-integration/parse-fetch-order-days';

export async function POST(request: Request) {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  const days = await readFetchOrderDays(request);

  if (!isIntegrationProxyConfigured()) {
    return NextResponse.json(
      {
        error: '샵바이 API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.',
      },
      { status: 400 },
    );
  }

  const account = await getShopbyAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 샵바이 연동 정보가 없습니다. 먼저 저장해 주세요.' },
      { status: 404 },
    );
  }

  try {
    const credentials = toShopbyCredentials(account);
    const orders = await fetchShopbyOrders({ credentials, days });
    const orderStandardFile = mapShopbyOrdersToOrderStandardFile(orders);
    const previewRows = mapShopbyOrdersToPreviewRows(orders);

    await markShopbyAccountSyncResult({ accountId: account.id, success: true });

    const snapshotPersist = await maybePersistOrderFetchResult({
      client: prisma,
      enabled: isOrderSyncSnapshotPersistEnabled(),
      userId: auth.userId,
      provider: OrderIntegrationProvider.SHOPBY,
      integrationAccountId: account.id,
      orderStandardFile,
      rawOrders: undefined,
      fetchedAt: new Date(),
    });

    const transport = getIntegrationTransportInfo();

    return NextResponse.json({
      success: true,
      message: `샵바이 주문 ${previewRows.length}건을 불러왔습니다.`,
      count: previewRows.length,
      previewHeaders: SHOPBY_PREVIEW_HEADERS,
      previewRows,
      orderStandardFile,
      snapshotPersist,
      debug: {
        transport,
        rawOrderCount: orders.length,
      },
    });
  } catch (error) {
    const message = toUserFacingShopbyErrorMessage(error);
    console.error('[Shopby Integration Fetch] failed:', error instanceof Error ? error.message : error);
    await markShopbyAccountSyncResult({
      accountId: account.id,
      success: false,
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
