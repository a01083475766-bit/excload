import { NextRequest, NextResponse } from 'next/server';
import { sanitizePublicIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { isIntegrationEncryptionConfigured } from '@/app/lib/order-integration/encryption';
import {
  saveMakeshopAccount,
  toMakeshopAccountPublic,
} from '@/app/lib/order-integration/makeshop-account';

export async function POST(request: NextRequest) {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  if (!isIntegrationEncryptionConfigured()) {
    return NextResponse.json(
      { error: '연동 정보를 안전하게 저장하기 위한 서버 설정이 필요합니다. 관리자에게 문의해 주세요.' },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as {
      accountName?: string;
      shopId?: string;
      mallDomain?: string;
      clientIdOverride?: string;
      clientSecretOverride?: string;
      clearOAuthOverride?: boolean;
    };

    const account = await saveMakeshopAccount({
      userId: auth.userId,
      accountName: body.accountName ?? '',
      shopId: body.shopId ?? '',
      mallDomain: body.mallDomain,
      clientIdOverride: body.clientIdOverride,
      clientSecretOverride: body.clientSecretOverride,
      clearOAuthOverride: body.clearOAuthOverride,
    });

    return NextResponse.json({
      success: true,
      message: '메이크샵 연동 정보가 저장되었습니다.',
      account: toMakeshopAccountPublic(account),
    });
  } catch (error) {
    const message = sanitizePublicIntegrationErrorMessage(
      error instanceof Error ? error.message : '',
      '메이크샵 연동 정보 저장에 실패했습니다.',
    );
    console.error('[Makeshop Integration Save] failed');
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
