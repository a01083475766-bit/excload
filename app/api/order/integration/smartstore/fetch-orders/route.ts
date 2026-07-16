import { OrderIntegrationProvider } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getIntegrationTransportInfo, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { prisma } from '@/app/lib/prisma';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  getSmartstoreAccountForUser,
  markSmartstoreAccountSyncResult,
  toSmartstoreCredentials,
} from '@/app/lib/order-integration/smartstore-account';
import {
  fetchSmartstoreProductOrders,
  toUserFacingSmartstoreErrorMessage,
} from '@/app/lib/smartstore/client';
import {
  mapSmartstoreOrdersToFetchViews,
  mapSmartstoreOrdersToOrderStandardFile,
  mapSmartstoreOrdersToPreviewRows,
  SMARTSTORE_PREVIEW_HEADERS,
} from '@/app/lib/smartstore/map-smartstore-orders';
import {
  isOrderSyncSnapshotPersistEnabled,
  maybePersistOrderFetchResult,
} from '@/app/lib/order-integration/snapshots/persist-order-fetch-result';
import { readFetchOrderDays } from '@/app/lib/order-integration/parse-fetch-order-days';

export async function POST(request: Request) {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const days = await readFetchOrderDays(request);

  if (!isIntegrationProxyConfigured()) {
    return NextResponse.json(
      {
        error:
          '스마트스토어 API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.',
      },
      { status: 400 },
    );
  }

  const account = await getSmartstoreAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 스마트스토어 연동 정보가 없습니다. 먼저 저장해 주세요.' },
      { status: 404 },
    );
  }

  try {
    const credentials = toSmartstoreCredentials(account);
    const orders = await fetchSmartstoreProductOrders({ credentials, days });
    const orderStandardFile = mapSmartstoreOrdersToOrderStandardFile(orders);
    const previewRows = mapSmartstoreOrdersToPreviewRows(orders);
    const orderViews = mapSmartstoreOrdersToFetchViews(orders);

    await markSmartstoreAccountSyncResult({ accountId: account.id, success: true });

    const snapshotPersist = await maybePersistOrderFetchResult({
      client: prisma,
      enabled: isOrderSyncSnapshotPersistEnabled(),
      userId: auth.userId,
      provider: OrderIntegrationProvider.SMARTSTORE,
      integrationAccountId: account.id,
      orderStandardFile,
      rawOrders: undefined,
      fetchedAt: new Date(),
    });

    const transport = getIntegrationTransportInfo();

    return NextResponse.json({
      success: true,
      message: `스마트스토어 주문 ${previewRows.length}건을 불러왔습니다.`,
      count: previewRows.length,
      previewHeaders: SMARTSTORE_PREVIEW_HEADERS,
      previewRows,
      orderStandardFile,
      orderViews,
      snapshotPersist,
      debug: {
        transport,
        rawOrderCount: orders.length,
      },
    });
  } catch (error) {
    const message = toUserFacingSmartstoreErrorMessage(error);
    console.error('[Smartstore Integration Fetch] failed:', error instanceof Error ? error.message : error);
    await markSmartstoreAccountSyncResult({
      accountId: account.id,
      success: false,
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
