import { NextRequest, NextResponse } from 'next/server';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';
import {
  buildIssuePreviewFromCsv,
  collectUniqueRewardNames,
} from '@/app/lib/voucher/admin-csv-issue';
import { issueVoucherUnits } from '@/app/lib/voucher/admin-issue';
import { CSV_MAX_BYTES } from '@/app/lib/voucher/csv-parse';
import { prisma } from '@/app/lib/prisma';
import type { CsvColumnMapping, RewardNameMap } from '@/app/lib/voucher/admin-csv-issue';
import {
  computeEmailPreviewStats,
  sendVoucherCodeEmails,
  WADIZ_EMAIL_CAMPAIGN_CODE,
  type VoucherEmailLine,
} from '@/app/lib/voucher/email-send';

const EMAIL_RATE_WINDOW_MS = 60_000;
const EMAIL_RATE_MAX = 5;

async function assertEmailRateLimit(actorId: string): Promise<NextResponse | null> {
  const since = new Date(Date.now() - EMAIL_RATE_WINDOW_MS);
  const count = await prisma.voucherAuditLog.count({
    where: {
      actorId,
      action: 'EMAIL_SEND',
      createdAt: { gte: since },
    },
  });
  if (count >= EMAIL_RATE_MAX) {
    return NextResponse.json(
      { error: '이메일 발송 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
  }
  return null;
}

export async function POST(request: NextRequest) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;

  const body = await request.json();
  const action = String(body.action || 'preview');
  const campaignId = String(body.campaignId || '');
  const csvText = String(body.csvText || '');
  const fileName = body.fileName ? String(body.fileName) : null;

  if (!campaignId || !csvText) {
    return NextResponse.json({ error: 'campaignId와 csvText가 필요합니다.' }, { status: 400 });
  }
  if (Buffer.byteLength(csvText, 'utf8') > CSV_MAX_BYTES) {
    return NextResponse.json({ error: '파일 크기 상한을 초과합니다.' }, { status: 400 });
  }

  if ((csvText.match(/\uFFFD/g) || []).length > 5) {
    return NextResponse.json(
      {
        error:
          '인코딩을 확인할 수 없습니다. UTF-8(BOM 가능)로 저장한 뒤 다시 올려 주세요. CP949는 현재 미지원입니다.',
      },
      { status: 400 },
    );
  }

  if (action === 'list-reward-names') {
    const header = String(body.rewardHeader || '');
    if (!header) return NextResponse.json({ error: 'rewardHeader 필요' }, { status: 400 });
    return NextResponse.json({
      success: true,
      names: collectUniqueRewardNames(csvText, header),
    });
  }

  const mapping = body.mapping as CsvColumnMapping;
  const rewardNameMap = (body.rewardNameMap || {}) as RewardNameMap;
  if (!mapping?.externalOrderId || !mapping?.rewardKey) {
    return NextResponse.json({ error: '컬럼 매핑이 필요합니다.' }, { status: 400 });
  }

  const preview = buildIssuePreviewFromCsv({
    csvText,
    mapping,
    rewardNameMap,
    rowIsOneUnit: Boolean(body.rowIsOneUnit),
  });

  const okRows = preview.previewRows.filter(
    (r): r is Extract<typeof r, { kind: 'ok' }> => r.kind === 'ok',
  );
  const emailStats = computeEmailPreviewStats(
    okRows.map((r) => ({
      externalOrderId: r.externalOrderId,
      unitIndex: r.unitIndex,
      buyerEmail: r.buyerEmail,
    })),
  );

  if (action === 'preview' || preview.errors > 0) {
    const rewards = await prisma.rewardPolicy.findMany({
      where: { campaignId, status: 'ACTIVE' },
      select: { id: true, rewardCode: true, durationMonths: true, soldPriceKrw: true },
    });
    const campaign = await prisma.voucherCampaign.findUnique({
      where: { id: campaignId },
      select: { campaignCode: true },
    });
    return NextResponse.json({
      success: true,
      preview: true,
      ...preview,
      rewards,
      emailStats,
      emailCampaignAllowed: campaign?.campaignCode === WADIZ_EMAIL_CAMPAIGN_CODE,
      canCommit: preview.errors === 0 && preview.units.length > 0,
    });
  }

  if (action !== 'commit') {
    return NextResponse.json({ error: 'action은 preview|commit|list-reward-names' }, { status: 400 });
  }
  if (!body.confirmed) {
    return NextResponse.json({ error: 'confirmed=true 가 필요합니다.' }, { status: 400 });
  }

  const sendEmails = Boolean(body.sendEmails);
  const forceResend = Boolean(body.forceResend);

  if (sendEmails) {
    const limited = await assertEmailRateLimit(admin.userId);
    if (limited) return limited;

    const campaign = await prisma.voucherCampaign.findUnique({
      where: { id: campaignId },
      select: { campaignCode: true },
    });
    if (campaign?.campaignCode !== WADIZ_EMAIL_CAMPAIGN_CODE) {
      return NextResponse.json(
        { error: '자동 이메일은 WADIZ_2026_01 캠페인만 지원합니다.' },
        { status: 400 },
      );
    }
    if (!mapping.buyerEmail) {
      return NextResponse.json(
        { error: '이메일 발송을 위해 buyerEmail 컬럼 매핑이 필요합니다.' },
        { status: 400 },
      );
    }
  }

  const result = await issueVoucherUnits({
    campaignId,
    actorId: admin.userId,
    units: preview.units,
    reason: sendEmails ? 'CSV_IMPORT_WITH_EMAIL' : 'CSV_IMPORT',
  });

  await prisma.voucherImportBatch.create({
    data: {
      campaignId,
      kind: sendEmails ? 'ISSUE_CSV_EMAIL' : 'ISSUE_CSV',
      status: 'COMMITTED',
      actorId: admin.userId,
      fileName,
      totalRows: preview.units.length,
      newCount: result.created.length,
      existingCount: result.existing.length,
      conflictCount: result.conflicts.length,
      errorCount: result.conflicts.length,
      summaryJson: {
        uniqueRewardNames: preview.uniqueRewardNames,
        mappingKeys: Object.keys(mapping),
        sendEmails,
        forceResend: sendEmails ? forceResend : false,
      },
    },
  });

  let emailResult = null;
  if (sendEmails) {
    const lines: VoucherEmailLine[] = [...result.created, ...result.existing].map((r) => ({
      voucherId: r.voucherId,
      externalOrderId: r.externalOrderId,
      unitIndex: r.unitIndex,
      voucherCode: r.voucherCode,
      buyerName: r.buyerName,
      buyerEmail: r.buyerEmail,
      externalRewardName: r.externalRewardName,
      rewardCode: r.rewardCode,
    }));

    const campaign = await prisma.voucherCampaign.findUniqueOrThrow({
      where: { id: campaignId },
      select: { campaignCode: true },
    });

    emailResult = await sendVoucherCodeEmails({
      campaignId,
      campaignCode: campaign.campaignCode,
      actorId: admin.userId,
      lines,
      forceResend,
    });
  }

  const res = NextResponse.json({
    success: true,
    committed: true,
    created: result.created,
    existing: result.existing,
    conflicts: result.conflicts,
    emailStats,
    email: emailResult,
    notice: sendEmails
      ? '발급이 확정되었습니다. 이메일 발송 결과를 확인하세요. 신규 코드 원문은 이 응답에서만 제공됩니다.'
      : '신규 코드 원문은 이 응답에서만 제공됩니다. 즉시 CSV로 저장하세요. 분실 시 재발급만 가능합니다.',
  });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
