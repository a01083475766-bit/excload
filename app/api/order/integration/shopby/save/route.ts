import { NextRequest, NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { isIntegrationEncryptionConfigured } from '@/app/lib/order-integration/encryption';
import {
  saveShopbyAccount,
  toShopbyAccountPublic,
} from '@/app/lib/order-integration/shopby-account';

export async function POST(request: NextRequest) {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  if (!isIntegrationEncryptionConfigured()) {
    return NextResponse.json(
      { error: '서버 암호화 키(EXCLOAD_INTEGRATION_ENCRYPTION_KEY)가 설정되지 않았습니다.' },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as {
      accountName?: string;
      mallKey?: string;
      systemKey?: string;
      mallDomain?: string;
    };

    const account = await saveShopbyAccount({
      userId: auth.userId,
      accountName: body.accountName ?? '',
      mallKey: body.mallKey,
      systemKey: body.systemKey,
      mallDomain: body.mallDomain,
    });

    return NextResponse.json({
      success: true,
      message: '샵바이 연동 정보가 저장되었습니다.',
      account: toShopbyAccountPublic(account),
    });
  } catch (error) {
    console.error('[Shopby Integration Save] error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '샵바이 연동 정보 저장에 실패했습니다.' },
      { status: 400 },
    );
  }
}
