import { NextResponse } from 'next/server';
import { getIntegrationTransportInfo, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
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

export async function POST() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

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
    const orders = await fetchMakeshopOrders({ credentials, days: 7 });
    const orderStandardFile = mapMakeshopOrdersToOrderStandardFile(orders);
    const previewRows = mapMakeshopOrdersToPreviewRows(orders);

    await markMakeshopAccountSyncResult({ accountId: account.id, success: true });

    const transport = getIntegrationTransportInfo();

    return NextResponse.json({
      success: true,
      message: `메이크샵 주문 ${previewRows.length}건을 불러왔습니다.`,
      count: previewRows.length,
      previewHeaders: MAKESHOP_PREVIEW_HEADERS,
      previewRows,
      orderStandardFile,
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
