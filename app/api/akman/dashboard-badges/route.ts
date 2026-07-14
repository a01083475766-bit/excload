/**
 * GET /api/akman/dashboard-badges
 * 관리자 대시보드 바로가기 카드 알림 배지
 *
 * - 처리 대기: 고객문의(NEW), 환불(REQUESTED), 어뷰징(abuseFlag)
 * - since(ISO): 마지막 대시보드 방문 이후 신규 건수 (결제·헤더 로그 등)
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { prisma } from '@/app/lib/prisma';

function parseSince(raw: string | null): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return Response.json({ error: '관리자 권한 필요' }, { status: 403 });
  }

  const since = parseSince(new URL(request.url).searchParams.get('since'));
  const badges: Record<string, number> = {};

  const [contactNew, refundRequested, abuseFlagged] = await Promise.all([
    prisma.contactInquiry.count({ where: { status: 'NEW' } }),
    prisma.refundRequest.count({ where: { status: 'REQUESTED' } }),
    prisma.user.count({ where: { abuseFlag: true } }),
  ]);

  if (contactNew > 0) badges['/akman/contact-inquiries'] = contactNew;
  if (refundRequested > 0) badges['/akman/refunds'] = refundRequested;
  if (abuseFlagged > 0) badges['/akman/abuse'] = abuseFlagged;

  if (since) {
    const sinceFilter = { createdAt: { gt: since } as const };

    const [
      paymentsSince,
      pointsSince,
      templateLogsSince,
      headerDictSince,
      aiMappingSince,
    ] = await Promise.all([
      prisma.payment.count({ where: sinceFilter }),
      prisma.pointHistory.count({ where: sinceFilter }),
      prisma.templateHeaderLog.count({ where: sinceFilter }),
      prisma.headerDictionary.count({ where: { firstSeenAt: { gt: since } } }),
      prisma.aiHeaderMappingLog.count({ where: sinceFilter }),
    ]);

    if (paymentsSince > 0) badges['/akman/payments'] = paymentsSince;
    if (pointsSince > 0) badges['/akman/points'] = pointsSince;
    if (templateLogsSince > 0) badges['/akman/template-header-logs'] = templateLogsSince;
    if (headerDictSince > 0) badges['/akman/header-dictionary'] = headerDictSince;
    if (aiMappingSince > 0) badges['/akman/ai-mapping'] = aiMappingSince;
  }

  return Response.json({ badges });
}
