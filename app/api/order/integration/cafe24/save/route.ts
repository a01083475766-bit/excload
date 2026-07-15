import { NextRequest, NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { isIntegrationEncryptionConfigured } from '@/app/lib/order-integration/encryption';
import {
  saveCafe24Account,
  toCafe24AccountPublic,
} from '@/app/lib/order-integration/cafe24-account';

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
      mallId?: string;
      clientId?: string;
      clientSecret?: string;
    };

    const account = await saveCafe24Account({
      userId: auth.userId,
      accountName: body.accountName ?? '',
      mallId: body.mallId ?? '',
      clientId: body.clientId ?? '',
      clientSecret: body.clientSecret,
    });

    return NextResponse.json({
      success: true,
      message: '카페24 연동 정보가 저장되었습니다. 이어서 「카페24 연동 시작」을 진행해 주세요.',
      account: toCafe24AccountPublic(account),
    });
  } catch (error) {
    console.error('[Cafe24 Integration Save] error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '카페24 연동 정보 저장에 실패했습니다.' },
      { status: 400 },
    );
  }
}
