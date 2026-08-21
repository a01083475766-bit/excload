import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;

  const campaign = await prisma.voucherCampaign.findUnique({
    where: { id },
    include: {
      rewardPolicies: { orderBy: { rewardCode: 'asc' } },
      _count: { select: { vouchers: true } },
    },
  });
  if (!campaign) return NextResponse.json({ error: '없음' }, { status: 404 });

  const [issued, redeemed, cancelled] = await Promise.all([
    prisma.voucher.count({ where: { campaignId: id, status: 'ISSUED' } }),
    prisma.voucher.count({ where: { campaignId: id, status: 'REDEEMED' } }),
    prisma.voucher.count({ where: { campaignId: id, status: 'CANCELLED' } }),
  ]);

  return NextResponse.json({
    success: true,
    campaign: { ...campaign, stats: { issued, redeemed, cancelled } },
  });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  const body = await request.json();

  if (body.status === undefined && body.title === undefined && body.redeemFrom === undefined) {
    // allow other fields
  }

  const data: Record<string, unknown> = {};
  if (body.status === 'ACTIVE' || body.status === 'ARCHIVED' || body.status === 'DRAFT') {
    data.status = body.status;
  }
  if (body.title !== undefined) data.title = body.title ? String(body.title) : null;
  if (body.redeemFrom !== undefined) data.redeemFrom = body.redeemFrom ? new Date(body.redeemFrom) : null;
  if (body.redeemUntil !== undefined) data.redeemUntil = body.redeemUntil ? new Date(body.redeemUntil) : null;
  if (body.serviceGaAt !== undefined) data.serviceGaAt = body.serviceGaAt ? new Date(body.serviceGaAt) : null;
  if (body.fulfillmentFrom !== undefined) {
    data.fulfillmentFrom = body.fulfillmentFrom ? new Date(body.fulfillmentFrom) : null;
  }
  if (body.fulfillmentTo !== undefined) {
    data.fulfillmentTo = body.fulfillmentTo ? new Date(body.fulfillmentTo) : null;
  }

  if (body.status === 'ARCHIVED') {
    // ok
  }

  const updated = await prisma.voucherCampaign.update({ where: { id }, data });
  return NextResponse.json({ success: true, campaign: updated });
}
