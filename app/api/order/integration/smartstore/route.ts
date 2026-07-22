import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  countSmartstoreAccountsForUser,
  deleteSmartstoreAccount,
  extractAccountIdFromRequestBody,
  getOwnedSmartstoreAccount,
  resolveSmartstoreAccountForRequest,
  toSmartstoreAccountPublic,
} from '@/app/lib/order-integration/smartstore-account';
import { prisma } from '@/app/lib/prisma';
import { OrderIntegrationProvider } from '@prisma/client';

export async function GET(request: Request) {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const url = new URL(request.url);
  const accountId = url.searchParams.get('accountId');

  if (accountId?.trim()) {
    const account = await getOwnedSmartstoreAccount({
      userId: auth.userId,
      accountId,
    });
    return NextResponse.json({
      account: account ? toSmartstoreAccountPublic(account) : null,
    });
  }

  const count = await countSmartstoreAccountsForUser(auth.userId);
  if (count > 1) {
    const accounts = await prisma.orderIntegrationAccount.findMany({
      where: {
        userId: auth.userId,
        provider: OrderIntegrationProvider.SMARTSTORE,
      },
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json({
      account: null,
      selectionRequired: true,
      accounts: accounts.map(toSmartstoreAccountPublic),
    });
  }

  const resolved = await resolveSmartstoreAccountForRequest({
    userId: auth.userId,
    accountId: null,
  });
  return NextResponse.json({
    account: resolved.ok ? toSmartstoreAccountPublic(resolved.account) : null,
  });
}

export async function DELETE(request: Request) {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const url = new URL(request.url);
  let accountId = url.searchParams.get('accountId');
  if (!accountId) {
    try {
      const body = await request.json();
      accountId = extractAccountIdFromRequestBody(body);
    } catch {
      accountId = null;
    }
  }

  const deleted = await deleteSmartstoreAccount(auth.userId, accountId);
  if (!deleted) {
    return NextResponse.json(
      {
        error:
          accountId || (await countSmartstoreAccountsForUser(auth.userId)) <= 1
            ? '저장된 스마트스토어 연동 정보가 없습니다.'
            : '계정을 정확히 선택할 수 없어 처리하지 않았습니다.',
      },
      { status: accountId ? 404 : 400 },
    );
  }

  return NextResponse.json({ success: true, message: '스마트스토어 연동이 해제되었습니다.' });
}
