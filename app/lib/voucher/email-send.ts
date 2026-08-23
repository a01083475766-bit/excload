import { createHash } from 'crypto';
import { prisma } from '@/app/lib/prisma';
import { hashVoucherCode } from '@/app/lib/voucher/code-crypto';
import { resolveVoucherRewardDisplayName, VOUCHER_STATUS } from '@/app/lib/voucher/constants';
import {
  createMockVoucherEmailProvider,
  type VoucherEmailProvider,
} from '@/app/lib/voucher/email-provider';
import {
  buildWadizVoucherEmail,
  maskBuyerEmailForUi,
} from '@/app/lib/voucher/email-template';
import { isValidContactEmail } from '@/app/lib/contact-inquiry';

/** Auto-email만 허용하는 캠페인 */
export const WADIZ_EMAIL_CAMPAIGN_CODE = 'WADIZ_2026_01';

export const EMAIL_SEND_STATUS = {
  SENT: 'SENT',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;

export type EmailSendStatus = (typeof EMAIL_SEND_STATUS)[keyof typeof EMAIL_SEND_STATUS];

export type VoucherEmailLine = {
  voucherId: string;
  externalOrderId: string;
  unitIndex: number;
  voucherCode: string;
  buyerName: string | null;
  buyerEmail: string | null;
  externalRewardName: string | null;
  rewardCode: string;
};

export type EmailPreviewStats = {
  buyerCount: number;
  codeCount: number;
  emailEligibleCount: number;
  emailInvalidCount: number;
  invalidRows: Array<{
    externalOrderId: string;
    unitIndex: number;
    reason: string;
  }>;
};

export type EmailSendGroupResult = {
  status: EmailSendStatus;
  recipientEmailMasked: string;
  externalOrderIds: string[];
  voucherIds: string[];
  codeLast4s: string[];
  providerMessageId: string | null;
  errorCode: string | null;
  sentAt: string | null;
};

export type SendVoucherEmailsResult = {
  sent: number;
  failed: number;
  skipped: number;
  groups: EmailSendGroupResult[];
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashRecipientEmail(email: string): string {
  return createHash('sha256').update(normalizeEmail(email), 'utf8').digest('hex');
}

export function isValidBuyerEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  return isValidContactEmail(email.trim());
}

/** Preview-only: never sends mail */
export function computeEmailPreviewStats(
  rows: Array<{
    externalOrderId: string;
    unitIndex: number;
    buyerEmail: string | null;
  }>,
): EmailPreviewStats {
  const buyerKeys = new Set<string>();
  const invalidRows: EmailPreviewStats['invalidRows'] = [];
  let emailEligibleCount = 0;
  let emailInvalidCount = 0;

  for (const row of rows) {
    const email = row.buyerEmail?.trim() || '';
    if (!email) {
      emailInvalidCount += 1;
      invalidRows.push({
        externalOrderId: row.externalOrderId,
        unitIndex: row.unitIndex,
        reason: 'EMAIL_MISSING',
      });
      continue;
    }
    if (!isValidBuyerEmail(email)) {
      emailInvalidCount += 1;
      invalidRows.push({
        externalOrderId: row.externalOrderId,
        unitIndex: row.unitIndex,
        reason: 'EMAIL_INVALID',
      });
      continue;
    }
    emailEligibleCount += 1;
    buyerKeys.add(normalizeEmail(email));
  }

  const withAnyEmail = new Set(
    rows
      .map((r) => (r.buyerEmail?.trim() ? normalizeEmail(r.buyerEmail) : ''))
      .filter(Boolean),
  );

  return {
    buyerCount: Math.max(buyerKeys.size, withAnyEmail.size),
    codeCount: rows.length,
    emailEligibleCount,
    emailInvalidCount,
    invalidRows: invalidRows.slice(0, 200),
  };
}

type GroupBucket = {
  email: string;
  buyerName: string | null;
  lines: VoucherEmailLine[];
};

function groupLinesByEmail(lines: VoucherEmailLine[]): {
  groups: GroupBucket[];
  invalid: Array<{ line: VoucherEmailLine; reason: string }>;
} {
  const map = new Map<string, GroupBucket>();
  const invalid: Array<{ line: VoucherEmailLine; reason: string }> = [];

  for (const line of lines) {
    const raw = line.buyerEmail?.trim() || '';
    if (!raw) {
      invalid.push({ line, reason: 'EMAIL_MISSING' });
      continue;
    }
    if (!isValidBuyerEmail(raw)) {
      invalid.push({ line, reason: 'EMAIL_INVALID' });
      continue;
    }
    const key = normalizeEmail(raw);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        email: key,
        buyerName: line.buyerName,
        lines: [line],
      });
    } else {
      existing.lines.push(line);
      if (!existing.buyerName && line.buyerName) existing.buyerName = line.buyerName;
    }
  }

  return { groups: [...map.values()], invalid };
}

