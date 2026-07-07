import { NextResponse } from 'next/server';
import { getIntegrationTransportInfo, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import {
  getLotteonAccountForUser,
  markLotteonAccountSyncResult,
  toLotteonCredentials,
} from '@/app/lib/order-integration/lotteon-account';
import { fetchLotteonOrders, toUserFacingLotteonErrorMessage } from '@/app/lib/lotteon/client';
import {
  LOTTEON_PREVIEW_HEADERS,
  mapLotteonOrdersToOrderStandardFile,
  mapLotteonOrdersToPreviewRows,
} from '@/app/lib/lotteon/map-lotteon-orders';

export async function POST() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  if (!isIntegrationProxyConfigured()) {
    return NextResponse.json(
      {
        error: '롯데ON API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.',
      },
      { status: 400 },
    );
  }

  const account = await getLotteonAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 롯데ON 연동 정보가 없습니다. 먼저 저장해 주세요.' },
      { status: 404 },
    );
  }

  try {
    const credentials = toLotteonCredentials(account);
    const orders = await fetchLotteonOrders({ credentials, days: 7 });
    const orderStandardFile = mapLotteonOrdersToOrderStandardFile(orders);
    const previewRows = mapLotteonOrdersToPreviewRows(orders);

    await markLotteonAccountSyncResult({ accountId: account.id, success: true });

    const transport = getIntegrationTransportInfo();

    return NextResponse.json({
      success: true,
      message: `롯데ON 주문 ${previewRows.length}건을 불러왔습니다.`,
      count: previewRows.length,
      previewHeaders: LOTTEON_PREVIEW_HEADERS,
      previewRows,
      orderStandardFile,
      debug: {
        transport,
        rawOrderCount: orders.length,
      },
    });
  } catch (error) {
    const message = toUserFacingLotteonErrorMessage(error);
    console.error('[Lotteon Integration Fetch] failed:', error instanceof Error ? error.message : error);
    await markLotteonAccountSyncResult({
      accountId: account.id,
      success: false,
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
