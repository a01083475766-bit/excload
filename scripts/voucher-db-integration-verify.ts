/**
 * Isolated smoke-DB integration checks for external voucher 1+2.
 * Expects DATABASE_URL/DIRECT_URL already pointing at TEST smoke DB.
 * Cleanup only rows tagged with voucher_test_ prefix.
 */
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';

import { issueVoucherUnits } from '../app/lib/voucher/admin-issue';
import { cancelVouchers, reissueVoucherCode } from '../app/lib/voucher/admin-ops';
import {
  adjustVoucherEntitlementDates,
  transferRedeemedVoucher,
} from '../app/lib/voucher/admin-transfer-adjust';
import {
  buildIssuePreviewFromCsv,
} from '../app/lib/voucher/admin-csv-issue';
import { buildCsvWithBom, sanitizeCsvCell } from '../app/lib/voucher/csv-parse';
import { redeemVoucherCode } from '../app/lib/voucher/redeem';
import { resolveVoucherEntitlementsForUser } from '../app/lib/voucher/resolve-entitlements';
import { getEffectiveUserAccess } from '../app/lib/entitlement/effective-access';
import {
  canStartPaidCheckout,
  getEffectivePlanForPolicy,
  isOpenBetaMode,
} from '../app/lib/open-beta-policy';
import { getOpenBetaEndsAt } from '../app/lib/service-lifecycle';
import { isAdminEmail } from '../app/lib/admin-auth';
import { VOUCHER_SOURCE } from '../app/lib/voucher/constants';

const PREFIX = 'voucher_test_';
const results: Record<string, unknown> = {};
const failures: string[] = [];

function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures.push(msg);
    console.error(`  ??${msg}`);
  } else {
    console.log(`  ??${msg}`);
  }
}

function containsPlaintext(hay: unknown, plaintext: string): boolean {
  return JSON.stringify(hay ?? null).includes(plaintext);
}

