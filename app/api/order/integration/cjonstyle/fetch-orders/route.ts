import { OrderIntegrationProvider } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getIntegrationTransportInfo, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { prisma } from '@/app/lib/prisma';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import {
  getCjonstyleAccountForUser,
  markCjonstyleAccountSyncResult,
  toCjonstyleCredentials,
} from '@/app/lib/order-integration/cjonstyle-account';
import { fetchCjonstyleOrders, toUserFacingCjonstyleErrorMessage } from '@/app/lib/cjonstyle/client';
import {
  CJONSTYLE_PREVIEW_HEADERS,
  mapCjonstyleOrdersToOrderStandardFile,
  mapCjonstyleOrdersToPreviewRows,
} from '@/app/lib/cjonstyle/map-cjonstyle-orders';
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
        error: 'CJ온스타일 API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.',
      },
      { status: 400 },
    );
  }

  const account = await getCjonstyleAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 CJ온스타일 연동 정보가 없습니다. 먼저 저장해 주세요.' },
      { status: 404 },
    );
  }

  try {
    const credentials = toCjonstyleCredentials(account);
    const orders = await fetchCjonstyleOrders({ credentials, days });
    const orderStandardFile = mapCjonstyleOrdersToOrderStandardFile(orders);
    const previewRows = mapCjonstyleOrdersToPreviewRows(orders);

    await markCjonstyleAccountSyncResult({ accountId: account.id, success: true });

    const snapshotPersist = await maybePersistOrderFetchResult({
      client: prisma,
      enabled: isOrderSyncSnapshotPersistEnabled(),
      userId: auth.userId,
      provider: OrderIntegrationProvider.CJONSTYLE,
      integrationAccountId: account.id,
      orderStandardFile,
      rawOrders: undefined,
      fetchedAt: new Date(),
    });

    const transport = getIntegrationTransportInfo();

    return NextResponse.json({
      success: true,
      message: `CJ온스타일 주문 ${previewRows.length}건을 불러왔습니다.`,
      count: previewRows.length,
      previewHeaders: CJONSTYLE_PREVIEW_HEADERS,
      previewRows,
      orderStandardFile,
      snapshotPersist,
      debug: {
        transport,
        rawOrderCount: orders.length,
        deliveryMethodCodes: credentials.deliveryMethodCodes,
      },
    });
  } catch (error) {
    const message = toUserFacingCjonstyleErrorMessage(error);
    console.error('[Cjonstyle Integration Fetch] failed:', error instanceof Error ? error.message : error);
    await markCjonstyleAccountSyncResult({
      accountId: account.id,
      success: false,
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
