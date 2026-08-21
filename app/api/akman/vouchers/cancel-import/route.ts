import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';
import { parseCsvText, CSV_MAX_BYTES } from '@/app/lib/voucher/csv-parse';
import { cancelVouchers, previewCancelImpact } from '@/app/lib/voucher/admin-ops';

type Mapping = {
  externalOrderId: string;
  quantity?: string | null;
  unitIndex?: string | null;
  reason?: string | null;
};

export async function POST(request: NextRequest) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;

  const body = await request.json();
  const campaignId = String(body.campaignId || '');
  const csvText = String(body.csvText || '');
  const mapping = body.mapping as Mapping;
  const previewOnly = body.action !== 'commit';
  const reasonDefault = String(body.reason || 'CANCEL_CSV').trim();

  if (!campaignId || !csvText || !mapping?.externalOrderId) {
    return NextResponse.json({ error: 'campaignId, csvText, mapping.externalOrderId 필요' }, { status: 400 });
  }
  if (Buffer.byteLength(csvText, 'utf8') > CSV_MAX_BYTES) {
    return NextResponse.json({ error: '파일 크기 상한 초과' }, { status: 400 });
  }

  const { headers, rows } = parseCsvText(csvText);
  const orderIdx = headers.indexOf(mapping.externalOrderId);
  if (orderIdx < 0) {
    return NextResponse.json({ error: '주문번호 헤더 없음' }, { status: 400 });
  }
  const qtyIdx = mapping.quantity ? headers.indexOf(mapping.quantity) : -1;
  const unitIdxCol = mapping.unitIndex ? headers.indexOf(mapping.unitIndex) : -1;
  const reasonIdx = mapping.reason ? headers.indexOf(mapping.reason) : -1;

  type Target = { voucherId: string; externalOrderId: string; unitIndex: number; status: string };
  const targets: Target[] = [];
  const ambiguous: Array<{ externalOrderId: string; message: string }> = [];
  const notFound: string[] = [];
  const errors: string[] = [];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    const externalOrderId = (row[orderIdx] ?? '').trim();
    if (!externalOrderId) {
      errors.push(`행 ${r + 2}: 빈 주문번호`);
      continue;
    }

    const vouchers = await prisma.voucher.findMany({
      where: { campaignId, externalOrderId },
      orderBy: { unitIndex: 'asc' },
    });
    if (vouchers.length === 0) {
      notFound.push(externalOrderId);
      continue;
    }

    if (unitIdxCol >= 0 && (row[unitIdxCol] ?? '').trim() !== '') {
      const ui = Number((row[unitIdxCol] ?? '').trim());
      if (!Number.isInteger(ui) || ui < 0) {
        errors.push(`행 ${r + 2}: unitIndex 오류`);
        continue;
      }
      const v = vouchers.find((x) => x.unitIndex === ui);
      if (!v) {
        notFound.push(`${externalOrderId}#${ui}`);
        continue;
      }
      targets.push({
        voucherId: v.id,
        externalOrderId,
        unitIndex: v.unitIndex,
        status: v.status,
      });
      continue;
    }

    if (qtyIdx >= 0 && (row[qtyIdx] ?? '').trim() !== '') {
      const qty = Number((row[qtyIdx] ?? '').trim());
      if (!Number.isInteger(qty) || qty < 1) {
        errors.push(`행 ${r + 2}: quantity 오류`);
        continue;
      }
      if (qty < vouchers.length) {
        ambiguous.push({
          externalOrderId,
          message: `부분수량 취소(${qty}/${vouchers.length})인데 unitIndex가 없습니다. 취소할 구매단위를 지정하세요.`,
        });
        continue;
      }
    }

    // full order cancel
    for (const v of vouchers) {
      targets.push({
        voucherId: v.id,
        externalOrderId,
        unitIndex: v.unitIndex,
        status: v.status,
      });
    }

    void reasonIdx;
  }

  const uniqueIds = [...new Set(targets.map((t) => t.voucherId))];
  const impact = await previewCancelImpact(uniqueIds);

  if (previewOnly || errors.length || ambiguous.length) {
    return NextResponse.json({
      success: true,
      preview: true,
      canCommit: errors.length === 0 && ambiguous.length === 0 && uniqueIds.length > 0,
      targets: targets.map((t) => ({ ...t })),
      ambiguous,
      notFound,
      errors,
      impact,
      counts: {
        issued: targets.filter((t) => t.status === 'ISSUED').length,
        redeemed: targets.filter((t) => t.status === 'REDEEMED').length,
        alreadyCancelled: targets.filter((t) => t.status === 'CANCELLED').length,
      },
    });
  }

  if (!body.confirmed) {
    return NextResponse.json({ error: 'confirmed=true 필요' }, { status: 400 });
  }

  const result = await cancelVouchers({
    voucherIds: uniqueIds,
    actorId: admin.userId,
    reason: reasonDefault,
  });

  await prisma.voucherImportBatch.create({
    data: {
      campaignId,
      kind: 'CANCEL_CSV',
      status: 'COMMITTED',
      actorId: admin.userId,
      totalRows: rows.length,
      cancelledCount: result.cancelledIssued + result.revokedRedeemed,
      errorCount: result.skipped,
      summaryJson: { notFoundCount: notFound.length },
    },
  });

  return NextResponse.json({ success: true, committed: true, ...result });
}
