import { NextRequest, NextResponse } from 'next/server';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';
import { adjustVoucherEntitlementDates } from '@/app/lib/voucher/admin-transfer-adjust';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;
  const { id: entitlementId } = await ctx.params;
  const body = await request.json();
  const reason = String(body.reason || '');
  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  const endsAt = body.endsAt ? new Date(body.endsAt) : null;

  if (startsAt && Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: 'startsAt 형식 오류' }, { status: 400 });
  }
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    return NextResponse.json({ error: 'endsAt 형식 오류' }, { status: 400 });
  }

  const result = await adjustVoucherEntitlementDates({
    entitlementId,
    actorId: admin.userId,
    reason,
    startsAt,
    endsAt,
    allowRecascade: Boolean(body.allowRecascade),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
