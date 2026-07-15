import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  getGodomallAccountForUser,
  markGodomallAccountTestResult,
  toGodomallCredentials,
} from '@/app/lib/order-integration/godomall-account';
import { testGodomallConnection, toUserFacingGodomallErrorMessage } from '@/app/lib/godomall/client';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { isGodomallPartnerKeyConfigured } from '@/app/lib/godomall/partner-key';

export async function POST() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

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
    await testGodomallConnection(credentials);
    await markGodomallAccountTestResult({ accountId: account.id, success: true });

    return NextResponse.json({
      success: true,
      message: '고도몰 Open API(Order_Search) 연결이 정상 확인되었습니다.',
    });
  } catch (error) {
    const message = toUserFacingGodomallErrorMessage(error);
    console.error('[Godomall Integration Test] failed:', error instanceof Error ? error.message : error);
    await markGodomallAccountTestResult({
      accountId: account.id,
      success: false,
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
