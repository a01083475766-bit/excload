import { NextRequest, NextResponse } from 'next/server';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import { isIntegrationEncryptionConfigured } from '@/app/lib/order-integration/encryption';
import {
  saveCjonstyleAccount,
  toCjonstyleAccountPublic,
} from '@/app/lib/order-integration/cjonstyle-account';

export async function POST(request: NextRequest) {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  if (!isIntegrationEncryptionConfigured()) {
    return NextResponse.json(
      { error: '서버 암호화 키(EXCLOAD_INTEGRATION_ENCRYPTION_KEY)가 설정되지 않았습니다.' },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as {
      accountName?: string;
      vendorCode?: string;
      authenticationKey?: string;
      deliveryMethodCode?: string;
    };

    const account = await saveCjonstyleAccount({
      userId: auth.userId,
      accountName: body.accountName ?? '',
      vendorCode: body.vendorCode ?? '',
      authenticationKey: body.authenticationKey,
      deliveryMethodCode: body.deliveryMethodCode,
    });

    return NextResponse.json({
      success: true,
      message: 'CJ온스타일 연동 정보가 저장되었습니다.',
      account: toCjonstyleAccountPublic(account),
    });
  } catch (error) {
    console.error('[Cjonstyle Integration Save] error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'CJ온스타일 연동 정보 저장에 실패했습니다.' },
      { status: 400 },
    );
  }
}
