import { OrderIntegrationProvider } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getIntegrationTransportInfo, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { prisma } from '@/app/lib/prisma';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  getMakeshopAccountForUser,
  markMakeshopAccountSyncResult,
  toMakeshopCredentials,
} from '@/app/lib/order-integration/makeshop-account';
import { fetchMakeshopOrders, toUserFacingMakeshopErrorMessage } from '@/app/lib/makeshop/client';
import {
  MAKESHOP_PREVIEW_HEADERS,
  mapMakeshopOrdersToOrderStandardFile,
  mapMakeshopOrdersToPreviewRows,
} from '@/app/lib/makeshop/map-makeshop-orders';
import { isMakeshopOAuthConfigured } from '@/app/lib/makeshop/oauth-credentials';
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
        error: '메이크샵 API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.',
      },
      { status: 400 },
    );
  }

  const account = await getMakeshopAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 메이크샵 연동 정보가 없습니다. 먼저 저장해 주세요.' },
      { status: 404 },
    );
  }

  const hasOverride = Boolean(account.accessKeyCiphertext && account.secretKeyCiphertext);
  if (!isMakeshopOAuthConfigured() && !hasOverride) {
    return NextResponse.json(
      {
        error:
          'MAKESHOP_CLIENT_ID/MAKESHOP_CLIENT_SECRET 환경 변수가 설정되지 않았습니다. Vercel env 등록 또는 개발용 OAuth override를 저장해 주세요.',
      },
      { status: 400 },
    );
  }

  try {
    const credentials = toMakeshopCredentials(account);
    const orders = await fetchMakeshopOrders({ credentials, days });
    const orderStandardFile = mapMakeshopOrdersToOrderStandardFile(orders);
    const previewRows = mapMakeshopOrdersToPreviewRows(orders);

    await markMakeshopAccountSyncResult({ accountId: account.id, success: true });

    const snapshotPersist = await maybePersistOrderFetchResult({
      client: prisma,
      enabled: isOrderSyncSnapshotPersistEnabled(),
      userId: auth.userId,
      provider: OrderIntegrationProvider.MAKESHOP,
      integrationAccountId: account.id,
      orderStandardFile,
      rawOrders: undefined,
      fetchedAt: new Date(),
    });

    const transport = getIntegrationTransportInfo();

    return NextResponse.json({
      success: true,
      message: `메이크샵 주문 ${previewRows.length}건을 불러왔습니다.`,
      count: previewRows.length,
      previewHeaders: MAKESHOP_PREVIEW_HEADERS,
      previewRows,
      orderStandardFile,
      snapshotPersist,
      debug: {
        transport,
        rawOrderCount: orders.length,
      },
    });
  } catch (error) {
    const message = toUserFacingMakeshopErrorMessage(error);
    console.error('[Makeshop Integration Fetch] failed:', error instanceof Error ? error.message : error);
    await markMakeshopAccountSyncResult({
      accountId: account.id,
      success: false,
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
