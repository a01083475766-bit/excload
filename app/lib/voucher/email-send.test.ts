import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertGroupEmailConsistency,
  computeEmailPreviewStats,
  createMockVoucherEmailProvider,
  hashRecipientEmail,
  isValidBuyerEmail,
  sendVoucherCodeEmails,
  WADIZ_EMAIL_CAMPAIGN_CODE,
} from '@/app/lib/voucher/email-send';
import {
  buildWadizVoucherEmail,
  escapeHtml,
  redeemAvailabilityMessage,
  WADIZ_VOUCHER_EMAIL_SUBJECT,
} from '@/app/lib/voucher/email-template';
import { hashVoucherCode } from '@/app/lib/voucher/code-crypto';
import { buildIssuePreviewFromCsv } from '@/app/lib/voucher/admin-csv-issue';

vi.mock('@/app/lib/prisma', () => {
  const voucherEmailSend = {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const voucher = { findUnique: vi.fn() };
  const voucherCampaign = { findUnique: vi.fn() };
  const voucherAuditLog = { create: vi.fn(), count: vi.fn() };
  return {
    prisma: {
      voucherEmailSend,
      voucher,
      voucherCampaign,
      voucherAuditLog,
    },
  };
});

import { prisma } from '@/app/lib/prisma';

const campaignId = 'camp_wadiz';
const actorId = 'actor_1';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VOUCHER_CODE_HMAC_SECRET = 'test-voucher-hmac-secret-32chars-min!!';
  vi.mocked(prisma.voucherCampaign.findUnique).mockResolvedValue({
    id: campaignId,
    campaignCode: WADIZ_EMAIL_CAMPAIGN_CODE,
    redeemFrom: new Date('2026-09-30T15:00:00.000Z'),
  } as never);
  vi.mocked(prisma.voucherEmailSend.findMany).mockResolvedValue([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (prisma.voucherEmailSend.create as any).mockImplementation(async ({ data }: { data: object }) => ({
    id: 'send_1',
    ...data,
  }));
  vi.mocked(prisma.voucherEmailSend.update).mockResolvedValue({} as never);
  vi.mocked(prisma.voucherAuditLog.create).mockResolvedValue({} as never);
});

describe('email preview / validation', () => {
  it('flags missing and invalid emails', () => {
    const stats = computeEmailPreviewStats([
      { externalOrderId: 'A', unitIndex: 0, buyerEmail: 'a@example.com' },
      { externalOrderId: 'B', unitIndex: 0, buyerEmail: null },
      { externalOrderId: 'C', unitIndex: 0, buyerEmail: 'not-an-email' },
    ]);
    expect(stats.codeCount).toBe(3);
    expect(stats.emailEligibleCount).toBe(1);
    expect(stats.emailInvalidCount).toBe(2);
    expect(stats.invalidRows.map((r) => r.reason)).toEqual(['EMAIL_MISSING', 'EMAIL_INVALID']);
  });

  it('isValidBuyerEmail', () => {
    expect(isValidBuyerEmail('a@b.co')).toBe(true);
    expect(isValidBuyerEmail('')).toBe(false);
    expect(isValidBuyerEmail('x')).toBe(false);
  });

  it('hashRecipientEmail is stable and not plaintext', () => {
    const h = hashRecipientEmail('User@Example.com');
    expect(h).toBe(createHash('sha256').update('user@example.com', 'utf8').digest('hex'));
    expect(h.includes('@')).toBe(false);
  });
});

describe('email template', () => {
  it('escapes html and includes required copy', () => {
    const built = buildWadizVoucherEmail({
      buyerName: '<script>x</script>',
      redeemFrom: new Date('2026-09-30T15:00:00.000Z'),
      now: new Date('2026-08-01T00:00:00.000Z'),
      codes: [
        {
          externalOrderId: 'ORD1',
          unitIndex: 0,
          rewardLabel: '3개월',
          voucherCode: 'ABCD-EFGH-IJKL-MNOP',
        },
      ],
    });
    expect(built.subject).toBe(WADIZ_VOUCHER_EMAIL_SUBJECT);
    expect(built.html).toContain(escapeHtml('<script>x</script>'));
    expect(built.html).not.toContain('<script>x</script>');
    expect(built.text).toContain('2026년 10월 1일부터 등록할 수 있습니다');
    expect(built.text).toContain('https://www.excload.com/redeem/wadiz-2026-01');
    expect(built.text).toContain('이용권 등록하기');
    expect(built.text).toContain('code=ABCD-EFGH-IJKL-MNOP');
    expect(built.html).toContain('이용권 등록하기');
    expect(built.html).not.toContain('등록 페이지 열기');
    expect(built.html).not.toMatch(/>\s*복사\s*</);
    expect(built.html).toContain('code=ABCD-EFGH-IJKL-MNOP');
    expect(built.html).toContain('border:1px solid #d4d4d8');
    expect(built.text).toContain('오픈 베타');
    expect(redeemAvailabilityMessage(new Date('2020-01-01T00:00:00.000Z'), new Date())).toBe(
      '지금 등록할 수 있습니다',
    );
  });
});

describe('csv buyer fields flow into units', () => {
  it('passes buyerName/buyerEmail into issue units', () => {
    const csv = ['주문번호,리워드,수량,이름,이메일', 'ORD-9,리워드A,2,홍길동,hong@example.com'].join(
      '\n',
    );
    const preview = buildIssuePreviewFromCsv({
      csvText: csv,
      mapping: {
        externalOrderId: '주문번호',
        rewardKey: '리워드',
        quantity: '수량',
        buyerName: '이름',
        buyerEmail: '이메일',
      },
      rewardNameMap: { 리워드A: 'policy-1' },
    });
    expect(preview.errors).toBe(0);
    expect(preview.units).toHaveLength(2);
    expect(preview.units.every((u) => u.buyerEmail === 'hong@example.com')).toBe(true);
    expect(preview.units.every((u) => u.buyerName === '홍길동')).toBe(true);
  });
});

describe('sendVoucherCodeEmails', () => {
  function mockVoucherMatch(line: {
    voucherId: string;
    externalOrderId: string;
    unitIndex: number;
    voucherCode: string;
    status?: string;
  }) {
    const codeHash = hashVoucherCode(line.voucherCode);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.voucher.findUnique as any).mockImplementation(async ({ where }: { where: { codeHash?: string } }) => {
      if ('codeHash' in where && where.codeHash === codeHash) {
        return {
          id: line.voucherId,
          campaignId,
          externalOrderId: line.externalOrderId,
          unitIndex: line.unitIndex,
          status: line.status || 'ISSUED',
        };
      }
      return null;
    });
  }

  it('sends single code email (mock provider)', async () => {
    const code = 'AAAA-BBBB-CCCC-DDDD';
    mockVoucherMatch({
      voucherId: 'v1',
      externalOrderId: 'O1',
      unitIndex: 0,
      voucherCode: code,
    });
    const provider = createMockVoucherEmailProvider();
    const result = await sendVoucherCodeEmails({
      campaignId,
      campaignCode: WADIZ_EMAIL_CAMPAIGN_CODE,
      actorId,
      provider,
      lines: [
        {
          voucherId: 'v1',
          externalOrderId: 'O1',
          unitIndex: 0,
          voucherCode: code,
          buyerName: 'Kim',
          buyerEmail: 'kim@example.com',
          externalRewardName: '3개월',
          rewardCode: 'SUPER_EARLY_3M',
        },
      ],
    });
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]!.to).toBe('kim@example.com');
    expect(provider.sent[0]!.text).toContain(code);
  });

  it('bundles multiple codes for same buyer into one email', async () => {
    const c1 = 'AAAA-BBBB-CCCC-1111';
    const c2 = 'AAAA-BBBB-CCCC-2222';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.voucher.findUnique as any).mockImplementation(async ({ where }: { where: { codeHash?: string } }) => {
      const hash1 = hashVoucherCode(c1);
      const hash2 = hashVoucherCode(c2);
      if ('codeHash' in where && where.codeHash === hash1) {
        return {
          id: 'v1',
          campaignId,
          externalOrderId: 'O1',
          unitIndex: 0,
          status: 'ISSUED',
        };
      }
      if ('codeHash' in where && where.codeHash === hash2) {
        return {
          id: 'v2',
          campaignId,
          externalOrderId: 'O1',
          unitIndex: 1,
          status: 'ISSUED',
        };
      }
      return null;
    });
    const provider = createMockVoucherEmailProvider();
    const result = await sendVoucherCodeEmails({
      campaignId,
      campaignCode: WADIZ_EMAIL_CAMPAIGN_CODE,
      actorId,
      provider,
      lines: [
        {
          voucherId: 'v1',
          externalOrderId: 'O1',
          unitIndex: 0,
          voucherCode: c1,
          buyerName: 'Kim',
          buyerEmail: 'kim@example.com',
          externalRewardName: '3개월',
          rewardCode: 'R3',
        },
        {
          voucherId: 'v2',
          externalOrderId: 'O1',
          unitIndex: 1,
          voucherCode: c2,
          buyerName: 'Kim',
          buyerEmail: 'kim@example.com',
          externalRewardName: '3개월',
          rewardCode: 'R3',
        },
      ],
    });
    expect(result.sent).toBe(2);
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]!.text).toContain(c1);
    expect(provider.sent[0]!.text).toContain(c2);
  });

  it('skips missing/invalid email without sending', async () => {
    const provider = createMockVoucherEmailProvider();
    const result = await sendVoucherCodeEmails({
      campaignId,
      campaignCode: WADIZ_EMAIL_CAMPAIGN_CODE,
      actorId,
      provider,
      lines: [
        {
          voucherId: 'v1',
          externalOrderId: 'O1',
          unitIndex: 0,
          voucherCode: 'AAAA-BBBB-CCCC-DDDD',
          buyerName: null,
          buyerEmail: null,
          externalRewardName: null,
          rewardCode: 'R',
        },
        {
          voucherId: 'v2',
          externalOrderId: 'O2',
          unitIndex: 0,
          voucherCode: 'AAAA-BBBB-CCCC-EEEE',
          buyerName: null,
          buyerEmail: 'bad',
          externalRewardName: null,
          rewardCode: 'R',
        },
      ],
    });
    expect(result.skipped).toBe(2);
    expect(provider.sent).toHaveLength(0);
  });

  it('skips already-sent vouchers on re-upload (idempotent)', async () => {
    const code = 'AAAA-BBBB-CCCC-FFFF';
    mockVoucherMatch({
      voucherId: 'v1',
      externalOrderId: 'O1',
      unitIndex: 0,
      voucherCode: code,
    });
    vi.mocked(prisma.voucherEmailSend.findMany).mockResolvedValue([
      { voucherIds: ['v1'] },
    ] as never);
    const provider = createMockVoucherEmailProvider();
    const result = await sendVoucherCodeEmails({
      campaignId,
      campaignCode: WADIZ_EMAIL_CAMPAIGN_CODE,
      actorId,
      provider,
      lines: [
        {
          voucherId: 'v1',
          externalOrderId: 'O1',
          unitIndex: 0,
          voucherCode: code,
          buyerName: 'Kim',
          buyerEmail: 'kim@example.com',
          externalRewardName: '3m',
          rewardCode: 'R',
        },
      ],
    });
    expect(result.skipped).toBe(1);
    expect(result.groups[0]?.errorCode).toBe('ALREADY_SENT');
    expect(provider.sent).toHaveLength(0);
  });

  it('blocks cancelled vouchers', async () => {
    const code = 'AAAA-BBBB-CCCC-ZZZZ';
    mockVoucherMatch({
      voucherId: 'v1',
      externalOrderId: 'O1',
      unitIndex: 0,
      voucherCode: code,
      status: 'CANCELLED',
    });
    const provider = createMockVoucherEmailProvider();
    const result = await sendVoucherCodeEmails({
      campaignId,
      campaignCode: WADIZ_EMAIL_CAMPAIGN_CODE,
      actorId,
      provider,
      lines: [
        {
          voucherId: 'v1',
          externalOrderId: 'O1',
          unitIndex: 0,
          voucherCode: code,
          buyerName: 'Kim',
          buyerEmail: 'kim@example.com',
          externalRewardName: '3m',
          rewardCode: 'R',
        },
      ],
    });
    expect(result.skipped).toBe(1);
    expect(result.groups[0]?.errorCode).toBe('CANCELLED');
    expect(provider.sent).toHaveLength(0);
  });

  it('rejects HMAC / order mismatch (mixed foreign code)', async () => {
    const code = 'AAAA-BBBB-CCCC-MMMM';
    vi.mocked(prisma.voucher.findUnique).mockResolvedValue({
      id: 'v1',
      campaignId,
      externalOrderId: 'OTHER-ORDER',
      unitIndex: 0,
      status: 'ISSUED',
    } as never);
    const provider = createMockVoucherEmailProvider();
    const result = await sendVoucherCodeEmails({
      campaignId,
      campaignCode: WADIZ_EMAIL_CAMPAIGN_CODE,
      actorId,
      provider,
      lines: [
        {
          voucherId: 'v1',
          externalOrderId: 'O1',
          unitIndex: 0,
          voucherCode: code,
          buyerName: 'Kim',
          buyerEmail: 'kim@example.com',
          externalRewardName: '3m',
          rewardCode: 'R',
        },
      ],
    });
    expect(result.skipped).toBe(1);
    expect(result.groups[0]?.errorCode).toBe('ORDER_MISMATCH');
    expect(provider.sent).toHaveLength(0);
  });

  it('records provider failure as FAILED', async () => {
    const code = 'AAAA-BBBB-CCCC-FAIL';
    mockVoucherMatch({
      voucherId: 'v1',
      externalOrderId: 'O1',
      unitIndex: 0,
      voucherCode: code,
    });
    const provider = createMockVoucherEmailProvider({
      failEmails: new Set(['fail@example.com']),
    });
    const result = await sendVoucherCodeEmails({
      campaignId,
      campaignCode: WADIZ_EMAIL_CAMPAIGN_CODE,
      actorId,
      provider,
      lines: [
        {
          voucherId: 'v1',
          externalOrderId: 'O1',
          unitIndex: 0,
          voucherCode: code,
          buyerName: 'Kim',
          buyerEmail: 'fail@example.com',
          externalRewardName: '3m',
          rewardCode: 'R',
        },
      ],
    });
    expect(result.failed).toBe(1);
    expect(result.groups.some((g) => g.status === 'FAILED')).toBe(true);
  });

  it('skips non-wadiz campaign entirely', async () => {
    const provider = createMockVoucherEmailProvider();
    const result = await sendVoucherCodeEmails({
      campaignId,
      campaignCode: 'OTHER',
      actorId,
      provider,
      lines: [
        {
          voucherId: 'v1',
          externalOrderId: 'O1',
          unitIndex: 0,
          voucherCode: 'AAAA-BBBB-CCCC-DDDD',
          buyerName: 'Kim',
          buyerEmail: 'kim@example.com',
          externalRewardName: '3m',
          rewardCode: 'R',
        },
      ],
    });
    expect(result.groups[0]?.errorCode).toBe('CAMPAIGN_NOT_ALLOWED');
    expect(provider.sent).toHaveLength(0);
  });

  it('detects mixed buyer emails in a group', () => {
    expect(
      assertGroupEmailConsistency({
        email: 'a@example.com',
        lines: [
          { buyerEmail: 'a@example.com' },
          { buyerEmail: 'b@example.com' },
        ],
      }),
    ).toBe('MIXED_BUYER_EMAIL');
  });

  it('does not put full email or codes into audit meta', async () => {
    const code = 'AAAA-BBBB-CCCC-SAFE';
    mockVoucherMatch({
      voucherId: 'v1',
      externalOrderId: 'O1',
      unitIndex: 0,
      voucherCode: code,
    });
    const provider = createMockVoucherEmailProvider();
    await sendVoucherCodeEmails({
      campaignId,
      campaignCode: WADIZ_EMAIL_CAMPAIGN_CODE,
      actorId,
      provider,
      lines: [
        {
          voucherId: 'v1',
          externalOrderId: 'O1',
          unitIndex: 0,
          voucherCode: code,
          buyerName: 'Kim',
          buyerEmail: 'secret.buyer@example.com',
          externalRewardName: '3m',
          rewardCode: 'R',
        },
      ],
    });
    const auditArg = vi.mocked(prisma.voucherAuditLog.create).mock.calls[0]?.[0]?.data as {
      meta?: Record<string, unknown>;
    };
    const metaStr = JSON.stringify(auditArg?.meta ?? {});
    expect(metaStr).not.toContain('secret.buyer@example.com');
    expect(metaStr).not.toContain(code);
    expect(metaStr).toContain('emailMasked');
  });
});
