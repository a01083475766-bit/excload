import { OrderIntegrationProvider } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getIntegrationTransportInfo, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { prisma } from '@/app/lib/prisma';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import {
  ensureCafe24AccessToken,
  getCafe24AccountForUser,
  markCafe24AccountSyncResult,
  toCafe24Credentials,
} from '@/app/lib/order-integration/cafe24-account';
import { fetchCafe24Orders, toUserFacingCafe24ErrorMessage } from '@/app/lib/cafe24/client';
import {
  CAFE24_PREVIEW_HEADERS,
  mapCafe24OrdersToOrderStandardFile,
  mapCafe24OrdersToPreviewRows,
} from '@/app/lib/cafe24/map-cafe24-orders';
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
        error: '카페24 API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.',
      },
      { status: 400 },
    );
  }

  const account = await getCafe24AccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 카페24 연동 정보가 없습니다. 먼저 저장해 주세요.' },
      { status: 404 },
    );
  }

  try {
    const { accessToken } = await ensureCafe24AccessToken(account);
    const credentials = toCafe24Credentials(account);
    const orders = await fetchCafe24Orders({ credentials, accessToken, days });
    const orderStandardFile = mapCafe24OrdersToOrderStandardFile(orders);
    const previewRows = mapCafe24OrdersToPreviewRows(orders);

    await markCafe24AccountSyncResult({ accountId: account.id, success: true });

    const snapshotPersist = await maybePersistOrderFetchResult({
      client: prisma,
      enabled: isOrderSyncSnapshotPersistEnabled(),
      userId: auth.userId,
      provider: OrderIntegrationProvider.CAFE24,
      integrationAccountId: account.id,
      orderStandardFile,
      rawOrders: undefined,
      fetchedAt: new Date(),
    });

    const transport = getIntegrationTransportInfo();

    return NextResponse.json({
      success: true,
      message: `카페24 주문 ${previewRows.length}건을 불러왔습니다.`,
      count: previewRows.length,
      previewHeaders: CAFE24_PREVIEW_HEADERS,
      previewRows,
      orderStandardFile,
      snapshotPersist,
      debug: {
        transport,
        rawOrderCount: orders.length,
      },
    });
  } catch (error) {
    const message = toUserFacingCafe24ErrorMessage(error);
    console.error('[Cafe24 Integration Fetch] failed:', error instanceof Error ? error.message : error);
    await markCafe24AccountSyncResult({
      accountId: account.id,
      success: false,
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
