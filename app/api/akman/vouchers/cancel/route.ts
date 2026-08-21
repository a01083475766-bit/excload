import { NextRequest, NextResponse } from 'next/server';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';
import { cancelVouchers, previewCancelImpact } from '@/app/lib/voucher/admin-ops';

export async function POST(request: NextRequest) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;

  const body = await request.json();
  const voucherIds: string[] = Array.isArray(body.voucherIds) ? body.voucherIds.map(String) : [];
  const previewOnly = Boolean(body.previewOnly);
  const reason = String(body.reason || '').trim();
  const confirmed = Boolean(body.confirmed);

  if (voucherIds.length === 0) {
    return NextResponse.json({ error: 'voucherIds가 필요합니다.' }, { status: 400 });
  }

  const impact = await previewCancelImpact(voucherIds);
  if (previewOnly || !confirmed) {
    return NextResponse.json({ success: true, preview: true, impact });
  }
  if (!reason) {
    return NextResponse.json({ error: '취소 사유가 필요합니다.' }, { status: 400 });
  }

  const result = await cancelVouchers({
    voucherIds,
    actorId: admin.userId,
    reason,
  });
  return NextResponse.json({ success: true, ...result, impactBefore: impact });
}
