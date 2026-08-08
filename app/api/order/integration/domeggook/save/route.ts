import { NextRequest, NextResponse } from 'next/server';
import { sanitizePublicIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { isIntegrationEncryptionConfigured } from '@/app/lib/order-integration/encryption';
import {
  parseDomeggookDeliWithTaxInput,
  saveDomeggookAccount,
  toDomeggookAccountPublic,
} from '@/app/lib/order-integration/domeggook-account';

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
      memberId?: string;
      password?: string;
      apiKey?: string;
      deliWithTax?: unknown;
    };

    let deliWithTax: 0 | 1 | null | undefined;
    try {
      deliWithTax = parseDomeggookDeliWithTaxInput(body.deliWithTax);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : '세금계산서 포함 여부가 올바르지 않습니다.',
        },
        { status: 400 },
      );
    }

    const account = await saveDomeggookAccount({
      userId: auth.userId,
      accountName: body.accountName ?? '',
      memberId: body.memberId ?? '',
      password: body.password,
      apiKey: body.apiKey,
      deliWithTax,
    });

    return NextResponse.json({
      success: true,
      message: '도매꾹 연동 정보가 저장되었습니다.',
      account: toDomeggookAccountPublic(account),
    });
  } catch (error) {
    const message = sanitizePublicIntegrationErrorMessage(
      error instanceof Error ? error.message : '',
      '도매꾹 연동 정보 저장에 실패했습니다.',
    );
    console.error('[Domeggook Integration Save] failed');
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
