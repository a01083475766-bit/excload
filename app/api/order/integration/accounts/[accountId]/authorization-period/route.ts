import { NextResponse } from 'next/server';
import { OrderIntegrationProvider } from '@prisma/client';
import { prisma } from '@/app/lib/prisma';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import {
  formatAuthorizationDate,
  parseAuthorizationPeriodInput,
} from '@/app/lib/order-integration/authorization-period';

/**
 * 사용자가 직접 등록하는 "인증기간"(예: 네이버 커머스API센터 표시 기간)을 저장/삭제한다.
 * 자동 조회가 아니며, 인증정보(Client ID/Secret 등)와 연결 상태(healthStatus)는 건드리지 않는다.
 * 이번 단계에서는 스마트스토어 계정만 지원한다.
 *
 * body: { periodStart?: string|null, periodEnd?: string|null }  (YYYY-MM-DD)
 *  - 두 값 모두 비어 있으면 등록된 기간을 삭제한다.
 *  - 응답은 ISO 시각이 아니라 YYYY-MM-DD 문자열만 반환한다(브라우저 타임존 변환 방지).
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const { accountId } = await context.params;
  if (!accountId) {
    return NextResponse.json({ error: '계정 ID가 필요합니다.' }, { status: 400 });
  }

  // 소유권 검증: 다른 사용자의 accountId는 조회·수정할 수 없다(404).
  const account = await prisma.orderIntegrationAccount.findFirst({
    where: { id: accountId, userId: auth.userId },
    select: { id: true, provider: true },
  });
  if (!account) {
    return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 404 });
  }

  if (account.provider !== OrderIntegrationProvider.SMARTSTORE) {
    return NextResponse.json(
      { error: '현재 인증기간 등록은 스마트스토어 계정만 지원합니다.' },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    periodStart?: unknown;
    periodEnd?: unknown;
  } | null;

  const parsed = parseAuthorizationPeriodInput({ start: body?.periodStart, end: body?.periodEnd });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // 기간만 갱신한다. healthStatus·인증정보·status는 변경하지 않는다.
  const data = parsed.value.clear
    ? { authorizationPeriodStart: null, authorizationPeriodEnd: null }
    : { authorizationPeriodStart: parsed.value.start, authorizationPeriodEnd: parsed.value.end };

  const updated = await prisma.orderIntegrationAccount.update({
    where: { id: account.id },
    data,
    select: { authorizationPeriodStart: true, authorizationPeriodEnd: true },
  });

  return NextResponse.json({
    success: true,
    authorizationPeriodStart: formatAuthorizationDate(updated.authorizationPeriodStart),
    authorizationPeriodEnd: formatAuthorizationDate(updated.authorizationPeriodEnd),
  });
}
