import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  getShopbyAccountForUser,
  markShopbyAccountTestResult,
  toShopbyCredentials,
} from '@/app/lib/order-integration/shopby-account';
import { testShopbyConnection, toUserFacingShopbyErrorMessage } from '@/app/lib/shopby/client';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';

export async function POST() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  if (!isIntegrationProxyConfigured()) {
    return NextResponse.json(
      {
        error: '샵바이 API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.',
      },
      { status: 400 },
    );
  }

  const account = await getShopbyAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 샵바이 연동 정보가 없습니다. 먼저 저장해 주세요.' },
      { status: 404 },
    );
  }

  try {
    const credentials = toShopbyCredentials(account);
    await testShopbyConnection(credentials);
    await markShopbyAccountTestResult({ accountId: account.id, success: true });

    return NextResponse.json({
      success: true,
      message: '샵바이 Server API 연결이 정상 확인되었습니다.',
    });
  } catch (error) {
    const message = toUserFacingShopbyErrorMessage(error);
    console.error('[Shopby Integration Test] failed:', error instanceof Error ? error.message : error);
    await markShopbyAccountTestResult({
      accountId: account.id,
      success: false,
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
