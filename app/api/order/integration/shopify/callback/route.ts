import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { EXCLOAD_INTEGRATION_INFO } from '@/app/lib/order-integration/malls';
import {
  getShopifyAccountById,
  saveShopifyOAuthTokens,
} from '@/app/lib/order-integration/shopify-account';
import { verifyShopifyOAuthHmac } from '@/app/lib/shopify/oauth';
import {
  isShopifyIntegrationEnabled,
  resolveShopifyClientId,
  resolveShopifyClientSecret,
} from '@/app/lib/shopify/oauth-credentials';
import { verifyShopifyOAuthState } from '@/app/lib/shopify/oauth-state';
import {
  normalizeShopifyShopDomain,
  ShopifyShopDomainError,
} from '@/app/lib/shopify/shop-domain';
import {
  exchangeShopifyAuthorizationCode,
  sanitizeShopifyGrantedScope,
} from '@/app/lib/shopify/token-exchange';

/** Shopify UI 페이지는 아직 없으므로 주문연동 목록으로 안내 */
const UI_PATH = '/order/integration';

function redirectToUi(query: Record<string, string>): NextResponse {
  const params = new URLSearchParams({ shopify_oauth: '1', ...query });
  return NextResponse.redirect(new URL(`${UI_PATH}?${params.toString()}`, EXCLOAD_INTEGRATION_INFO.url));
}

function searchParamsToRecord(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    out[key] = value;
  }
  return out;
}

export async function GET(request: NextRequest) {
  // Feature flag — hmac / client_secret / token exchange / save 전 차단
  if (!isShopifyIntegrationEnabled()) {
    return redirectToUi({ status: 'disabled' });
  }

  const url = new URL(request.url);
  const oauthError = url.searchParams.get('error');
  const oauthErrorDescription = url.searchParams.get('error_description');

  if (oauthError) {
    return redirectToUi({
      status: 'error',
      message: oauthErrorDescription ?? oauthError,
    });
  }

  const code = url.searchParams.get('code')?.trim();
  const state = url.searchParams.get('state')?.trim();
  const shopRaw = url.searchParams.get('shop')?.trim();

  if (!code || !state || !shopRaw) {
    return redirectToUi({
      status: 'error',
      message: 'OAuth 응답에 code, state 또는 shop이 없습니다.',
    });
  }

  let shopDomain: string;
  try {
    shopDomain = normalizeShopifyShopDomain(shopRaw);
  } catch (error) {
    const message =
      error instanceof ShopifyShopDomainError
        ? error.message
        : 'Shop URL 형식이 올바르지 않습니다.';
    return redirectToUi({ status: 'error', message });
  }

  const statePayload = verifyShopifyOAuthState(state);
  if (!statePayload) {
    return redirectToUi({
      status: 'error',
      message: 'OAuth state 검증에 실패했습니다. 다시 시도해 주세요.',
    });
  }

  if (statePayload.shopDomain !== shopDomain) {
    return redirectToUi({
      status: 'error',
      message: 'OAuth state의 shop과 callback shop이 일치하지 않습니다.',
    });
  }

  let clientSecret: string;
  try {
    clientSecret = resolveShopifyClientSecret();
  } catch (error) {
    console.error(
      '[Shopify Integration Callback] config error:',
      error instanceof Error ? error.message : error,
    );
    return redirectToUi({
      status: 'error',
      message: 'Shopify OAuth가 설정되지 않았습니다.',
    });
  }

  const queryParams = searchParamsToRecord(url.searchParams);
  if (!verifyShopifyOAuthHmac(queryParams, clientSecret)) {
    return redirectToUi({
      status: 'error',
      message: 'OAuth HMAC 검증에 실패했습니다.',
    });
  }

  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim();
  if (!email || (session?.user?.isAdmin !== true && !isAdminEmail(email))) {
    return redirectToUi({ status: 'error', message: '관리자 로그인이 필요합니다.' });
  }

  try {
    const account = await getShopifyAccountById({
      userId: statePayload.userId,
      accountId: statePayload.accountId,
    });

    if (!account || account.vendorId !== shopDomain) {
      return redirectToUi({ status: 'error', message: '연동 계정을 찾을 수 없습니다.' });
    }

    const tokens = await exchangeShopifyAuthorizationCode({
      shopDomain,
      clientId: resolveShopifyClientId(),
      clientSecret,
      code,
    });

    const scope = sanitizeShopifyGrantedScope(tokens.scope);

    await saveShopifyOAuthTokens({
      accountId: account.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      scope,
      tokenExpiresAt: tokens.tokenExpiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
    });

    return redirectToUi({ status: 'success', shop: shopDomain });
  } catch (error) {
    // access_token / client_secret은 메시지에 포함하지 않음
    console.error(
      '[Shopify Integration Callback] error:',
      error instanceof Error ? error.message : 'unknown',
    );
    return redirectToUi({
      status: 'error',
      message: error instanceof Error ? error.message : 'Shopify OAuth 토큰 교환에 실패했습니다.',
    });
  }
}
