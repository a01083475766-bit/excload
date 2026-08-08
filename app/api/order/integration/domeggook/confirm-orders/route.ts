import { NextResponse } from 'next/server';

import {
  domeggookSetLogin,
  domeggookSetOrdChk,
  toUserFacingDomeggookClientError,
} from '@/app/lib/domeggook/client';
import {
  runDomeggookConfirm,
  validateDomeggookConfirmItems,
  type DomeggookConfirmItemResult,
  type DomeggookConfirmRequestItem,
} from '@/app/lib/domeggook/domeggook-confirm';
import {
  getDomeggookAccountForUser,
  toDomeggookCredentials,
} from '@/app/lib/order-integration/domeggook-account';
import { sanitizePublicIntegrationErrorMessage } from '@/app/lib/order-integration/public-api-safety';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { isIntegrationProxyConfigured } from '@/app/lib/integration-proxy/config';

type PublicConfirmItem = {
  displayOrderNo: string;
  apiOrderNo: string;
  orderUid: string;
  status: DomeggookConfirmItemResult['status'];
  message: string;
};

function toPublicItem(row: DomeggookConfirmItemResult): PublicConfirmItem {
  return {
    displayOrderNo: row.displayOrderNo,
    apiOrderNo: row.apiOrderNo,
    orderUid: row.orderUid,
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
  | { ok: true; items: DomeggookConfirmRequestItem[]; accountId: string | null }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Invalid request body.' };
  }
  const record = raw as Record<string, unknown>;
  if ('apiKey' in record || 'password' in record || 'sId' in record) {
    return { ok: false, error: '인증 정보는 서버에서 확인합니다.' };
  }
  const validated = validateDomeggookConfirmItems(record.items);
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
      { error: '도매꾹 API는 고정 IP 프록시 설정이 필요합니다.' },
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

  const account = await getDomeggookAccountForUser(auth.userId);
  if (!account) {
    return NextResponse.json(
      { error: '저장된 도매꾹 연동 정보가 없습니다. 먼저 저장해 주세요.' },
      { status: 404 },
    );
  }
  if (parsed.accountId && parsed.accountId !== account.id) {
    return NextResponse.json(
      { error: '선택한 도매꾹 계정에 접근할 수 없습니다.' },
      { status: 403 },
    );
  }

  let credentials;
  try {
    credentials = toDomeggookCredentials(account);
  } catch {
    return NextResponse.json({ error: '도매꾹 연결 정보를 확인해 주세요.' }, { status: 400 });
  }

  try {
    const session = await domeggookSetLogin({ credentials });
    try {
      const result = await runDomeggookConfirm({
        items: parsed.items,
        setOrdChk: (apiOrderNos) =>
          domeggookSetOrdChk({
            credentials,
            session,
            apiOrderNos,
          }),
      });

      return NextResponse.json({
        success: true,
        mode: 'setOrdChk',
        summary: {
          requested: result.requestedCount,
          confirmed: result.confirmedCount,
          alreadyConfirmed: result.alreadyConfirmedCount,
          failed: result.failedCount,
          skipped: result.skippedCount,
        },
        results: result.results.map(toPublicItem),
      });
    } finally {
      (session as { sId?: string }).sId = undefined;
    }
  } catch (error) {
    const message = sanitizePublicIntegrationErrorMessage(
      toUserFacingDomeggookClientError(error, [
        credentials.password,
        credentials.apiKey,
        credentials.memberId,
      ]),
    );
    console.error('[Domeggook Confirm] failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
