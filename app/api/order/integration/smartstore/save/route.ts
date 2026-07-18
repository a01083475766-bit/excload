import { NextRequest, NextResponse } from 'next/server';
import { sanitizePublicIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { isIntegrationEncryptionConfigured } from '@/app/lib/order-integration/encryption';
import {
  saveSmartstoreAccount,
  toSmartstoreAccountPublic,
} from '@/app/lib/order-integration/smartstore-account';
import type { SmartstoreAuthType } from '@/app/lib/smartstore/client';

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
    const message = sanitizePublicIntegrationErrorMessage(
      error instanceof Error ? error.message : '',
      '스마트스토어 연동 정보 저장에 실패했습니다.',
    );
    console.error('[Smartstore Integration Save] failed');
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
