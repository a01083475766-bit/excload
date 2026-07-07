import { NextResponse } from 'next/server';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import {
  deleteShopbyAccount,
  getShopbyAccountForUser,
  toShopbyAccountPublic,
} from '@/app/lib/order-integration/shopby-account';

export async function GET() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  const account = await getShopbyAccountForUser(auth.userId);
  return NextResponse.json({
    account: account ? toShopbyAccountPublic(account) : null,
  });
}

export async function DELETE() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  const deleted = await deleteShopbyAccount(auth.userId);
  if (!deleted) {
    return NextResponse.json({ error: '저장된 샵바이 연동 정보가 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: '샵바이 연동이 해제되었습니다.' });
}
