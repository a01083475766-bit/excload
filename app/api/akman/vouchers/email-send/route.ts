import { NextRequest, NextResponse } from 'next/server';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';
import { prisma } from '@/app/lib/prisma';
import {
  sendVoucherCodeEmails,
  WADIZ_EMAIL_CAMPAIGN_CODE,
  type VoucherEmailLine,
} from '@/app/lib/voucher/email-send';

const EMAIL_RATE_WINDOW_MS = 60_000;
const EMAIL_RATE_MAX = 5;
const MAX_LINES = 2_000;

/**
 * Manual / resend path from result CSV rows (plaintext codes in request body only).
 * Does not re-issue codes.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;

  const since = new Date(Date.now() - EMAIL_RATE_WINDOW_MS);
  const recent = await prisma.voucherAuditLog.count({
    where: { actorId: admin.userId, action: 'EMAIL_SEND', createdAt: { gte: since } },
  });
  if (recent >= EMAIL_RATE_MAX) {
    return NextResponse.json(
      { error: '이메일 발송 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
  }

  const body = await request.json();
  const campaignId = String(body.campaignId || '');
  const forceResend = Boolean(body.forceResend);
  const confirmed = Boolean(body.confirmed);
  const rawLines = Array.isArray(body.lines) ? body.lines : [];

  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId 필요' }, { status: 400 });
  }
  if (!confirmed) {
    return NextResponse.json({ error: 'confirmed=true 필요' }, { status: 400 });
  }
  if (rawLines.length === 0 || rawLines.length > MAX_LINES) {
    return NextResponse.json({ error: `lines는 1~${MAX_LINES}개` }, { status: 400 });
  }

  const campaign = await prisma.voucherCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, campaignCode: true },
  });
  if (!campaign || campaign.campaignCode !== WADIZ_EMAIL_CAMPAIGN_CODE) {
    return NextResponse.json(
      { error: '자동 이메일은 WADIZ_2026_01 캠페인만 지원합니다.' },
      { status: 400 },
    );
  }

  const lines: VoucherEmailLine[] = [];
  for (const raw of rawLines) {
    const voucherId = String(raw?.voucherId || '').trim();
    const externalOrderId = String(raw?.externalOrderId || '').trim();
    const unitIndex = Number(raw?.unitIndex);
    const voucherCode = String(raw?.voucherCode || '').trim();
    const buyerEmail = raw?.buyerEmail != null ? String(raw.buyerEmail).trim() : null;
    const buyerName = raw?.buyerName != null ? String(raw.buyerName).trim() : null;
    const externalRewardName =
      raw?.externalRewardName != null ? String(raw.externalRewardName) : null;
    const rewardCode = String(raw?.rewardCode || '').trim();

    if (!voucherId || !externalOrderId || !Number.isInteger(unitIndex) || unitIndex < 0) {
      return NextResponse.json({ error: 'line 필드가 올바르지 않습니다.' }, { status: 400 });
    }
    if (!voucherCode) {
      return NextResponse.json(
        { error: '코드 원문이 없는 행은 이메일 발송할 수 없습니다.' },
        { status: 400 },
      );
    }
    lines.push({
      voucherId,
      externalOrderId,
      unitIndex,
      voucherCode,
      buyerName,
      buyerEmail,
      externalRewardName,
      rewardCode,
    });
  }

  const email = await sendVoucherCodeEmails({
    campaignId,
    campaignCode: campaign.campaignCode,
    actorId: admin.userId,
    lines,
    forceResend,
  });

  const res = NextResponse.json({
    success: true,
    email,
    notice: '발송 결과를 확인하세요. 요청 본문의 코드 원문은 서버에 저장되지 않습니다.',
  });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
