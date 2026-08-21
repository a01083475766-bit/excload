import { NextRequest, NextResponse } from 'next/server';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';
import { issueVoucherUnits } from '@/app/lib/voucher/admin-issue';
import { prisma } from '@/app/lib/prisma';

export async function POST(request: NextRequest) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;

  const body = await request.json();
  const campaignId = String(body.campaignId || '');
  const rewardPolicyId = String(body.rewardPolicyId || '');
  const externalOrderId = String(body.externalOrderId || '').trim();
  const reason = String(body.reason || '').trim();
  const quantity = Number(body.quantity ?? 1);
  const unitIndexStart = Number(body.unitIndex ?? 0);
  const purchaseAmount =
    body.purchaseAmount == null || body.purchaseAmount === ''
      ? null
      : Number(body.purchaseAmount);

  if (!campaignId || !rewardPolicyId || !externalOrderId || !reason) {
    return NextResponse.json(
      { error: 'campaignId, rewardPolicyId, externalOrderId, reason이 필요합니다.' },
      { status: 400 },
    );
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    return NextResponse.json({ error: 'quantity는 1~100 정수여야 합니다.' }, { status: 400 });
  }

  const units = Array.from({ length: quantity }, (_, i) => ({
    externalOrderId,
    unitIndex: unitIndexStart + i,
    rewardPolicyId,
    externalRewardName: body.externalRewardName ? String(body.externalRewardName) : null,
    purchaseAmount: purchaseAmount != null && Number.isFinite(purchaseAmount) ? purchaseAmount : null,
  }));

  const result = await issueVoucherUnits({
    campaignId,
    actorId: admin.userId,
    units,
    reason,
  });

  await prisma.voucherImportBatch.create({
    data: {
      campaignId,
      kind: 'ISSUE_MANUAL',
      status: result.conflicts.length ? 'COMMITTED' : 'COMMITTED',
      actorId: admin.userId,
      totalRows: units.length,
      newCount: result.created.length,
      existingCount: result.existing.length,
      conflictCount: result.conflicts.length,
      errorCount: result.conflicts.length,
      summaryJson: { reason },
    },
  });

  const res = NextResponse.json({
    success: true,
    created: result.created,
    existing: result.existing,
    conflicts: result.conflicts,
    notice: '코드 원문은 이 응답에서만 제공됩니다. 다시 확인할 수 없습니다.',
  });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