/** Reject if a single group somehow has mixed emails (defensive). */
export function assertGroupEmailConsistency(group: {
  email: string;
  lines: Array<{ buyerEmail: string | null }>;
}): string | null {
  const emails = new Set(
    group.lines.map((l) => (l.buyerEmail || '').trim().toLowerCase()).filter(Boolean),
  );
  if (emails.size === 0) return 'EMAIL_MISSING';
  if (emails.size > 1) return 'MIXED_BUYER_EMAIL';
  if ([...emails][0] !== group.email) return 'MIXED_BUYER_EMAIL';
  return null;
}

async function findAlreadySentVoucherIds(
  campaignId: string,
  voucherIds: string[],
): Promise<Set<string>> {
  if (voucherIds.length === 0) return new Set();
  const rows = await prisma.voucherEmailSend.findMany({
    where: {
      campaignId,
      status: EMAIL_SEND_STATUS.SENT,
    },
    select: { voucherIds: true },
  });
  const sent = new Set<string>();
  for (const row of rows) {
    const ids = Array.isArray(row.voucherIds) ? (row.voucherIds as string[]) : [];
    for (const id of ids) {
      if (voucherIds.includes(id)) sent.add(id);
    }
  }
  return sent;
}

async function verifyLineAgainstDb(
  campaignId: string,
  line: VoucherEmailLine,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!line.voucherCode?.trim()) {
    return { ok: false, reason: 'NO_PLAINTEXT' };
  }
  let codeHash: string;
  try {
    codeHash = hashVoucherCode(line.voucherCode);
  } catch {
    return { ok: false, reason: 'HASH_ERROR' };
  }

  const voucher = await prisma.voucher.findUnique({
    where: { codeHash },
    select: {
      id: true,
      campaignId: true,
      externalOrderId: true,
      unitIndex: true,
      status: true,
    },
  });
  if (!voucher) return { ok: false, reason: 'CODE_MISMATCH' };
  if (voucher.id !== line.voucherId) return { ok: false, reason: 'VOUCHER_ID_MISMATCH' };
  if (voucher.campaignId !== campaignId) return { ok: false, reason: 'CAMPAIGN_MISMATCH' };
  if (voucher.externalOrderId !== line.externalOrderId) {
    return { ok: false, reason: 'ORDER_MISMATCH' };
  }
  if (voucher.unitIndex !== line.unitIndex) return { ok: false, reason: 'UNIT_MISMATCH' };
  if (
    voucher.status === VOUCHER_STATUS.CANCELLED ||
    voucher.status === VOUCHER_STATUS.EXPIRED
  ) {
    return { ok: false, reason: 'CANCELLED' };
  }
  return { ok: true };
}

function makeDedupeKey(campaignId: string, voucherIds: string[], forceResend: boolean): string {
  const base = createHash('sha256')
    .update(`${campaignId}|${[...voucherIds].sort().join(',')}`, 'utf8')
    .digest('hex');
  if (!forceResend) return base;
  return createHash('sha256')
    .update(`${base}|force|${Date.now()}|${Math.random()}`, 'utf8')
    .digest('hex');
}

/**
 * Send voucher codes by email. Groups by buyer email.
 * Never logs plaintext codes or full email addresses.
 */
