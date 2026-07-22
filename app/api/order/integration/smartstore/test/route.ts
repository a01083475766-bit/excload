import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  extractAccountIdFromRequestBody,
  markSmartstoreAccountTestResult,
  resolveSmartstoreAccountForRequest,
  toSmartstoreCredentials,
} from '@/app/lib/order-integration/smartstore-account';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { invokeIntegrationHttp } from '@/app/lib/integration-proxy/http-transport';
import {
  categorizeSmartstoreOperationError,
  runSmartstoreHealthCheck,
  smartstoreHealthResultToOperationResult,
} from '@/app/lib/order-integration/connection-health/adapters/smartstore';
import { beginConnectionHealthOperation } from '@/app/lib/order-integration/connection-health/concurrency';

export async function POST(request: Request) {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  if (!isIntegrationProxyConfigured()) {
    return NextResponse.json(
      { error: '스마트스토어 연결 설정을 확인해 주세요.' },
      { status: 400 },
    );
  }

  let body: unknown = null;
  try {
    const text = await request.text();
    body = text.trim() ? JSON.parse(text) : null;
  } catch {
    return NextResponse.json({ error: '요청 본문을 해석하지 못했습니다.' }, { status: 400 });
  }

  const resolvedAccount = await resolveSmartstoreAccountForRequest({
    userId: auth.userId,
    accountId: extractAccountIdFromRequestBody(body),
  });
  if (!resolvedAccount.ok) {
    return NextResponse.json(
      { error: resolvedAccount.error },
      { status: resolvedAccount.status },
    );
  }
  const account = resolvedAccount.account;

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
            ? '저장된 스마트스토어 연동 정보가 없습니다. 먼저 저장해 주세요.'
            : '비활성화된 스마트스토어 연동 계정입니다. 계정을 활성화한 후 다시 시도해 주세요.',
      },
      { status: operation.reason === 'NOT_FOUND' ? 404 : 409 },
    );
  }

  try {
    const credentials = toSmartstoreCredentials(account);
    const healthResult = await runSmartstoreHealthCheck({
      credentials,
      http: invokeIntegrationHttp,
    });
    const result = smartstoreHealthResultToOperationResult(healthResult);
    await markSmartstoreAccountTestResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.userMessage }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: '스마트스토어 API 연결이 정상 확인되었습니다.',
      accountId: account.id,
    });
  } catch (error) {
    const result = categorizeSmartstoreOperationError(error);
    console.error('[Smartstore Integration Test] unexpected failure');
    await markSmartstoreAccountTestResult({
      accountId: account.id,
      userId: auth.userId,
      operationSequence: operation.operationSequence,
      result,
    });
    return NextResponse.json({ error: result.userMessage }, { status: 400 });
  }
}
