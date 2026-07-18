import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  getMakeshopAccountForUser,
  markMakeshopAccountTestResult,
  toMakeshopCredentials,
} from '@/app/lib/order-integration/makeshop-account';
import { testMakeshopConnection, toUserFacingMakeshopErrorMessage } from '@/app/lib/makeshop/client';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { isMakeshopOAuthConfigured } from '@/app/lib/makeshop/oauth-credentials';
import { classifyMakeshopError } from '@/app/lib/order-integration/connection-health/adapters/makeshop';
import { connectionOperationFailure } from '@/app/lib/order-integration/connection-health/operation-result';
import { beginConnectionHealthOperation } from '@/app/lib/order-integration/connection-health/concurrency';
import { sanitizePublicIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';

export async function POST() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  if (!isIntegrationProxyConfigured()) {
    return NextResponse.json(
      {
        error: '메이크샵 API 연결을 위한 서버 설정이 필요합니다. 관리자에게 문의해 주세요.',
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
            ? '저장된 메이크샵 연동 정보가 없습니다. 먼저 저장해 주세요.'
            : '비활성화된 메이크샵 연동 계정입니다. 계정을 활성화한 후 다시 시도해 주세요.',
      },
      { status: operation.reason === 'NOT_FOUND' ? 404 : 409 },
    );
  }

  const hasOverride = Boolean(account.accessKeyCiphertext && account.secretKeyCiphertext);
  if (!isMakeshopOAuthConfigured() && !hasOverride) {
    const message = '메이크샵 API 연결을 위한 서버 인증 설정이 필요합니다. 관리자에게 문의해 주세요.';
    await markMakeshopAccountTestResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: {
        success: false,
        category: 'ACCOUNT_CONFIG_ERROR',
        userMessage: message,
      },
    });
    return NextResponse.json(
      { error: message },
      { status: 400 },
    );
  }

  try {
    const credentials = toMakeshopCredentials(account);
    await testMakeshopConnection(credentials);
    await markMakeshopAccountTestResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: { success: true },
    });

    return NextResponse.json({
      success: true,
      message: '메이크샵 APP API(주문 2.0) 연결이 정상 확인되었습니다.',
    });
  } catch (error) {
    const message = sanitizePublicIntegrationErrorMessage(toUserFacingMakeshopErrorMessage(error));
    console.error('[Makeshop Integration Test] failed');
    await markMakeshopAccountTestResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: connectionOperationFailure({
        error,
        category: classifyMakeshopError(error),
        userMessage: message,
      }),
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