async function main() {
  if (!process.env.VOUCHER_CODE_HMAC_SECRET || process.env.VOUCHER_CODE_HMAC_SECRET.length < 32) {
    throw new Error('VOUCHER_CODE_HMAC_SECRET missing for test');
  }
  const blob = `${process.env.DATABASE_URL}\n${process.env.DIRECT_URL}`;
  if (blob.includes('xtlgtphceakmzmtqihnn')) {
    throw new Error('Refusing PRODUCTION DB');
  }
  if (!blob.includes('qejjcjwbnxhmhcgwrbvt')) {
    throw new Error('Refusing non-TEST DB (missing test ref)');
  }
  if (process.env.ALLOW_TEST_DB_MUTATION !== 'true') {
    throw new Error('ALLOW_TEST_DB_MUTATION must be true');
  }

  const prisma = new PrismaClient();
  const runId = `${PREFIX}${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
  console.log(`[IT] runId=${runId}`);

  const actor = await prisma.user.create({
    data: {
      email: `${runId}_actor@example.invalid`,
      passwordHash: createHash('sha256').update('x').digest('hex'),
      plan: 'FREE',
      points: 0,
    },
  });

  try {
    // --- Seed campaign verification (WADIZ migration seed) ---
    console.log('\n[1] Seed campaign');
    const wadiz = await prisma.voucherCampaign.findUnique({
      where: { campaignCode: 'WADIZ_2026_01' },
      include: { rewardPolicies: true, _count: { select: { vouchers: true } } },
    });
    assert(!!wadiz, 'WADIZ_2026_01 exists');
    assert(wadiz?.providerCode === 'WADIZ', 'providerCode WADIZ');
    assert(wadiz?.slug === 'wadiz-2026-01', 'slug wadiz-2026-01');
    assert(wadiz?.redeemUntil == null, 'redeemUntil null');
    const redeemFrom = wadiz?.redeemFrom ? wadiz.redeemFrom.toISOString() : null;
    assert(
      redeemFrom === '2026-09-30T15:00:00.000Z',
      `redeemFrom is 2026-10-01 00:00 KST (got ${redeemFrom})`,
    );
    const prices = (wadiz?.rewardPolicies || [])
      .map((r) => r.soldPriceKrw)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    assert(JSON.stringify(prices) === JSON.stringify([8800, 16500, 27500, 33000]), 'prices 8800/16500/27500/33000');
    assert(!(wadiz?.rewardPolicies || []).some((r) => r.soldPriceKrw === 29000), 'no 29000');
    assert((wadiz?.rewardPolicies || []).every((r) => r.pointsMode === 'NONE'), 'pointsMode NONE');
    // vouchers may exist from prior tests on smoke DB ??seed itself doesn't insert codes
    results.seed = {
      redeemFrom,
      rewardCount: wadiz?.rewardPolicies.length,
      prices,
    };

    // --- TEST campaign (redeemFrom past; do not mutate WADIZ dates) ---
    console.log('\n[2] TEST campaign + issue + redeem');
    const campaign = await prisma.voucherCampaign.create({
      data: {
        providerCode: 'TEST',
        campaignCode: `${runId}_CAMP`,
        slug: `${runId}-slug`,
        status: 'ACTIVE',
        title: 'voucher_test campaign',
        redeemFrom: new Date('2020-01-01T00:00:00.000Z'),
        redeemUntil: null,
        serviceGaAt: null,
      },
    });
    const reward = await prisma.rewardPolicy.create({
      data: {
        campaignId: campaign.id,
        rewardCode: `${PREFIX}R3M`,
        accessTier: 'PRO',
        durationMonths: 3,
        grantsProAccess: true,
        pointsMode: 'NONE',
        soldPriceKrw: 8800,
        startPolicy: 'ON_REDEEM_OR_GA',
        stackPolicy: 'SEQUENTIAL',
        status: 'ACTIVE',
      },
    });
    const rewardAlt = await prisma.rewardPolicy.create({
      data: {
        campaignId: campaign.id,
        rewardCode: `${PREFIX}R6M`,
        accessTier: 'PRO',
        durationMonths: 6,
        grantsProAccess: true,
        pointsMode: 'NONE',
        soldPriceKrw: 16500,
        startPolicy: 'ON_REDEEM_OR_GA',
        stackPolicy: 'SEQUENTIAL',
        status: 'ACTIVE',
      },
    });

    const issued = await issueVoucherUnits({
      campaignId: campaign.id,
      actorId: actor.id,
      reason: `${PREFIX}manual`,
      units: [
        {
          externalOrderId: `${runId}_ORD1`,
          unitIndex: 0,
          rewardPolicyId: reward.id,
          purchaseAmount: 8800,
          externalRewardName: 'test reward',
        },
      ],
    });
    assert(issued.created.length === 1, 'single issue created 1');
    assert(issued.conflicts.length === 0, 'single issue no conflict');
    const plain = issued.created[0]!.voucherCode;
    const voucherId = issued.created[0]!.voucherId;
    const row = await prisma.voucher.findUniqueOrThrow({ where: { id: voucherId } });
    assert(!!row.codeHash && row.codeLast4.length === 4, 'hash+last4 stored');
    assert(row.accessTierSnapshot === 'PRO', 'snapshot accessTier');
    assert(row.durationMonthsSnapshot === 3, 'snapshot duration');
    assert(row.pointsModeSnapshot === 'NONE', 'snapshot pointsMode');
    assert(row.startPolicySnapshot === 'ON_REDEEM_OR_GA', 'snapshot startPolicy');
    assert(row.stackPolicySnapshot === 'SEQUENTIAL', 'snapshot stackPolicy');
    assert(row.grantsProAccessSnapshot === true, 'snapshot grantsProAccess');
    assert(!containsPlaintext(row, plain), 'plaintext not on voucher row');
    const audits = await prisma.voucherAuditLog.findMany({ where: { voucherId } });
    assert(!audits.some((a) => containsPlaintext(a, plain)), 'plaintext not in audit');

    const freeUser = await prisma.user.create({
      data: {
        email: `${runId}_free@example.invalid`,
        passwordHash: 'x',
        plan: 'FREE',
        points: 100,
      },
    });
    const paymentsBefore = await prisma.payment.count({ where: { userId: freeUser.id } });
    const redeem = await redeemVoucherCode({
      userId: freeUser.id,
      codePlaintext: plain,
      campaignSlug: campaign.slug,
    });
    assert(redeem.ok === true, 'redeem ok');
    const after = await prisma.voucher.findUniqueOrThrow({ where: { id: voucherId } });
    assert(after.status === 'REDEEMED', 'status REDEEMED');
    assert(after.redeemedByUserId === freeUser.id, 'redeemedByUserId');
    assert(!!after.redeemedAt, 'redeemedAt set');
    const ents = await prisma.entitlement.findMany({
      where: { source: VOUCHER_SOURCE, sourceRefId: voucherId },
    });
    assert(ents.length === 1, 'exactly 1 entitlement');
    assert(ents[0]!.lifecycleStatus === 'READY', 'READY');
    assert(!!ents[0]!.startsAt && !!ents[0]!.endsAt, 'startsAt/endsAt set');
    const access = await getEffectiveUserAccess(freeUser.id);
    assert(!!access && access.hasProAccess === true, 'hasProAccess after redeem');
    const paymentsAfter = await prisma.payment.count({ where: { userId: freeUser.id } });
    assert(paymentsAfter === paymentsBefore, 'no Payment created');
    const pts = await prisma.user.findUniqueOrThrow({ where: { id: freeUser.id } });
    assert(pts.points === 100, 'points unchanged (NONE mode)');
    assert(pts.plan === 'FREE', 'User.plan stays FREE');

    // --- Concurrent redeem ---
    console.log('\n[3] Concurrent redeem');
    const issued2 = await issueVoucherUnits({
      campaignId: campaign.id,
      actorId: actor.id,
      reason: `${PREFIX}concurrent`,
      units: [
        {
          externalOrderId: `${runId}_ORD_CON`,
          unitIndex: 0,
          rewardPolicyId: reward.id,
          purchaseAmount: 8800,
        },
      ],
    });
    const code2 = issued2.created[0]!.voucherCode;
    const vid2 = issued2.created[0]!.voucherId;
    const uA = await prisma.user.create({
      data: { email: `${runId}_a@example.invalid`, passwordHash: 'x', plan: 'FREE', points: 0 },
    });
    const uB = await prisma.user.create({
      data: { email: `${runId}_b@example.invalid`, passwordHash: 'x', plan: 'FREE', points: 0 },
    });
    const [r1, r2] = await Promise.all([
      redeemVoucherCode({ userId: uA.id, codePlaintext: code2, campaignSlug: campaign.slug }),
      redeemVoucherCode({ userId: uB.id, codePlaintext: code2, campaignSlug: campaign.slug }),
    ]);
    const okCount = [r1, r2].filter((r) => r.ok).length;
    assert(okCount === 1, `concurrent redeem exactly 1 success (got ${okCount})`);
    const v2 = await prisma.voucher.findUniqueOrThrow({ where: { id: vid2 } });
    assert(v2.status === 'REDEEMED', 'concurrent voucher redeemed');
    assert(!!v2.redeemedByUserId, 'single owner');
    const ents2 = await prisma.entitlement.count({
      where: { source: VOUCHER_SOURCE, sourceRefId: vid2 },
    });
    assert(ents2 === 1, 'concurrent entitlement count 1');

    // --- Paid wait + multi voucher ---
    console.log('\n[4] Paid wait + sequential vouchers');
    const paidUser = await prisma.user.create({
      data: { email: `${runId}_paid@example.invalid`, passwordHash: 'x', plan: 'PRO', points: 0 },
    });
    const iPaid = await issueVoucherUnits({
      campaignId: campaign.id,
      actorId: actor.id,
      reason: `${PREFIX}paid`,
      units: [
        {
          externalOrderId: `${runId}_PAID`,
          unitIndex: 0,
          rewardPolicyId: reward.id,
          purchaseAmount: 8800,
        },
      ],
    });
    const redeemPaid = await redeemVoucherCode({
      userId: paidUser.id,
      codePlaintext: iPaid.created[0]!.voucherCode,
      campaignSlug: campaign.slug,
    });
    assert(redeemPaid.ok === true, 'paid user redeem ok');
    if (redeemPaid.ok) {
      assert(redeemPaid.entitlement.lifecycleStatus === 'WAITING_FOR_PAID_END', 'WAITING_FOR_PAID_END');
      assert(redeemPaid.entitlement.startsAt == null && redeemPaid.entitlement.endsAt == null, 'dates null while waiting');
    }
    await prisma.$transaction(async (tx) => {
      await resolveVoucherEntitlementsForUser(tx, paidUser.id, new Date());
    });
    let entPaid = await prisma.entitlement.findFirst({
      where: { source: VOUCHER_SOURCE, sourceRefId: iPaid.created[0]!.voucherId },
    });
    assert(entPaid?.lifecycleStatus === 'WAITING_FOR_PAID_END', 'still waiting while PRO');

    await prisma.user.update({ where: { id: paidUser.id }, data: { plan: 'FREE' } });
    const resolveNow = new Date('2026-11-01T00:00:00+09:00');
    await prisma.$transaction(async (tx) => {
      await resolveVoucherEntitlementsForUser(tx, paidUser.id, resolveNow);
    });
    entPaid = await prisma.entitlement.findFirst({
      where: { source: VOUCHER_SOURCE, sourceRefId: iPaid.created[0]!.voucherId },
    });
    assert(entPaid?.lifecycleStatus === 'READY', 'READY after paid end');
    assert(entPaid?.startsAt?.getTime() === resolveNow.getTime(), 'starts at resolve now');

    const seqUser = await prisma.user.create({
      data: { email: `${runId}_seq@example.invalid`, passwordHash: 'x', plan: 'FREE', points: 0 },
    });
    const iSeq = await issueVoucherUnits({
      campaignId: campaign.id,
      actorId: actor.id,
      reason: `${PREFIX}seq`,
      units: [
        {
          externalOrderId: `${runId}_SEQ`,
          unitIndex: 0,
          rewardPolicyId: reward.id,
          purchaseAmount: 8800,
        },
        {
          externalOrderId: `${runId}_SEQ`,
          unitIndex: 1,
          rewardPolicyId: rewardAlt.id,
          purchaseAmount: 16500,
        },
      ],
    });
    const red1 = await redeemVoucherCode({
      userId: seqUser.id,
      codePlaintext: iSeq.created[0]!.voucherCode,
      campaignSlug: campaign.slug,
    });
    const red2 = await redeemVoucherCode({
      userId: seqUser.id,
      codePlaintext: iSeq.created[1]!.voucherCode,
      campaignSlug: campaign.slug,
    });
    assert(red1.ok && red2.ok, 'sequential redeems ok');
    const e1 = await prisma.entitlement.findFirstOrThrow({
      where: { sourceRefId: iSeq.created[0]!.voucherId },
    });
    const e2 = await prisma.entitlement.findFirstOrThrow({
      where: { sourceRefId: iSeq.created[1]!.voucherId },
    });
    assert(e1.lifecycleStatus === 'READY', 'first READY');
    assert(e2.lifecycleStatus === 'WAITING_FOR_PRIOR_VOUCHER', 'second waiting prior');
    assert(e2.startsAt == null, 'second dates null');

    // end first early ??resolve second
    await prisma.entitlement.update({
      where: { id: e1.id },
      data: { endsAt: new Date('2020-01-02T00:00:00.000Z') },
    });
    const seqNow = new Date('2026-12-01T00:00:00+09:00');
    await prisma.$transaction(async (tx) => {
      await resolveVoucherEntitlementsForUser(tx, seqUser.id, seqNow);
    });
    const e2b = await prisma.entitlement.findFirstOrThrow({ where: { id: e2.id } });
    assert(e2b.lifecycleStatus === 'READY', 'second starts after prior end');

    // revoke first path: create waiting then revoke prior
    const revUser = await prisma.user.create({
      data: { email: `${runId}_rev@example.invalid`, passwordHash: 'x', plan: 'FREE', points: 0 },
    });
    const iRev = await issueVoucherUnits({
      campaignId: campaign.id,
      actorId: actor.id,
      reason: `${PREFIX}revchain`,
      units: [
        {
          externalOrderId: `${runId}_REV`,
          unitIndex: 0,
          rewardPolicyId: reward.id,
          purchaseAmount: 8800,
        },
        {
          externalOrderId: `${runId}_REV`,
          unitIndex: 1,
          rewardPolicyId: reward.id,
          purchaseAmount: 8800,
        },
      ],
    });
    await redeemVoucherCode({
      userId: revUser.id,
      codePlaintext: iRev.created[0]!.voucherCode,
      campaignSlug: campaign.slug,
    });
    await redeemVoucherCode({
      userId: revUser.id,
      codePlaintext: iRev.created[1]!.voucherCode,
      campaignSlug: campaign.slug,
    });
    await cancelVouchers({
      voucherIds: [iRev.created[0]!.voucherId],
      actorId: actor.id,
      reason: `${PREFIX}revoke-first`,
    });
    const eRev2 = await prisma.entitlement.findFirstOrThrow({
      where: { sourceRefId: iRev.created[1]!.voucherId },
    });
    assert(
      eRev2.lifecycleStatus === 'READY' || eRev2.lifecycleStatus === 'WAITING_FOR_PRIOR_VOUCHER',
      'second not stuck forever after revoke',
    );
    if (eRev2.lifecycleStatus === 'WAITING_FOR_PRIOR_VOUCHER') {
      await prisma.$transaction(async (tx) => {
        await resolveVoucherEntitlementsForUser(tx, revUser.id, new Date());
      });
    }
    const eRev2b = await prisma.entitlement.findFirstOrThrow({
      where: { sourceRefId: iRev.created[1]!.voucherId },
    });
    assert(eRev2b.lifecycleStatus === 'READY', 'second READY after prior revoke+resolve');

    // --- CSV ---
    console.log('\n[5] CSV issue idempotency/conflict');
    const csv = [
      'order,reward,qty,amount,buyerName,buyerEmail',
      `${runId}_CSV,"3m, special",3,8800,Hong,hong@example.com`,
      '',
    ].join('\n');
    const countBefore = await prisma.voucher.count({ where: { campaignId: campaign.id } });
    const preview = buildIssuePreviewFromCsv({
      csvText: csv,
      mapping: {
        externalOrderId: 'order',
        rewardKey: 'reward',
        quantity: 'qty',
        purchaseAmount: 'amount',
        buyerName: 'buyerName',
        buyerEmail: 'buyerEmail',
      },
      rewardNameMap: { '3m, special': reward.id },
    });
    assert(preview.errors === 0, 'csv preview ok');
    assert(preview.estimatedCodes === 3, 'qty 3 ??3 codes');
    assert(
      preview.units.map((u) => u.unitIndex).join(',') === '0,1,2',
      'unitIndex 0,1,2',
    );
    const countMid = await prisma.voucher.count({ where: { campaignId: campaign.id } });
    assert(countMid === countBefore, 'preview does not write DB');

    const commit1 = await issueVoucherUnits({
      campaignId: campaign.id,
      actorId: actor.id,
      reason: `${PREFIX}csv`,
      units: preview.units,
    });
    assert(commit1.created.length === 3, 'csv commit creates 3');
    const commit2 = await issueVoucherUnits({
      campaignId: campaign.id,
      actorId: actor.id,
      reason: `${PREFIX}csv-re`,
      units: preview.units,
    });
    assert(commit2.created.length === 0 && commit2.existing.length === 3, 'csv reupload idempotent');

    const conflictUnits = preview.units.map((u) => ({
      ...u,
      rewardPolicyId: rewardAlt.id,
      purchaseAmount: 16500,
    }));
    const conflict = await issueVoucherUnits({
      campaignId: campaign.id,
      actorId: actor.id,
      reason: `${PREFIX}csv-conflict`,
      units: conflictUnits,
    });
    assert(conflict.conflicts.length === 3, 'reward/amount mismatch ??conflict');
    assert(conflict.existing.length === 0, 'mismatch not classified EXISTING');

    // concurrent same CSV
    const csv2units = [
      {
        externalOrderId: `${runId}_CSV2`,
        unitIndex: 0,
        rewardPolicyId: reward.id,
        purchaseAmount: 8800,
      },
    ];
    const [cA, cB] = await Promise.all([
      issueVoucherUnits({
        campaignId: campaign.id,
        actorId: actor.id,
        reason: `${PREFIX}raceA`,
        units: csv2units,
      }),
      issueVoucherUnits({
        campaignId: campaign.id,
        actorId: actor.id,
        reason: `${PREFIX}raceB`,
        units: csv2units,
      }),
    ]);
    const createdRace = cA.created.length + cB.created.length;
    const existingRace = cA.existing.length + cB.existing.length;
    assert(createdRace === 1 && existingRace === 1, 'concurrent issue no duplicate');
    const raceCount = await prisma.voucher.count({
      where: { campaignId: campaign.id, externalOrderId: `${runId}_CSV2` },
    });
    assert(raceCount === 1, 'DB unique enforces single CSV2 voucher');

    const csvPlain = commit1.created[0]!.voucherCode;
    const csvRedeem = await redeemVoucherCode({
      userId: freeUser.id,
      codePlaintext: csvPlain,
      campaignSlug: campaign.slug,
    });
    // may wait prior if freeUser already has active ??still ok if redeem succeeds
    assert(csvRedeem.ok === true, 'result CSV code redeemable');
    const csvV = await prisma.voucher.findUniqueOrThrow({
      where: { id: commit1.created[0]!.voucherId },
    });
    assert(csvV.externalRewardName !== 'Hong', 'buyerName not stored as reward name');
    assert(!containsPlaintext(csvV, 'hong@example.com'), 'buyerEmail not on voucher');
    assert(sanitizeCsvCell('=cmd') === "'=cmd", 'formula sanitize');
    assert(buildCsvWithBom(['h'], [['@x']]).includes("'@x"), 'export formula guard');

    // --- Reissue / cancel ---
    console.log('\n[6] Reissue / cancel / revoke');
    const iRe = await issueVoucherUnits({
      campaignId: campaign.id,
      actorId: actor.id,
      reason: `${PREFIX}reissue`,
      units: [
        {
          externalOrderId: `${runId}_RE`,
          unitIndex: 0,
          rewardPolicyId: reward.id,
          purchaseAmount: 8800,
        },
      ],
    });
    const oldCode = iRe.created[0]!.voucherCode;
    const re = await reissueVoucherCode({
      voucherId: iRe.created[0]!.voucherId,
      actorId: actor.id,
      reason: `${PREFIX}reissue-reason`,
    });
    assert(re.ok === true, 'reissue ok');
    if (re.ok) {
      assert(re.codeVersion === 2, 'codeVersion 2');
      const oldTry = await redeemVoucherCode({
        userId: freeUser.id,
        codePlaintext: oldCode,
        campaignSlug: campaign.slug,
      });
      assert(oldTry.ok === false, 'old code fails');
      const newTryUser = await prisma.user.create({
        data: { email: `${runId}_re@example.invalid`, passwordHash: 'x', plan: 'FREE', points: 0 },
      });
      const newTry = await redeemVoucherCode({
        userId: newTryUser.id,
        codePlaintext: re.voucherCode,
        campaignSlug: campaign.slug,
      });
      assert(newTry.ok === true, 'new code works');
    }
    const reRow = await prisma.voucher.findUniqueOrThrow({
      where: { id: iRe.created[0]!.voucherId },
    });
    assert(reRow.durationMonthsSnapshot === 3, 'snapshot kept after reissue');

    const blockRe = await reissueVoucherCode({
      voucherId: iRe.created[0]!.voucherId,
      actorId: actor.id,
      reason: 'should fail redeemed',
    });
    assert(blockRe.ok === false, 'REDEEMED reissue blocked');

    const iCancel = await issueVoucherUnits({
      campaignId: campaign.id,
      actorId: actor.id,
      reason: `${PREFIX}cancel`,
      units: [
        {
          externalOrderId: `${runId}_CX`,
          unitIndex: 0,
          rewardPolicyId: reward.id,
          purchaseAmount: 8800,
        },
      ],
    });
    await cancelVouchers({
      voucherIds: [iCancel.created[0]!.voucherId],
      actorId: actor.id,
      reason: `${PREFIX}cancel-issued`,
    });
    const cx = await prisma.voucher.findUniqueOrThrow({
      where: { id: iCancel.created[0]!.voucherId },
    });
    assert(cx.status === 'CANCELLED', 'ISSUED??CANCELLED');
    const cxRedeem = await redeemVoucherCode({
      userId: freeUser.id,
      codePlaintext: iCancel.created[0]!.voucherCode,
      campaignSlug: campaign.slug,
    });
    assert(cxRedeem.ok === false, 'cancelled code cannot redeem');

    const revokeUser = await prisma.user.create({
      data: {
        email: `${runId}_revoke@example.invalid`,
        passwordHash: 'x',
        plan: 'FREE',
        points: 0,
        adminTrialEndsAt: new Date('2099-01-01T00:00:00.000Z'),
      },
    });
    const iRv = await issueVoucherUnits({
      campaignId: campaign.id,
      actorId: actor.id,
      reason: `${PREFIX}revoke`,
      units: [
        {
          externalOrderId: `${runId}_RV`,
          unitIndex: 0,
          rewardPolicyId: reward.id,
          purchaseAmount: 8800,
        },
      ],
    });
    await redeemVoucherCode({
      userId: revokeUser.id,
      codePlaintext: iRv.created[0]!.voucherCode,
      campaignSlug: campaign.slug,
    });
    const planBefore = (await prisma.user.findUniqueOrThrow({ where: { id: revokeUser.id } })).plan;
    const payBefore = await prisma.payment.count({ where: { userId: revokeUser.id } });
    const accessBefore = await getEffectiveUserAccess(revokeUser.id);
    assert(!!accessBefore && accessBefore.hasProAccess === true, 'pro before revoke');
    await cancelVouchers({
      voucherIds: [iRv.created[0]!.voucherId],
      actorId: actor.id,
      reason: `${PREFIX}revoke-redeemed`,
    });
    const entRv = await prisma.entitlement.findFirstOrThrow({
      where: { sourceRefId: iRv.created[0]!.voucherId },
    });
    assert(entRv.lifecycleStatus === 'REVOKED', 'entitlement REVOKED');
    const planAfter = (await prisma.user.findUniqueOrThrow({ where: { id: revokeUser.id } })).plan;
    const payAfter = await prisma.payment.count({ where: { userId: revokeUser.id } });
    assert(planAfter === planBefore, 'plan unchanged on revoke');
    assert(payAfter === payBefore, 'payment unchanged on revoke');
    const accessAfter = await getEffectiveUserAccess(revokeUser.id);
    assert(!!accessAfter && accessAfter.hasProAccess === true, 'admin trial PRO remains after voucher revoke');

    // --- adjust / transfer ---
    console.log('\n[7] Adjust / transfer');
    const adjUser = await prisma.user.create({
      data: { email: `${runId}_adj@example.invalid`, passwordHash: 'x', plan: 'FREE', points: 0 },
    });
    const targetUser = await prisma.user.create({
      data: { email: `${runId}_tgt@example.invalid`, passwordHash: 'x', plan: 'FREE', points: 0 },
    });
    const busyUser = await prisma.user.create({
      data: { email: `${runId}_busy@example.invalid`, passwordHash: 'x', plan: 'FREE', points: 0 },
    });
    const iAdj = await issueVoucherUnits({
      campaignId: campaign.id,
      actorId: actor.id,
      reason: `${PREFIX}adj`,
      units: [
        {
          externalOrderId: `${runId}_ADJ`,
          unitIndex: 0,
          rewardPolicyId: reward.id,
          purchaseAmount: 8800,
        },
        {
          externalOrderId: `${runId}_ADJ`,
          unitIndex: 1,
          rewardPolicyId: reward.id,
          purchaseAmount: 8800,
        },
      ],
    });
    await redeemVoucherCode({
      userId: adjUser.id,
      codePlaintext: iAdj.created[0]!.voucherCode,
      campaignSlug: campaign.slug,
    });
    await redeemVoucherCode({
      userId: adjUser.id,
      codePlaintext: iAdj.created[1]!.voucherCode,
      campaignSlug: campaign.slug,
    });
    const entAdj = await prisma.entitlement.findFirstOrThrow({
      where: { sourceRefId: iAdj.created[0]!.voucherId },
    });
    const badAdj = await adjustVoucherEntitlementDates({
      entitlementId: entAdj.id,
      actorId: actor.id,
      reason: `${PREFIX}bad`,
      startsAt: new Date('2027-01-01T00:00:00+09:00'),
      endsAt: new Date('2026-01-01T00:00:00+09:00'),
      allowRecascade: false,
    });
    assert(badAdj.ok === false, 'ends before starts blocked');
    const blockedCascade = await adjustVoucherEntitlementDates({
      entitlementId: entAdj.id,
      actorId: actor.id,
      reason: `${PREFIX}cascade-block`,
      startsAt: new Date('2026-11-01T00:00:00+09:00'),
      endsAt: new Date('2027-02-01T00:00:00+09:00'),
      allowRecascade: false,
    });
    assert(blockedCascade.ok === false, 'later voucher blocks adjust by default');
    const okCascade = await adjustVoucherEntitlementDates({
      entitlementId: entAdj.id,
      actorId: actor.id,
      reason: `${PREFIX}cascade-ok`,
      startsAt: new Date('2026-11-01T00:00:00+09:00'),
      endsAt: new Date('2027-02-01T00:00:00+09:00'),
      allowRecascade: true,
    });
    assert(okCascade.ok === true, 'allowRecascade adjust ok');

    // transfer: busy has voucher ??block; empty target ??ok
    await redeemVoucherCode({
      userId: busyUser.id,
      codePlaintext: (
        await issueVoucherUnits({
          campaignId: campaign.id,
          actorId: actor.id,
          reason: `${PREFIX}busy`,
          units: [
            {
              externalOrderId: `${runId}_BUSY`,
              unitIndex: 0,
              rewardPolicyId: reward.id,
              purchaseAmount: 8800,
            },
          ],
        })
      ).created[0]!.voucherCode,
      campaignSlug: campaign.slug,
    });
    const transferSrc = iAdj.created[0]!.voucherId;
    const beforeEnt = await prisma.entitlement.findFirstOrThrow({
      where: { sourceRefId: transferSrc },
    });
    const startsKeep = beforeEnt.startsAt?.toISOString();
    const endsKeep = beforeEnt.endsAt?.toISOString();
    const blockTransfer = await transferRedeemedVoucher({
      voucherId: transferSrc,
      targetUserId: busyUser.id,
      actorId: actor.id,
      reason: `${PREFIX}transfer-block`,
    });
    assert(blockTransfer.ok === false, 'transfer blocked when target has voucher');
    const okTransfer = await transferRedeemedVoucher({
      voucherId: transferSrc,
      targetUserId: targetUser.id,
      actorId: actor.id,
      reason: `${PREFIX}transfer-ok`,
    });
    assert(okTransfer.ok === true, 'transfer ok');
    const afterV = await prisma.voucher.findUniqueOrThrow({ where: { id: transferSrc } });
    const afterE = await prisma.entitlement.findFirstOrThrow({
      where: { sourceRefId: transferSrc },
    });
    assert(afterV.redeemedByUserId === targetUser.id, 'voucher user moved');
    assert(afterE.userId === targetUser.id, 'entitlement user moved');
    assert(afterE.startsAt?.toISOString() === startsKeep, 'startsAt not reset');
    assert(afterE.endsAt?.toISOString() === endsKeep, 'endsAt not reset');
    assert(
      (await prisma.user.findUniqueOrThrow({ where: { id: adjUser.id } })).plan === 'FREE',
      'plan unchanged on transfer',
    );

    // --- Admin / exposure ---
    console.log('\n[8] Admin gate / exposure');
    assert(isAdminEmail('random@example.com') === false, 'non-admin email false');
    const fs = await import('node:fs');
    const routeFiles = [
      'app/api/akman/vouchers/route.ts',
      'app/api/akman/vouchers/issue/route.ts',
      'app/api/akman/vouchers/imports/route.ts',
      'app/api/akman/vouchers/cancel/route.ts',
      'app/api/akman/vouchers/[id]/reissue/route.ts',
    ];
    for (const f of routeFiles) {
      const text = fs.readFileSync(f, 'utf8');
      assert(text.includes('requireAkmanAdmin'), `${f} requires admin`);
      if (f.includes('issue') || f.includes('reissue') || f.includes('imports')) {
        assert(text.includes('no-store'), `${f} Cache-Control no-store`);
      }
    }
    const mw = fs.readFileSync('middleware.ts', 'utf8');
    assert(mw.includes('/akman') && mw.includes('isAdminEmail'), 'middleware guards /akman');

    // --- BETA boundary ---
    console.log('\n[9] BETA boundary');
    const end = getOpenBetaEndsAt();
    const before = new Date(end.getTime() - 1);
    assert(isOpenBetaMode(before) === true, 'open beta just before end');
    assert(isOpenBetaMode(end) === false, 'closed at exact end');
    assert(getEffectivePlanForPolicy('BETA', end) === 'FREE', 'BETA??FREE effective');
    assert(canStartPaidCheckout('BETA', end) === true, 'checkout allowed after end');
    const betaUser = await prisma.user.create({
      data: { email: `${runId}_beta@example.invalid`, passwordHash: 'x', plan: 'BETA', points: 0 },
    });
    const betaAccess = await getEffectiveUserAccess(betaUser.id, end);
    assert(!!betaAccess && betaAccess.effectivePlan === 'FREE', 'DTO effectivePlan FREE');
    assert(!!betaAccess && betaAccess.hasProAccess === false, 'BETA alone no PRO after end');
    assert(
      (await prisma.user.findUniqueOrThrow({ where: { id: betaUser.id } })).plan === 'BETA',
      'DB plan remains BETA',
    );
    const iBeta = await issueVoucherUnits({
      campaignId: campaign.id,
      actorId: actor.id,
      reason: `${PREFIX}beta`,
      units: [
        {
          externalOrderId: `${runId}_BETA`,
          unitIndex: 0,
          rewardPolicyId: reward.id,
          purchaseAmount: 8800,
        },
      ],
    });
    await redeemVoucherCode({
      userId: betaUser.id,
      codePlaintext: iBeta.created[0]!.voucherCode,
      campaignSlug: campaign.slug,
      now: end,
    });
    const betaAccess2 = await getEffectiveUserAccess(betaUser.id, end);
    assert(!!betaAccess2 && betaAccess2.hasProAccess === true, 'voucher grants PRO while plan stays BETA');
    assert(
      (await prisma.user.findUniqueOrThrow({ where: { id: betaUser.id } })).plan === 'BETA',
      'plan still BETA with voucher',
    );

    results.failures = failures.length;
    results.ok = failures.length === 0;
  } finally {
    console.log('\n[cleanup] voucher_test_ rows only');
    // Safety: only delete our runId-prefixed rows
    if (!runId.startsWith(PREFIX)) {
      console.error('cleanup aborted: runId missing prefix');
    } else {
      const camps = await prisma.voucherCampaign.findMany({
        where: { campaignCode: { startsWith: runId } },
        select: { id: true },
      });
      const campIds = camps.map((c) => c.id);
      const vouchers = await prisma.voucher.findMany({
        where: { campaignId: { in: campIds } },
        select: { id: true },
      });
      const vids = vouchers.map((v) => v.id);
      await prisma.voucherAuditLog.deleteMany({
        where: {
          OR: [{ voucherId: { in: vids } }, { reason: { startsWith: PREFIX } }],
        },
      });
      await prisma.entitlement.deleteMany({
        where: { source: VOUCHER_SOURCE, sourceRefId: { in: vids } },
      });
      await prisma.voucher.deleteMany({ where: { id: { in: vids } } });
      await prisma.rewardPolicy.deleteMany({ where: { campaignId: { in: campIds } } });
      await prisma.voucherImportBatch.deleteMany({ where: { campaignId: { in: campIds } } });
      await prisma.voucherCampaign.deleteMany({ where: { id: { in: campIds } } });
      await prisma.user.deleteMany({ where: { email: { startsWith: runId } } });
      console.log(`  cleaned campaigns=${campIds.length} vouchers=${vids.length}`);
    }
    await prisma.$disconnect();
  }

  console.log('\n[summary]', JSON.stringify({ ok: failures.length === 0, failCount: failures.length }));
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
