import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';

type Ctx = { params: Promise<{ id: string; rewardId: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;
  const { rewardId } = await ctx.params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.status === 'ACTIVE' || body.status === 'ARCHIVED') data.status = body.status;
  if (body.soldPriceKrw !== undefined) {
    data.soldPriceKrw = body.soldPriceKrw == null ? null : Number(body.soldPriceKrw);
  }
  if (body.durationMonths != null) {
    const n = Number(body.durationMonths);
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json({ error: 'durationMonths 오류' }, { status: 400 });
    }
    data.durationMonths = n;
  }
  if (body.pointsMode) data.pointsMode = String(body.pointsMode);
  if (body.startPolicy) data.startPolicy = String(body.startPolicy);
  if (body.stackPolicy) data.stackPolicy = String(body.stackPolicy);
  if (typeof body.grantsProAccess === 'boolean') data.grantsProAccess = body.grantsProAccess;

  // Note: changing policy does not rewrite existing voucher snapshots
  const updated = await prisma.rewardPolicy.update({ where: { id: rewardId }, data });
  return NextResponse.json({ success: true, reward: updated });
}
