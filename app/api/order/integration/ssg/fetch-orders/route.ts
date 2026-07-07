import { NextResponse } from 'next/server';
import { getIntegrationTransportInfo, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import {
  getSsgAccountForUser,
  markSsgAccountSyncResult,
  toSsgCredentials,
} from '@/app/lib/order-integration/ssg-account';
import { fetchSsgOrders, toUserFacingSsgErrorMessage } from '@/app/lib/ssg/client';
import {
  mapSsgOrdersToOrderStandardFile,
  mapSsgOrdersToPreviewRows,
  SSG_PREVIEW_HEADERS,
} from '@/app/lib/ssg/map-ssg-orders';

export async function POST() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  if (!isIntegrationProxyConfigured()) {
    return NextResponse.json(
      {
        error: 'SSG API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.',
      },
      { status: 400 },
    );
  }

  const account = await getSsgAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 SSG 연동 정보가 없습니다. 먼저 저장해 주세요.' },
      { status: 404 },
    );
  }

  try {
    const credentials = toSsgCredentials(account);
    const orders = await fetchSsgOrders({ credentials, days: 7 });
    const orderStandardFile = mapSsgOrdersToOrderStandardFile(orders);
    const previewRows = mapSsgOrdersToPreviewRows(orders);

    await markSsgAccountSyncResult({ accountId: account.id, success: true });

    const transport = getIntegrationTransportInfo();

    return NextResponse.json({
      success: true,
      message: `SSG 주문 ${previewRows.length}건을 불러왔습니다.`,
      count: previewRows.length,
      previewHeaders: SSG_PREVIEW_HEADERS,
      previewRows,
      orderStandardFile,
      debug: {
        transport,
        rawOrderCount: orders.length,
      },
    });
  } catch (error) {
    const message = toUserFacingSsgErrorMessage(error);
    console.error('[SSG Integration Fetch] failed:', error instanceof Error ? error.message : error);
    await markSsgAccountSyncResult({
      accountId: account.id,
      success: false,
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
