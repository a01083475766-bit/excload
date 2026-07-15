import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  deleteSsgAccount,
  getSsgAccountForUser,
  toSsgAccountPublic,
} from '@/app/lib/order-integration/ssg-account';

export async function GET() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const account = await getSsgAccountForUser(auth.userId);
  return NextResponse.json({
    account: account ? toSsgAccountPublic(account) : null,
  });
}

export async function DELETE() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const deleted = await deleteSsgAccount(auth.userId);
  if (!deleted) {
    return NextResponse.json({ error: '저장된 SSG 연동 정보가 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: 'SSG 연동이 해제되었습니다.' });
}
