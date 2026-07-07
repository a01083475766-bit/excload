import { NextResponse } from 'next/server';
import { getIntegrationTransportInfo, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import {
  getGodomallAccountForUser,
  markGodomallAccountSyncResult,
  toGodomallCredentials,
} from '@/app/lib/order-integration/godomall-account';
import { fetchGodomallOrders, toUserFacingGodomallErrorMessage } from '@/app/lib/godomall/client';
import {
  GODOMALL_PREVIEW_HEADERS,
  mapGodomallOrdersToOrderStandardFile,
  mapGodomallOrdersToPreviewRows,
} from '@/app/lib/godomall/map-godomall-orders';
import { isGodomallPartnerKeyConfigured } from '@/app/lib/godomall/partner-key';

export async function POST() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  if (!isIntegrationProxyConfigured()) {
    return NextResponse.json(
      {
        error: '고도몰 API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.',
      },
      { status: 400 },
    );
  }

  const account = await getGodomallAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 고도몰 연동 정보가 없습니다. 먼저 저장해 주세요.' },
      { status: 404 },
    );
  }

  if (!isGodomallPartnerKeyConfigured() && !account.accessKeyCiphertext) {
    return NextResponse.json(
      {
        error:
          'GODOMALL_PARTNER_KEY 환경 변수가 설정되지 않았습니다. Vercel env 등록 또는 개발용 partner_key override를 저장해 주세요.',
      },
      { status: 400 },
    );
  }

  try {
    const credentials = toGodomallCredentials(account);
    const orders = await fetchGodomallOrders({ credentials, days: 7 });
    const orderStandardFile = mapGodomallOrdersToOrderStandardFile(orders);
    const previewRows = mapGodomallOrdersToPreviewRows(orders);

    await markGodomallAccountSyncResult({ accountId: account.id, success: true });

    const transport = getIntegrationTransportInfo();

    return NextResponse.json({
      success: true,
      message: `고도몰 주문 ${previewRows.length}건을 불러왔습니다.`,
      count: previewRows.length,
      previewHeaders: GODOMALL_PREVIEW_HEADERS,
      previewRows,
      orderStandardFile,
      debug: {
        transport,
        rawOrderCount: orders.length,
      },
    });
  } catch (error) {
    const message = toUserFacingGodomallErrorMessage(error);
    console.error('[Godomall Integration Fetch] failed:', error instanceof Error ? error.message : error);
    await markGodomallAccountSyncResult({
      accountId: account.id,
      success: false,
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
