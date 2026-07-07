import { NextResponse } from 'next/server';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import {
  deleteSmartstoreAccount,
  getSmartstoreAccountForUser,
  toSmartstoreAccountPublic,
} from '@/app/lib/order-integration/smartstore-account';

export async function GET() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  const account = await getSmartstoreAccountForUser(auth.userId);
  return NextResponse.json({
    account: account ? toSmartstoreAccountPublic(account) : null,
  });
}

export async function DELETE() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  const deleted = await deleteSmartstoreAccount(auth.userId);
  if (!deleted) {
    return NextResponse.json({ error: '저장된 스마트스토어 연동 정보가 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: '스마트스토어 연동이 해제되었습니다.' });
}
