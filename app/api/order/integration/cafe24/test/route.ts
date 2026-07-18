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
import { classifyCafe24Error } from '@/app/lib/order-integration/connection-health/adapters/cafe24';
import { connectionOperationFailure } from '@/app/lib/order-integration/connection-health/operation-result';
import { beginConnectionHealthOperation } from '@/app/lib/order-integration/connection-health/concurrency';
import { sanitizePublicIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';

export async function POST() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  if (!isIntegrationProxyConfigured()) {
    return NextResponse.json(
      {
        error: '카페24 API 연결을 위한 서버 설정이 필요합니다. 관리자에게 문의해 주세요.',
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
            ? '저장된 카페24 연동 정보가 없습니다. 먼저 저장해 주세요.'
            : '비활성화된 카페24 연동 계정입니다. 계정을 활성화한 후 다시 시도해 주세요.',
      },
      { status: operation.reason === 'NOT_FOUND' ? 404 : 409 },
    );
  }

  try {
    const { accessToken } = await ensureCafe24AccessToken(account);
    const credentials = toCafe24Credentials(account);
    const result = await testCafe24Connection({ credentials, accessToken });
    await markCafe24AccountTestResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: { success: true },
    });

    return NextResponse.json({
      success: true,
      message: '카페24 API 연결이 정상 확인되었습니다.',
      scopes: result.scopes,
    });
  } catch (error) {
    const message = sanitizePublicIntegrationErrorMessage(toUserFacingCafe24ErrorMessage(error));
    console.error('[Cafe24 Integration Test] failed');
    await markCafe24AccountTestResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result: connectionOperationFailure({
        error,
        category: classifyCafe24Error(error),
        userMessage: message,
      }),
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
