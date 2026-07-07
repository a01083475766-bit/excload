import { NextResponse } from 'next/server';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import {
  deleteCoupangAccount,
  getCoupangAccountForUser,
  toCoupangAccountPublic,
} from '@/app/lib/order-integration/coupang-account';

export async function GET() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  const account = await getCoupangAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json({ success: true, account: null });
  }

  return NextResponse.json({
    success: true,
    account: toCoupangAccountPublic(account),
  });
}

export async function DELETE() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  const deleted = await deleteCoupangAccount(auth.userId);
  if (!deleted) {
    return NextResponse.json({ error: '저장된 쿠팡 연동 정보가 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    message: '쿠팡 연동이 해제되었습니다.',
  });
}
