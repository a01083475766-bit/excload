import { NextResponse } from 'next/server';

import {
  elevenReqPackaging,
  toUserFacingElevenErrorMessage,
} from '@/app/lib/eleven/client';
import {
  callElevenReqPackagingForLine,
  runElevenConfirm,
  validateElevenConfirmItems,
  type ElevenConfirmItemResult,
  type ElevenConfirmRequestItem,
} from '@/app/lib/eleven/eleven-confirm';
import {
  getElevenAccountForUser,
  toElevenCredentials,
} from '@/app/lib/order-integration/eleven-account';
import { sanitizePublicIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';

type PublicConfirmItem = {
  productOrderNo: string;
  ordNo: string;
  ordPrdSeq: string;
  dlvNo: string;
  status: ElevenConfirmItemResult['status'];
  message: string;
};

function toPublicItem(row: ElevenConfirmItemResult): PublicConfirmItem {
  return {
    productOrderNo: row.productOrderNo,
    ordNo: row.ordNo,
    ordPrdSeq: row.ordPrdSeq,
    dlvNo: row.dlvNo,
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
  | { ok: true; items: ElevenConfirmRequestItem[]; accountId: string | null }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Invalid request body.' };
  }
  const record = raw as Record<string, unknown>;
  if ('openapikey' in record || 'apiKey' in record) {
    return { ok: false, error: '인증 정보는 서버에서 확인합니다.' };
  }
  const validated = validateElevenConfirmItems(record.items);
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
      { error: '11번가 API는 고정 IP 프록시 설정이 필요합니다.' },
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

  const account = await getElevenAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 11번가 연동 정보가 없습니다. 먼저 저장해 주세요.' },
      { status: 404 },
    );
  }
  if (parsed.accountId && parsed.accountId !== account.id) {
    return NextResponse.json(
      { error: '선택한 11번가 계정에 접근할 수 없습니다.' },
      { status: 403 },
    );
  }

  let credentials;
  try {
    credentials = toElevenCredentials(account);
  } catch {
    return NextResponse.json({ error: '11번가 연결 정보를 확인해 주세요.' }, { status: 400 });
  }

  try {
    const result = await runElevenConfirm({
      items: parsed.items,
      reqPackaging: (line) =>
        callElevenReqPackagingForLine(
          { credentials, call: elevenReqPackaging },
          line,
        ),
    });

    return NextResponse.json({
      success: true,
      path: '/rest/ordservices/reqpackaging',
      summary: {
        requested: result.requestedCount,
        confirmed: result.confirmedCount,
        alreadyConfirmed: result.alreadyConfirmedCount,
        failed: result.failedCount,
        skipped: result.skippedCount,
      },
      results: result.results.map(toPublicItem),
    });
  } catch (error) {
    const message = sanitizePublicIntegrationErrorMessage(toUserFacingElevenErrorMessage(error));
    console.error('[Eleven Confirm] failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
