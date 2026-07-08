import { NextResponse } from 'next/server';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import {
  decryptShopifyAccountCredentials,
  getShopifyAccountForUser,
  markShopifyAccountTestResult,
} from '@/app/lib/order-integration/shopify-account';
import { toUserFacingShopifyErrorMessage } from '@/app/lib/shopify/client';
import {
  isShopifyIntegrationEnabled,
  shopifyIntegrationDisabledJsonResponse,
} from '@/app/lib/shopify/oauth-credentials';
import { testShopifyConnection } from '@/app/lib/shopify/orders';

export async function POST() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  if (!isShopifyIntegrationEnabled()) {
    return shopifyIntegrationDisabledJsonResponse();
  }

  const account = await getShopifyAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 Shopify 연동 정보가 없습니다. 먼저 OAuth 연동을 완료해 주세요.' },
      { status: 404 },
    );
  }

  try {
    const credentials = decryptShopifyAccountCredentials(account);
    if (!credentials.accessToken) {
      return NextResponse.json(
        { error: 'Shopify access token이 없습니다. OAuth 연동을 먼저 완료해 주세요.' },
        { status: 400 },
      );
    }

    const result = await testShopifyConnection({
      shopDomain: credentials.shopDomain,
      accessToken: credentials.accessToken,
    });

    await markShopifyAccountTestResult({ accountId: account.id, success: true });

    return NextResponse.json({
      success: true,
      message: 'Shopify API 연결이 정상 확인되었습니다.',
      shopName: result.shopName,
      myshopifyDomain: result.myshopifyDomain,
    });
  } catch (error) {
    const message = toUserFacingShopifyErrorMessage(error);
    console.error('[Shopify Integration Test] failed:', error instanceof Error ? error.message : error);
    await markShopifyAccountTestResult({
      accountId: account.id,
      success: false,
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
