import { NextRequest, NextResponse } from 'next/server';
import { sanitizePublicIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  saveCoupangAccount,
  toCoupangAccountPublic,
} from '@/app/lib/order-integration/coupang-account';
import { isIntegrationEncryptionConfigured } from '@/app/lib/order-integration/encryption';

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
      vendorId?: string;
      accessKey?: string;
      secretKey?: string;
      expiresAt?: string | null;
    };

    const expiresAt =
      body.expiresAt && body.expiresAt.trim()
        ? new Date(`${body.expiresAt.trim()}T23:59:59.999+09:00`)
        : null;

    const account = await saveCoupangAccount({
      userId: auth.userId,
      accountName: body.accountName ?? '',
      vendorId: body.vendorId ?? '',
      accessKey: body.accessKey?.trim() || undefined,
      secretKey: body.secretKey,
      expiresAt,
    });

    return NextResponse.json({
      success: true,
      message: '쿠팡 연동 정보가 저장되었습니다.',
      account: toCoupangAccountPublic(account),
    });
  } catch (error) {
    const message = sanitizePublicIntegrationErrorMessage(
      error instanceof Error ? error.message : '',
      '쿠팡 연동 정보 저장에 실패했습니다.',
    );
    console.error('[Coupang Integration Save] failed');
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
