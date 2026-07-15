import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { exchangeCafe24AuthorizationCode } from '@/app/lib/cafe24/client';
import { verifyCafe24OAuthState } from '@/app/lib/cafe24/oauth-state';
import {
  getCafe24AccountById,
  saveCafe24OAuthTokens,
  toCafe24Credentials,
} from '@/app/lib/order-integration/cafe24-account';

import { EXCLOAD_INTEGRATION_INFO } from '@/app/lib/order-integration/malls';

const UI_PATH = '/order/integration/cafe24';

function redirectToUi(query: Record<string, string>): NextResponse {
  const params = new URLSearchParams(query);
  return NextResponse.redirect(new URL(`${UI_PATH}?${params.toString()}`, EXCLOAD_INTEGRATION_INFO.url));
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const oauthError = url.searchParams.get('error');
  const oauthErrorDescription = url.searchParams.get('error_description');

  if (oauthError) {
    return redirectToUi({
      oauth: 'error',
      message: oauthErrorDescription ?? oauthError,
    });
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return redirectToUi({ oauth: 'error', message: 'OAuth 응답에 code 또는 state가 없습니다.' });
  }

  const statePayload = verifyCafe24OAuthState(state);
  if (!statePayload) {
    return redirectToUi({ oauth: 'error', message: 'OAuth state 검증에 실패했습니다. 다시 시도해 주세요.' });
  }

  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim();
  if (!email || (session.user.isAdmin !== true && !isAdminEmail(email))) {
    return redirectToUi({ oauth: 'error', message: '관리자 로그인이 필요합니다.' });
  }

  try {
    const account = await getCafe24AccountById({
      userId: statePayload.userId,
      accountId: statePayload.accountId,
    });

    if (!account || account.vendorId !== statePayload.mallId) {
      return redirectToUi({ oauth: 'error', message: '연동 계정을 찾을 수 없습니다.' });
    }

    const credentials = toCafe24Credentials(account);
    const tokens = await exchangeCafe24AuthorizationCode({ credentials, code });
    await saveCafe24OAuthTokens({ accountId: account.id, tokens });

    return redirectToUi({ oauth: 'success' });
  } catch (error) {
    console.error('[Cafe24 Integration Callback] error:', error instanceof Error ? error.message : error);
    return redirectToUi({
      oauth: 'error',
      message: error instanceof Error ? error.message : '카페24 OAuth 토큰 교환에 실패했습니다.',
    });
  }
}
