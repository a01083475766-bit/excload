import { NextRequest, NextResponse } from 'next/server';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import { upsertShopifyAccount } from '@/app/lib/order-integration/shopify-account';
import { buildShopifyAuthorizeUrl } from '@/app/lib/shopify/oauth';
import {
  isShopifyOAuthConfigured,
  resolveShopifyClientId,
  resolveShopifyOAuthRedirectUri,
} from '@/app/lib/shopify/oauth-credentials';
import { createShopifyOAuthState } from '@/app/lib/shopify/oauth-state';
import {
  normalizeShopifyShopDomain,
  ShopifyShopDomainError,
  SHOPIFY_OAUTH_SCOPES,
} from '@/app/lib/shopify/shop-domain';

async function resolveShopFromRequest(request: NextRequest): Promise<string> {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('shop')?.trim();
  if (fromQuery) return fromQuery;

  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = (await request.json()) as { shop?: string; shopDomain?: string };
      return (body.shop ?? body.shopDomain ?? '').trim();
    }
    const form = await request.formData();
    return String(form.get('shop') ?? form.get('shopDomain') ?? '').trim();
  }

  return '';
}

async function handleConnect(request: NextRequest): Promise<NextResponse> {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  if (!isShopifyOAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          'Shopify OAuth가 설정되지 않았습니다. SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET을 등록해 주세요.',
      },
      { status: 500 },
    );
  }

  try {
    const rawShop = await resolveShopFromRequest(request);
    if (!rawShop) {
      return NextResponse.json({ error: 'shop 파라미터가 필요합니다.' }, { status: 400 });
    }

    const shopDomain = normalizeShopifyShopDomain(rawShop);
    const account = await upsertShopifyAccount({
      userId: auth.userId,
      shopDomain,
      accountName: shopDomain,
    });

    const state = createShopifyOAuthState({
      userId: auth.userId,
      accountId: account.id,
      shopDomain,
    });

    // client_secret은 authorize URL에 포함하지 않음
    const authorizeUrl = buildShopifyAuthorizeUrl({
      shopDomain,
      clientId: resolveShopifyClientId(),
      redirectUri: resolveShopifyOAuthRedirectUri(),
      state,
      scopes: SHOPIFY_OAUTH_SCOPES,
    });

    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shopify OAuth 연결을 시작할 수 없습니다.';
    console.error('[Shopify Integration Connect] error:', message);

    if (error instanceof ShopifyShopDomainError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  return handleConnect(request);
}

export async function POST(request: NextRequest) {
  return handleConnect(request);
}
