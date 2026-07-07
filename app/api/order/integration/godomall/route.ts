import { NextResponse } from 'next/server';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import {
  deleteGodomallAccount,
  getGodomallAccountForUser,
  toGodomallAccountPublic,
} from '@/app/lib/order-integration/godomall-account';

export async function GET() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  const account = await getGodomallAccountForUser(auth.userId);
  return NextResponse.json({
    account: account ? toGodomallAccountPublic(account) : null,
  });
}

export async function DELETE() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  const deleted = await deleteGodomallAccount(auth.userId);
  if (!deleted) {
    return NextResponse.json({ error: '저장된 고도몰 연동 정보가 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: '고도몰 연동이 해제되었습니다.' });
}
