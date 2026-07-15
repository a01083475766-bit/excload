import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  deleteCafe24Account,
  getCafe24AccountForUser,
  toCafe24AccountPublic,
} from '@/app/lib/order-integration/cafe24-account';

export async function GET() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const account = await getCafe24AccountForUser(auth.userId);
  return NextResponse.json({
    account: account ? toCafe24AccountPublic(account) : null,
  });
}

export async function DELETE() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const deleted = await deleteCafe24Account(auth.userId);
  if (!deleted) {
    return NextResponse.json({ error: '저장된 카페24 연동 정보가 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: '카페24 연동이 해제되었습니다.' });
}
