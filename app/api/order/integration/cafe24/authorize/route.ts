import { NextResponse } from 'next/server';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import { buildCafe24AuthorizeUrl } from '@/app/lib/cafe24/client';
import { createCafe24OAuthState } from '@/app/lib/cafe24/oauth-state';
import { decryptClientId, getCafe24AccountForUser } from '@/app/lib/order-integration/cafe24-account';

export async function GET() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  const account = await getCafe24AccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 카페24 연동 정보가 없습니다. 먼저 계정 정보를 저장해 주세요.' },
      { status: 404 },
    );
  }

  try {
    const clientId = decryptClientId(account);
    const state = createCafe24OAuthState({
      userId: auth.userId,
      accountId: account.id,
      mallId: account.vendorId ?? '',
    });

    const authorizeUrl = buildCafe24AuthorizeUrl({
      mallId: account.vendorId ?? '',
      clientId,
      state,
    });

    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    console.error('[Cafe24 Integration Authorize] error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '카페24 OAuth 시작에 실패했습니다.' },
      { status: 400 },
    );
  }
}
