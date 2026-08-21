import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';
import { VOUCHER_SOURCE } from '@/app/lib/voucher/constants';

export async function GET(request: NextRequest) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;

  const sp = request.nextUrl.searchParams;
  const campaignId = sp.get('campaignId') || undefined;
  const status = sp.get('status') || undefined;
  const externalOrderId = sp.get('externalOrderId') || undefined;
  const codeLast4 = sp.get('codeLast4') || undefined;
  const email = sp.get('email') || undefined;
  const take = Math.min(Number(sp.get('take') || 50), 200);
  const skip = Math.max(Number(sp.get('skip') || 0), 0);

  const where: Record<string, unknown> = {};
  if (campaignId) where.campaignId = campaignId;
  if (status) where.status = status;
  if (externalOrderId) where.externalOrderId = { contains: externalOrderId };
  if (codeLast4) where.codeLast4 = codeLast4.toUpperCase();
  if (email) {
    where.redeemedBy = { email: { contains: email, mode: 'insensitive' } };
  }

  const [total, vouchers] = await Promise.all([
    prisma.voucher.count({ where }),
    prisma.voucher.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: {
        campaign: { select: { campaignCode: true, providerCode: true, slug: true } },
        rewardPolicy: { select: { rewardCode: true, durationMonths: true } },
        redeemedBy: { select: { id: true, email: true } },
      },
    }),
  ]);

  const voucherIds = vouchers.map((v) => v.id);
  const entitlements = await prisma.entitlement.findMany({
    where: { source: VOUCHER_SOURCE, sourceRefId: { in: voucherIds } },
  });
  const entMap = new Map(entitlements.map((e) => [e.sourceRefId, e]));

  return NextResponse.json({
    success: true,
    total,
    vouchers: vouchers.map((v) => ({
      id: v.id,
      status: v.status,
      codeLast4: v.codeLast4,
      codeVersion: v.codeVersion,
      externalOrderId: v.externalOrderId,
      unitIndex: v.unitIndex,
      purchaseAmount: v.purchaseAmount,
      externalRewardName: v.externalRewardName,
      campaignCode: v.campaign.campaignCode,
      providerCode: v.campaign.providerCode,
      rewardCode: v.rewardPolicy.rewardCode,
      durationMonthsSnapshot: v.durationMonthsSnapshot,
      redeemedBy: v.redeemedBy,
      redeemedAt: v.redeemedAt,
      createdAt: v.createdAt,
      entitlement: entMap.get(v.id)
        ? {
            id: entMap.get(v.id)!.id,
            lifecycleStatus: entMap.get(v.id)!.lifecycleStatus,
            startsAt: entMap.get(v.id)!.startsAt,
            endsAt: entMap.get(v.id)!.endsAt,
          }
        : null,
    })),
  });
}
