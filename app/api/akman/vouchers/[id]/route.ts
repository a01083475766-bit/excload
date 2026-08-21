import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';
import { VOUCHER_SOURCE } from '@/app/lib/voucher/constants';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;

  const voucher = await prisma.voucher.findUnique({
    where: { id },
    include: {
      campaign: true,
      rewardPolicy: true,
      redeemedBy: { select: { id: true, email: true, plan: true } },
      auditLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  if (!voucher) return NextResponse.json({ error: '없음' }, { status: 404 });

  const entitlement = await prisma.entitlement.findUnique({
    where: { source_sourceRefId: { source: VOUCHER_SOURCE, sourceRefId: id } },
  });

  // Never expose code plaintext / hash to UI beyond last4
  const { codeHash: _h, ...safe } = voucher;
  void _h;

  return NextResponse.json({
    success: true,
    voucher: {
      ...safe,
      codeHash: undefined,
      entitlement,
    },
  });
}
