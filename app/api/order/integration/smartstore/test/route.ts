import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  getSmartstoreAccountForUser,
  markSmartstoreAccountTestResult,
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

export async function POST() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  if (!isIntegrationProxyConfigured()) {
    return NextResponse.json(
      { error: '스마트스토어 연결 설정을 확인해 주세요.' },
      { status: 400 },
    );
  }

  const account = await getSmartstoreAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 스마트스토어 연동 정보가 없습니다. 먼저 저장해 주세요.' },
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
