import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  getLotteonAccountForUser,
  markLotteonAccountTestResult,
  toLotteonCredentials,
} from '@/app/lib/order-integration/lotteon-account';
import { testLotteonConnection, toUserFacingLotteonErrorMessage } from '@/app/lib/lotteon/client';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
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
        error: '롯데ON API 연결을 위한 서버 설정이 필요합니다. 관리자에게 문의해 주세요.',
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
            ? '저장된 롯데ON 연동 정보가 없습니다. 먼저 저장해 주세요.'
            : '비활성화된 롯데ON 연동 계정입니다. 계정을 활성화한 후 다시 시도해 주세요.',
      },
      { status: operation.reason === 'NOT_FOUND' ? 404 : 409 },
    );
  }

  try {
    const credentials = toLotteonCredentials(account);
    await testLotteonConnection(credentials);
    await markLotteonAccountTestResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: { success: true },
    });

    return NextResponse.json({
      success: true,
      message: '롯데ON API 연결이 정상 확인되었습니다.',
    });
  } catch (error) {
    const message = sanitizePublicIntegrationErrorMessage(toUserFacingLotteonErrorMessage(error));
    console.error('[Lotteon Integration Test] failed');
    await markLotteonAccountTestResult({
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
