import { NextResponse } from 'next/server';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import {
  deleteLotteonAccount,
  getLotteonAccountForUser,
  toLotteonAccountPublic,
} from '@/app/lib/order-integration/lotteon-account';

export async function GET() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  const account = await getLotteonAccountForUser(auth.userId);
  return NextResponse.json({
    account: account ? toLotteonAccountPublic(account) : null,
  });
}

export async function DELETE() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  const deleted = await deleteLotteonAccount(auth.userId);
  if (!deleted) {
    return NextResponse.json({ error: '저장된 롯데ON 연동 정보가 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: '롯데ON 연동이 해제되었습니다.' });
}
