import { NextResponse } from 'next/server';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import {
  deleteElevenAccount,
  getElevenAccountForUser,
  toElevenAccountPublic,
} from '@/app/lib/order-integration/eleven-account';

export async function GET() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  const account = await getElevenAccountForUser(auth.userId);
  return NextResponse.json({
    account: account ? toElevenAccountPublic(account) : null,
  });
}

export async function DELETE() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  const deleted = await deleteElevenAccount(auth.userId);
  if (!deleted) {
    return NextResponse.json({ error: '저장된 11번가 연동 정보가 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: '11번가 연동이 해제되었습니다.' });
}
