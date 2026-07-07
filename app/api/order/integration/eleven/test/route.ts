import { NextResponse } from 'next/server';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import {
  getElevenAccountForUser,
  markElevenAccountTestResult,
  toElevenCredentials,
} from '@/app/lib/order-integration/eleven-account';
import { testElevenConnection, toUserFacingElevenErrorMessage } from '@/app/lib/eleven/client';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';

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
    await testElevenConnection(credentials);
    await markElevenAccountTestResult({ accountId: account.id, success: true });

    return NextResponse.json({
      success: true,
      message: '11번가 API 연결이 정상 확인되었습니다.',
    });
  } catch (error) {
    const message = toUserFacingElevenErrorMessage(error);
    console.error('[Eleven Integration Test] failed:', error instanceof Error ? error.message : error);
    await markElevenAccountTestResult({
      accountId: account.id,
      success: false,
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
