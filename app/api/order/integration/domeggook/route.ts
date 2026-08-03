import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  deleteDomeggookAccount,
  getDomeggookAccountForUser,
  toDomeggookAccountPublic,
} from '@/app/lib/order-integration/domeggook-account';

export async function GET() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const account = await getDomeggookAccountForUser(auth.userId);
  return NextResponse.json({
    account: account ? toDomeggookAccountPublic(account) : null,
  });
}

export async function DELETE() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const deleted = await deleteDomeggookAccount(auth.userId);
  if (!deleted) {
    return NextResponse.json({ error: '저장된 도매꾹 연동 정보가 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: '도매꾹 연동이 해제되었습니다.' });
}