export async function sendVoucherCodeEmails(input: {
  campaignId: string;
  campaignCode: string;
  actorId: string;
  lines: VoucherEmailLine[];
  forceResend?: boolean;
  provider?: VoucherEmailProvider;
  /** Injected for tests */
  now?: Date;
}): Promise<SendVoucherEmailsResult> {
  if (input.campaignCode !== WADIZ_EMAIL_CAMPAIGN_CODE) {
    return {
      sent: 0,
      failed: 0,
      skipped: input.lines.length,
      groups: [
        {
          status: EMAIL_SEND_STATUS.SKIPPED,
          recipientEmailMasked: '—',
          externalOrderIds: [],
          voucherIds: [],
          codeLast4s: [],
          providerMessageId: null,
          errorCode: 'CAMPAIGN_NOT_ALLOWED',
          sentAt: null,
        },
      ],
    };
  }

  const campaign = await prisma.voucherCampaign.findUnique({
    where: { id: input.campaignId },
    select: { id: true, campaignCode: true, redeemFrom: true },
  });
  if (!campaign || campaign.campaignCode !== WADIZ_EMAIL_CAMPAIGN_CODE) {
    return {
      sent: 0,
      failed: 0,
      skipped: input.lines.length,
      groups: [
        {
          status: EMAIL_SEND_STATUS.SKIPPED,
          recipientEmailMasked: '—',
          externalOrderIds: [],
          voucherIds: [],
          codeLast4s: [],
          providerMessageId: null,
          errorCode: 'CAMPAIGN_NOT_FOUND',
          sentAt: null,
        },
      ],
    };
  }

  const provider = input.provider ?? (await getDefaultVoucherEmailProvider());
  const forceResend = Boolean(input.forceResend);
  const { groups, invalid } = groupLinesByEmail(input.lines);

  const results: EmailSendGroupResult[] = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const inv of invalid) {
    skipped += 1;
    results.push({
      status: EMAIL_SEND_STATUS.SKIPPED,
      recipientEmailMasked: maskBuyerEmailForUi(inv.line.buyerEmail),
      externalOrderIds: [inv.line.externalOrderId],
      voucherIds: [inv.line.voucherId],
      codeLast4s: [],
      providerMessageId: null,
      errorCode: inv.reason,
      sentAt: null,
    });
  }

  const allVoucherIds = groups.flatMap((g) => g.lines.map((l) => l.voucherId));
  const alreadySent = forceResend
    ? new Set<string>()
    : await findAlreadySentVoucherIds(input.campaignId, allVoucherIds);

  for (const group of groups) {
    const mix = assertGroupEmailConsistency(group);
    if (mix) {
      skipped += group.lines.length;
      results.push({
        status: EMAIL_SEND_STATUS.SKIPPED,
        recipientEmailMasked: maskBuyerEmailForUi(group.email),
        externalOrderIds: [...new Set(group.lines.map((l) => l.externalOrderId))],
        voucherIds: group.lines.map((l) => l.voucherId),
        codeLast4s: [],
        providerMessageId: null,
        errorCode: mix,
        sentAt: null,
      });
      continue;
    }

    const pendingLines: VoucherEmailLine[] = [];
    for (const line of group.lines) {
      if (!forceResend && alreadySent.has(line.voucherId)) {
        skipped += 1;
        results.push({
          status: EMAIL_SEND_STATUS.SKIPPED,
          recipientEmailMasked: maskBuyerEmailForUi(group.email),
          externalOrderIds: [line.externalOrderId],
          voucherIds: [line.voucherId],
          codeLast4s: [],
          providerMessageId: null,
          errorCode: 'ALREADY_SENT',
          sentAt: null,
        });
        continue;
      }
      const verified = await verifyLineAgainstDb(input.campaignId, line);
      if (!verified.ok) {
        skipped += 1;
        results.push({
          status: EMAIL_SEND_STATUS.SKIPPED,
          recipientEmailMasked: maskBuyerEmailForUi(group.email),
          externalOrderIds: [line.externalOrderId],
          voucherIds: [line.voucherId],
          codeLast4s: [],
          providerMessageId: null,
          errorCode: verified.reason,
          sentAt: null,
        });
        continue;
      }
      pendingLines.push(line);
    }

    if (pendingLines.length === 0) continue;

    const voucherIds = pendingLines.map((l) => l.voucherId);
    const externalOrderIds = [...new Set(pendingLines.map((l) => l.externalOrderId))];
    const codeLast4s = pendingLines.map((l) => {
      const parts = l.voucherCode.replace(/-/g, '');
      return parts.slice(-4);
    });
    const emailHash = hashRecipientEmail(group.email);
    const masked = maskBuyerEmailForUi(group.email);
    const dedupeKey = makeDedupeKey(input.campaignId, voucherIds, forceResend);

    const content = buildWadizVoucherEmail({
      buyerName: group.buyerName,
      redeemFrom: campaign.redeemFrom,
      now: input.now,
      codes: pendingLines.map((l) => ({
        externalOrderId: l.externalOrderId,
        unitIndex: l.unitIndex,
        rewardLabel: resolveVoucherRewardDisplayName(l.rewardCode, l.externalRewardName),
        voucherCode: l.voucherCode,
      })),
    });

    let sendRowId: string | null = null;
    try {
      const row = await prisma.voucherEmailSend.create({
        data: {
          campaignId: input.campaignId,
          dedupeKey,
          groupKey: emailHash,
          recipientEmailHash: emailHash,
          recipientEmailMasked: masked,
          status: 'PENDING',
          voucherIds,
          externalOrderIds,
          codeLast4s,
          actorId: input.actorId,
          forceResend,
        },
      });
      sendRowId = row.id;
    } catch (e: unknown) {
      const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
      if (code === 'P2002' && !forceResend) {
        skipped += pendingLines.length;
        results.push({
          status: EMAIL_SEND_STATUS.SKIPPED,
          recipientEmailMasked: masked,
          externalOrderIds,
          voucherIds,
          codeLast4s,
          providerMessageId: null,
          errorCode: 'DUPLICATE_REQUEST',
          sentAt: null,
        });
        continue;
      }
      failed += pendingLines.length;
      results.push({
        status: EMAIL_SEND_STATUS.FAILED,
        recipientEmailMasked: masked,
        externalOrderIds,
        voucherIds,
        codeLast4s,
        providerMessageId: null,
        errorCode: 'RECORD_CREATE_FAILED',
        sentAt: null,
      });
      continue;
    }

    const providerResult = await provider.send({
      to: group.email,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });

    if (providerResult.ok) {
      const sentAt = new Date();
      await prisma.voucherEmailSend.update({
        where: { id: sendRowId },
        data: {
          status: EMAIL_SEND_STATUS.SENT,
          providerMessageId: providerResult.messageId,
          sentAt,
          errorCode: null,
        },
      });
      await prisma.voucherAuditLog.create({
        data: {
          actorId: input.actorId,
          action: 'EMAIL_SEND',
          result: 'SUCCESS',
          reason: forceResend ? 'FORCE_RESEND' : 'CSV_ISSUE',
          meta: {
            campaignId: input.campaignId,
            sendId: sendRowId,
            voucherCount: voucherIds.length,
            orderCount: externalOrderIds.length,
            emailMasked: masked,
            // no plaintext codes, no full email
          },
        },
      });
      sent += pendingLines.length;
      results.push({
        status: EMAIL_SEND_STATUS.SENT,
        recipientEmailMasked: masked,
        externalOrderIds,
        voucherIds,
        codeLast4s,
        providerMessageId: providerResult.messageId,
        errorCode: null,
        sentAt: sentAt.toISOString(),
      });
    } else {
      await prisma.voucherEmailSend.update({
        where: { id: sendRowId },
        data: {
          status: EMAIL_SEND_STATUS.FAILED,
          errorCode: providerResult.errorCode,
          providerMessageId: null,
        },
      });
      await prisma.voucherAuditLog.create({
        data: {
          actorId: input.actorId,
          action: 'EMAIL_SEND',
          result: 'FAILED',
          reason: providerResult.errorCode,
          meta: {
            campaignId: input.campaignId,
            sendId: sendRowId,
            voucherCount: voucherIds.length,
            emailMasked: masked,
          },
        },
      });
      failed += pendingLines.length;
      results.push({
        status: EMAIL_SEND_STATUS.FAILED,
        recipientEmailMasked: masked,
        externalOrderIds,
        voucherIds,
        codeLast4s,
        providerMessageId: null,
        errorCode: providerResult.errorCode,
        sentAt: null,
      });
    }
  }

  return { sent, failed, skipped, groups: results };
}

async function getDefaultVoucherEmailProvider(): Promise<VoucherEmailProvider> {
  const { createResendVoucherEmailProvider } = await import(
    '@/app/lib/voucher/email-resend-adapter'
  );
  return createResendVoucherEmailProvider();
}

/** Test helper re-export */
export { createMockVoucherEmailProvider };
