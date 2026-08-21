import { NextRequest, NextResponse } from 'next/server';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';
import { transferRedeemedVoucher } from '@/app/lib/voucher/admin-transfer-adjust';
import { prisma } from '@/app/lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  const body = await request.json();
  const reason = String(body.reason || '');
  const confirmed = Boolean(body.confirmed);
  let targetUserId = body.targetUserId ? String(body.targetUserId) : '';
  const targetEmail = body.targetEmail ? String(body.targetEmail).trim().toLowerCase() : '';

  if (!confirmed) {
    return NextResponse.json({ error: 'confirmed=true 로 2차 확인이 필요합니다.' }, { status: 400 });
  }
  if (!targetUserId && targetEmail) {
    const u = await prisma.user.findUnique({ where: { email: targetEmail }, select: { id: true } });
    if (!u) return NextResponse.json({ error: '대상 이메일의 사용자가 없습니다.' }, { status: 404 });
    targetUserId = u.id;
  }
  if (!targetUserId) {
    return NextResponse.json({ error: 'targetUserId 또는 targetEmail이 필요합니다.' }, { status: 400 });
  }

  const result = await transferRedeemedVoucher({
    voucherId: id,
    targetUserId,
    actorId: admin.userId,
    reason,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
