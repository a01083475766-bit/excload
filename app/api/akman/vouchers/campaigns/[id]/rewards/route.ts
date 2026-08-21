import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;
  const { id: campaignId } = await ctx.params;
  const rewards = await prisma.rewardPolicy.findMany({
    where: { campaignId },
    orderBy: { rewardCode: 'asc' },
  });
  return NextResponse.json({ success: true, rewards });
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;
  const { id: campaignId } = await ctx.params;
  const body = await request.json();
  const rewardCode = String(body.rewardCode || '').trim();
  const durationMonths = Number(body.durationMonths);
  if (!rewardCode || !Number.isInteger(durationMonths) || durationMonths < 1) {
    return NextResponse.json({ error: 'rewardCode와 durationMonths가 필요합니다.' }, { status: 400 });
  }

  const created = await prisma.rewardPolicy.create({
    data: {
      campaignId,
      rewardCode,
      accessTier: body.accessTier || 'PRO',
      durationMonths,
      grantsProAccess: body.grantsProAccess !== false,
      pointsMode: body.pointsMode || 'NONE',
      soldPriceKrw: body.soldPriceKrw != null ? Number(body.soldPriceKrw) : null,
      startPolicy: body.startPolicy || 'ON_REDEEM_OR_GA',
      stackPolicy: body.stackPolicy || 'SEQUENTIAL',
      status: body.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
    },
  });
  return NextResponse.json({ success: true, reward: created });
}
