import { NextRequest, NextResponse } from 'next/server';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import { isIntegrationEncryptionConfigured } from '@/app/lib/order-integration/encryption';
import {
  saveSmartstoreAccount,
  toSmartstoreAccountPublic,
} from '@/app/lib/order-integration/smartstore-account';
import type { SmartstoreAuthType } from '@/app/lib/smartstore/client';

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
      clientId?: string;
      clientSecret?: string;
      authType?: SmartstoreAuthType;
    };

    const account = await saveSmartstoreAccount({
      userId: auth.userId,
      accountName: body.accountName ?? '',
      clientId: body.clientId ?? '',
      clientSecret: body.clientSecret,
      authType: body.authType ?? 'SELF',
    });

    return NextResponse.json({
      success: true,
      message: '스마트스토어 연동 정보가 저장되었습니다.',
      account: toSmartstoreAccountPublic(account),
    });
  } catch (error) {
    console.error('[Smartstore Integration Save] error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '스마트스토어 연동 정보 저장에 실패했습니다.' },
      { status: 400 },
    );
  }
}
