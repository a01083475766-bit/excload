import { OrderIntegrationProvider } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getIntegrationTransportInfo, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { prisma } from '@/app/lib/prisma';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  getElevenAccountForUser,
  markElevenAccountSyncResult,
  toElevenCredentials,
} from '@/app/lib/order-integration/eleven-account';
import { fetchElevenOrders, toUserFacingElevenErrorMessage } from '@/app/lib/eleven/client';
import {
  ELEVEN_PREVIEW_HEADERS,
  mapElevenOrdersToOrderStandardFile,
  mapElevenOrdersToPreviewRows,
} from '@/app/lib/eleven/map-eleven-orders';
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
        error: '11번가 API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.',
      },
      { status: 400 },
    );
  }

  const account = await getElevenAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 11번가 연동 정보가 없습니다. 먼저 저장해 주세요.' },
      { status: 404 },
    );
  }

  try {
    const credentials = toElevenCredentials(account);
    const orders = await fetchElevenOrders({ credentials, days });
    const orderStandardFile = mapElevenOrdersToOrderStandardFile(orders);
    const previewRows = mapElevenOrdersToPreviewRows(orders);

    await markElevenAccountSyncResult({ accountId: account.id, success: true });

    const snapshotPersist = await maybePersistOrderFetchResult({
      client: prisma,
      enabled: isOrderSyncSnapshotPersistEnabled(),
      userId: auth.userId,
      provider: OrderIntegrationProvider.ELEVEN,
      integrationAccountId: account.id,
      orderStandardFile,
      rawOrders: undefined,
      fetchedAt: new Date(),
    });

    const transport = getIntegrationTransportInfo();

    return NextResponse.json({
      success: true,
      message: `11번가 주문 ${previewRows.length}건을 불러왔습니다.`,
      count: previewRows.length,
      previewHeaders: ELEVEN_PREVIEW_HEADERS,
      previewRows,
      orderStandardFile,
      snapshotPersist,
      debug: {
        transport,
        rawOrderCount: orders.length,
      },
    });
  } catch (error) {
    const message = toUserFacingElevenErrorMessage(error);
    console.error('[Eleven Integration Fetch] failed:', error instanceof Error ? error.message : error);
    await markElevenAccountSyncResult({
      accountId: account.id,
      success: false,
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
