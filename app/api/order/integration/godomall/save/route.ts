import { NextRequest, NextResponse } from 'next/server';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import { isIntegrationEncryptionConfigured } from '@/app/lib/order-integration/encryption';
import {
  saveGodomallAccount,
  toGodomallAccountPublic,
} from '@/app/lib/order-integration/godomall-account';

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
      mallDomain?: string;
      userKey?: string;
      mallSno?: string;
      partnerKeyOverride?: string;
      clearPartnerKeyOverride?: boolean;
    };

    const account = await saveGodomallAccount({
      userId: auth.userId,
      accountName: body.accountName ?? '',
      mallDomain: body.mallDomain ?? '',
      userKey: body.userKey,
      mallSno: body.mallSno,
      partnerKeyOverride: body.partnerKeyOverride,
      clearPartnerKeyOverride: body.clearPartnerKeyOverride,
    });

    return NextResponse.json({
      success: true,
      message: '고도몰 연동 정보가 저장되었습니다.',
      account: toGodomallAccountPublic(account),
    });
  } catch (error) {
    console.error('[Godomall Integration Save] error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '고도몰 연동 정보 저장에 실패했습니다.' },
      { status: 400 },
    );
  }
}
