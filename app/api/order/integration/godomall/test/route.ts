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
import { classifyMallErrorMessage } from '@/app/lib/order-integration/connection-health/adapters/probe-health';
import { connectionOperationFailure } from '@/app/lib/order-integration/connection-health/operation-result';
import { beginConnectionHealthOperation } from '@/app/lib/order-integration/connection-health/concurrency';
import { sanitizePublicIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';

export async function POST() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  if (!isIntegrationProxyConfigured()) {
    return NextResponse.json(
      {
        error: '고도몰 API 연결을 위한 서버 설정이 필요합니다. 관리자에게 문의해 주세요.',
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

  const operation = await beginConnectionHealthOperation({
    accountId: account.id,
    userId: auth.userId,
    source: 'connection_test',
  });
  if (!operation.started) {
    return NextResponse.json(
      {
        error:
          operation.reason === 'NOT_FOUND'
            ? '저장된 고도몰 연동 정보가 없습니다. 먼저 저장해 주세요.'
            : '비활성화된 고도몰 연동 계정입니다. 계정을 활성화한 후 다시 시도해 주세요.',
      },
      { status: operation.reason === 'NOT_FOUND' ? 404 : 409 },
    );
  }

  if (!isGodomallPartnerKeyConfigured() && !account.accessKeyCiphertext) {
    const message = '고도몰 API 연결을 위한 서버 인증 설정이 필요합니다. 관리자에게 문의해 주세요.';
    await markGodomallAccountTestResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: { success: false, category: 'ACCOUNT_CONFIG_ERROR', userMessage: message },
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const credentials = toGodomallCredentials(account);
    await testGodomallConnection(credentials);
    await markGodomallAccountTestResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: { success: true },
    });

    return NextResponse.json({
      success: true,
      message: '고도몰 Open API(Order_Search) 연결이 정상 확인되었습니다.',
    });
  } catch (error) {
    const message = sanitizePublicIntegrationErrorMessage(toUserFacingGodomallErrorMessage(error));
    console.error('[Godomall Integration Test] failed');
    await markGodomallAccountTestResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: connectionOperationFailure({
        error,
        category: classifyMallErrorMessage(error),
        userMessage: message,
      }),
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
