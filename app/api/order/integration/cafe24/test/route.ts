import { NextResponse } from 'next/server';
import { getIntegrationTransportInfo, isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  ensureCafe24AccessToken,
  getCafe24AccountForUser,
  markCafe24AccountTestResult,
  toCafe24Credentials,
} from '@/app/lib/order-integration/cafe24-account';
import { testCafe24Connection, toUserFacingCafe24ErrorMessage } from '@/app/lib/cafe24/client';

export async function POST() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  if (!isIntegrationProxyConfigured()) {
    return NextResponse.json(
      {
        error: '카페24 API는 고정 IP 프록시(INTEGRATION_PROXY_BASE_URL) 설정이 필요합니다.',
      },
      { status: 400 },
    );
  }

  const account = await getCafe24AccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 카페24 연동 정보가 없습니다. 먼저 저장해 주세요.' },
      { status: 404 },
    );
  }

  try {
    const { accessToken } = await ensureCafe24AccessToken(account);
    const credentials = toCafe24Credentials(account);
    const result = await testCafe24Connection({ credentials, accessToken });
    await markCafe24AccountTestResult({ accountId: account.id, success: true });

    return NextResponse.json({
      success: true,
      message: '카페24 API 연결이 정상 확인되었습니다.',
      scopes: result.scopes,
    });
  } catch (error) {
    const message = toUserFacingCafe24ErrorMessage(error);
    console.error('[Cafe24 Integration Test] failed:', error instanceof Error ? error.message : error);
    await markCafe24AccountTestResult({
      accountId: account.id,
      success: false,
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
