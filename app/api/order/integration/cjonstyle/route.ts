import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  deleteCjonstyleAccount,
  getCjonstyleAccountForUser,
  toCjonstyleAccountPublic,
} from '@/app/lib/order-integration/cjonstyle-account';

export async function GET() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const account = await getCjonstyleAccountForUser(auth.userId);
  return NextResponse.json({
    account: account ? toCjonstyleAccountPublic(account) : null,
  });
}

export async function DELETE() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const deleted = await deleteCjonstyleAccount(auth.userId);
  if (!deleted) {
    return NextResponse.json({ error: '저장된 CJ온스타일 연동 정보가 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: 'CJ온스타일 연동이 해제되었습니다.' });
}
