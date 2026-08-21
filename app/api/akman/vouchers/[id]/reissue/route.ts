import { NextRequest, NextResponse } from 'next/server';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';
import { reissueVoucherCode } from '@/app/lib/voucher/admin-ops';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  const body = await request.json();
  const reason = String(body.reason || '');

  const result = await reissueVoucherCode({
    voucherId: id,
    actorId: admin.userId,
    reason,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const res = NextResponse.json({
    success: true,
    voucherCode: result.voucherCode,
    codeLast4: result.codeLast4,
    codeVersion: result.codeVersion,
    notice: '새 코드 원문은 이 응답에서만 제공됩니다.',
  });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
