import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';

export async function GET() {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;

  const campaigns = await prisma.voucherCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      rewardPolicies: {
        select: {
          id: true,
          rewardCode: true,
          durationMonths: true,
          soldPriceKrw: true,
          status: true,
          pointsMode: true,
        },
        orderBy: { rewardCode: 'asc' },
      },
      _count: { select: { vouchers: true } },
    },
  });

  const stats = await Promise.all(
    campaigns.map(async (c) => {
      const [issued, redeemed, cancelled] = await Promise.all([
        prisma.voucher.count({ where: { campaignId: c.id, status: 'ISSUED' } }),
        prisma.voucher.count({ where: { campaignId: c.id, status: 'REDEEMED' } }),
        prisma.voucher.count({ where: { campaignId: c.id, status: 'CANCELLED' } }),
      ]);
      return { id: c.id, issued, redeemed, cancelled };
    }),
  );
  const statMap = new Map(stats.map((s) => [s.id, s]));

  return NextResponse.json({
    success: true,
    campaigns: campaigns.map((c) => ({
      ...c,
      stats: statMap.get(c.id),
    })),
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;

  const body = await request.json();
  const campaignCode = String(body.campaignCode || '').trim();
  const slug = String(body.slug || '').trim();
  const providerCode = String(body.providerCode || '').trim();
  if (!campaignCode || !slug || !providerCode) {
    return NextResponse.json({ error: 'providerCode, campaignCode, slug가 필요합니다.' }, { status: 400 });
  }

  const created = await prisma.voucherCampaign.create({
    data: {
      providerCode,
      campaignCode,
      slug,
      status: body.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
      title: body.title ? String(body.title) : null,
      redeemFrom: body.redeemFrom ? new Date(body.redeemFrom) : null,
      redeemUntil: body.redeemUntil ? new Date(body.redeemUntil) : null,
      serviceGaAt: body.serviceGaAt ? new Date(body.serviceGaAt) : null,
      fulfillmentFrom: body.fulfillmentFrom ? new Date(body.fulfillmentFrom) : null,
      fulfillmentTo: body.fulfillmentTo ? new Date(body.fulfillmentTo) : null,
      projectEndsAt: body.projectEndsAt ? new Date(body.projectEndsAt) : null,
    },
  });

  return NextResponse.json({ success: true, campaign: created });
}
