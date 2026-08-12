import { NextResponse } from 'next/server';

import { toUserFacingCafe24ErrorMessage } from '@/app/lib/cafe24/client';
import {
  runCafe24Confirm,
  validateCafe24ConfirmItems,
  type Cafe24ConfirmItemResult,
  type Cafe24ConfirmRequestItem,
} from '@/app/lib/cafe24/cafe24-confirm';
import {
  ensureCafe24AccessToken,
  getCafe24AccountForUser,
  toCafe24Credentials,
} from '@/app/lib/order-integration/cafe24-account';
import { sanitizePublicIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';
import { hasAllCafe24RequiredScopes, CAFE24_REAUTH_SCOPE_MESSAGE } from '@/app/lib/cafe24/scopes';

type PublicConfirmItem = {
  productOrderNo: string;
  orderId: string;
  orderItemCode: string;
  shopNo: number;
  status: Cafe24ConfirmItemResult['status'];
  message: string;
};

function toPublicItem(row: Cafe24ConfirmItemResult): PublicConfirmItem {
  return {
    productOrderNo: row.productOrderNo,
    orderId: row.orderId,
    orderItemCode: row.orderItemCode,
    shopNo: row.shopNo,
    status: row.status,
    message: row.message,
  };
}

function extractAccountId(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = (raw as Record<string, unknown>).accountId;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseRequestBody(
  raw: unknown,
):
  | { ok: true; items: Cafe24ConfirmRequestItem[]; accountId: string | null }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Invalid request body.' };
  }
  const record = raw as Record<string, unknown>;
  if (
    'accessToken' in record ||
    'clientSecret' in record ||
    'clientId' in record ||
    'refreshToken' in record
  ) {
    return { ok: false, error: '인증 정보는 서버에서 확인합니다.' };
  }
  const validated = validateCafe24ConfirmItems(record.items);
  if (!validated.ok) return validated;
  return {
    ok: true,
    items: validated.items,
    accountId: extractAccountId(raw),
  };
}

export async function POST(request: Request) {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  if (!isIntegrationProxyConfigured()) {
    return NextResponse.json(
      { error: '카페24 API는 고정 IP 프록시 설정이 필요합니다.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 본문을 해석하지 못했습니다.' }, { status: 400 });
  }

  const parsed = parseRequestBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const account = await getCafe24AccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 카페24 연동 정보가 없습니다. 먼저 저장해 주세요.' },
      { status: 404 },
    );
  }
  if (parsed.accountId && parsed.accountId !== account.id) {
    return NextResponse.json(
      { error: '선택한 카페24 계정에 접근할 수 없습니다.' },
      { status: 403 },
    );
  }

  let credentials;
  try {
    credentials = toCafe24Credentials(account);
  } catch {
    return NextResponse.json({ error: '카페24 연결 정보를 확인해 주세요.' }, { status: 400 });
  }

  try {
    const { accessToken, tokens } = await ensureCafe24AccessToken(account);
    if (!hasAllCafe24RequiredScopes(tokens.scopes)) {
      return NextResponse.json({ error: CAFE24_REAUTH_SCOPE_MESSAGE }, { status: 403 });
    }

    const result = await runCafe24Confirm({
      credentials,
      accessToken,
      items: parsed.items,
    });

    return NextResponse.json({
      success: result.failedCount === 0,
      path: '/api/v2/admin/orders',
      processStatus: 'prepare',
      summary: {
        requested: result.requestedCount,
        confirmed: result.confirmedCount,
        alreadyConfirmed: result.alreadyConfirmedCount,
        failed: result.failedCount,
        skipped: result.skippedCount,
        putCalls: result.putCallCount,
      },
      results: result.results.map(toPublicItem),
    });
  } catch (error) {
    const message = sanitizePublicIntegrationErrorMessage(toUserFacingCafe24ErrorMessage(error));
    console.error('[Cafe24 Confirm] failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
