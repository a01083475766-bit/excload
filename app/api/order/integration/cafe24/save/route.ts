import { NextRequest, NextResponse } from 'next/server';
import { sanitizePublicIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { isIntegrationEncryptionConfigured } from '@/app/lib/order-integration/encryption';
import { isCafe24SharedAppConfigured } from '@/app/lib/cafe24/app-credentials';
import {
  saveCafe24Account,
  toCafe24AccountPublic,
} from '@/app/lib/order-integration/cafe24-account';

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
      mallId?: string;
      clientId?: string;
      clientSecret?: string;
    };

    const shared = isCafe24SharedAppConfigured();
    const account = await saveCafe24Account({
      userId: auth.userId,
      accountName: body.accountName ?? '',
      mallId: body.mallId ?? '',
      // 공용 앱이면 Client ID/Secret 입력을 무시한다.
      clientId: shared ? undefined : body.clientId,
      clientSecret: shared ? undefined : body.clientSecret,
    });

    return NextResponse.json({
      success: true,
      message: '카페24 연동 정보가 저장되었습니다. 이어서 「카페24 연동 시작」을 진행해 주세요.',
      account: toCafe24AccountPublic(account),
    });
  } catch (error) {
    const message = sanitizePublicIntegrationErrorMessage(
      error instanceof Error ? error.message : '',
      '카페24 연동 정보 저장에 실패했습니다.',
    );
    console.error('[Cafe24 Integration Save] failed');
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
