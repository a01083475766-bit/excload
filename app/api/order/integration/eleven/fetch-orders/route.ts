import { NextResponse } from 'next/server';
import { getIntegrationTransportInfo, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
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

export async function POST() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

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
    const orders = await fetchElevenOrders({ credentials, days: 7 });
    const orderStandardFile = mapElevenOrdersToOrderStandardFile(orders);
    const previewRows = mapElevenOrdersToPreviewRows(orders);

    await markElevenAccountSyncResult({ accountId: account.id, success: true });

    const transport = getIntegrationTransportInfo();

    return NextResponse.json({
      success: true,
      message: `11번가 주문 ${previewRows.length}건을 불러왔습니다.`,
      count: previewRows.length,
      previewHeaders: ELEVEN_PREVIEW_HEADERS,
      previewRows,
      orderStandardFile,
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
