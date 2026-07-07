import { NextResponse } from 'next/server';
import { testCoupangConnection } from '@/app/lib/coupang/client';
import { toUserFacingCoupangErrorMessage } from '@/app/lib/coupang/errors';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import {
  getCoupangAccountForUser,
  isCoupangApiKeyExpired,
  markCoupangAccountTestResult,
  toCoupangCredentials,
} from '@/app/lib/order-integration/coupang-account';

export async function POST() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  const account = await getCoupangAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json({ error: '저장된 쿠팡 연동 정보가 없습니다. 먼저 저장해 주세요.' }, { status: 404 });
  }

  if (isCoupangApiKeyExpired(account.expiresAt)) {
    const message = '쿠팡 API 키가 만료되었을 수 있습니다.';
    await markCoupangAccountTestResult({
      accountId: account.id,
      success: false,
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const credentials = toCoupangCredentials(account);
    await testCoupangConnection(credentials);
    await markCoupangAccountTestResult({ accountId: account.id, success: true });

    return NextResponse.json({
      success: true,
      message: '쿠팡 API 연결이 정상 확인되었습니다.',
    });
  } catch (error) {
    const message = toUserFacingCoupangErrorMessage(error);
    console.error('[Coupang Integration Test] failed:', error instanceof Error ? error.message : error);
    await markCoupangAccountTestResult({
      accountId: account.id,
      success: false,
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
