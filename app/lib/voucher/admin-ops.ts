import { prisma } from '@/app/lib/prisma';
import {
  generateVoucherCodePlaintext,
  hashVoucherCode,
  voucherCodeLast4,
} from '@/app/lib/voucher/code-crypto';
import { ENTITLEMENT_LIFECYCLE, VOUCHER_SOURCE, VOUCHER_STATUS } from '@/app/lib/voucher/constants';
import { getEffectiveUserAccess } from '@/app/lib/entitlement/effective-access';
import { resolveVoucherEntitlementsForUser } from '@/app/lib/voucher/resolve-entitlements';

export async function reissueVoucherCode(input: {
  voucherId: string;
  actorId: string;
  reason: string;
}): Promise<{ ok: true; voucherCode: string; codeLast4: string; codeVersion: number } | { ok: false; error: string }> {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: '재발급 사유가 필요합니다.' };

  try {
    return await prisma.$transaction(async (tx) => {
      const voucher = await tx.voucher.findUnique({ where: { id: input.voucherId } });
      if (!voucher) return { ok: false as const, error: '이용권을 찾을 수 없습니다.' };
      if (voucher.status !== VOUCHER_STATUS.ISSUED) {
        return { ok: false as const, error: 'ISSUED 상태만 재발급할 수 있습니다.' };
      }
      const ent = await tx.entitlement.findUnique({
        where: {
          source_sourceRefId: { source: VOUCHER_SOURCE, sourceRefId: voucher.id },
        },
      });
      if (ent) {
        return { ok: false as const, error: 'Entitlement가 있는 이용권은 재발급할 수 없습니다.' };
      }

      const plaintext = generateVoucherCodePlaintext();
      const codeHash = hashVoucherCode(plaintext);
      const codeLast4 = voucherCodeLast4(plaintext);
      const nextVersion = voucher.codeVersion + 1;

      const updated = await tx.voucher.updateMany({
        where: {
          id: voucher.id,
          status: VOUCHER_STATUS.ISSUED,
          codeVersion: voucher.codeVersion,
        },
        data: {
          codeHash,
          codeLast4,
          codeVersion: nextVersion,
        },
      });
      if (updated.count !== 1) {
        return { ok: false as const, error: '동시 재발급 충돌이 발생했습니다. 다시 시도해 주세요.' };
      }

      await tx.voucherAuditLog.create({
        data: {
          voucherId: voucher.id,
          actorId: input.actorId,
          action: 'REISSUE',
          result: 'SUCCESS',
          reason,
          meta: {
            previousLast4: voucher.codeLast4,
            previousVersion: voucher.codeVersion,
            codeLast4,
            codeVersion: nextVersion,
          },
        },
      });

      return {
        ok: true as const,
        voucherCode: plaintext,
        codeLast4,
        codeVersion: nextVersion,
      };
    });
  } catch {
    return { ok: false, error: '재발급 처리 중 오류가 발생했습니다.' };
  }
}

export async function cancelVouchers(input: {
  voucherIds: string[];
  actorId: string;
  reason: string;
}): Promise<{
  cancelledIssued: number;
  revokedRedeemed: number;
  skipped: number;
  details: Array<{ voucherId: string; outcome: string }>;
}> {
  const reason = input.reason.trim();
  const details: Array<{ voucherId: string; outcome: string }> = [];
  let cancelledIssued = 0;
  let revokedRedeemed = 0;
  let skipped = 0;

  for (const voucherId of input.voucherIds) {
    await prisma.$transaction(async (tx) => {
      const voucher = await tx.voucher.findUnique({ where: { id: voucherId } });
      if (!voucher) {
        skipped += 1;
        details.push({ voucherId, outcome: 'NOT_FOUND' });
        return;
      }
      if (voucher.status === VOUCHER_STATUS.CANCELLED || voucher.status === VOUCHER_STATUS.EXPIRED) {
        skipped += 1;
        details.push({ voucherId, outcome: 'ALREADY_CANCELLED' });
        return;
      }

      if (voucher.status === VOUCHER_STATUS.ISSUED) {
        const u = await tx.voucher.updateMany({
          where: { id: voucherId, status: VOUCHER_STATUS.ISSUED },
          data: { status: VOUCHER_STATUS.CANCELLED },
        });
        if (u.count !== 1) {
          skipped += 1;
          details.push({ voucherId, outcome: 'RACE' });
          return;
        }
        await tx.voucherAuditLog.create({
          data: {
            voucherId,
            actorId: input.actorId,
            action: 'CANCEL',
            result: 'SUCCESS',
            reason,
            meta: { previousStatus: 'ISSUED' },
          },
        });
        cancelledIssued += 1;
        details.push({ voucherId, outcome: 'CANCELLED_ISSUED' });
        return;
      }

      if (voucher.status === VOUCHER_STATUS.REDEEMED) {
        await tx.voucher.update({
          where: { id: voucherId },
          data: { status: VOUCHER_STATUS.CANCELLED },
        });
        await tx.entitlement.updateMany({
          where: {
            source: VOUCHER_SOURCE,
            sourceRefId: voucherId,
            lifecycleStatus: { not: ENTITLEMENT_LIFECYCLE.REVOKED },
          },
          data: { lifecycleStatus: ENTITLEMENT_LIFECYCLE.REVOKED },
        });
        if (voucher.redeemedByUserId) {
          await resolveVoucherEntitlementsForUser(tx, voucher.redeemedByUserId, new Date());
        }
        await tx.voucherAuditLog.create({
          data: {
            voucherId,
            userId: voucher.redeemedByUserId,
            actorId: input.actorId,
            action: 'REVOKE',
            result: 'SUCCESS',
            reason,
            meta: { previousStatus: 'REDEEMED' },
          },
        });
        revokedRedeemed += 1;
        details.push({ voucherId, outcome: 'REVOKED_REDEEMED' });
      }
    });
  }

  return { cancelledIssued, revokedRedeemed, skipped, details };
}

export async function previewCancelImpact(voucherIds: string[]) {
  const vouchers = await prisma.voucher.findMany({
    where: { id: { in: voucherIds } },
    include: {
      redeemedBy: { select: { id: true, email: true, plan: true } },
      campaign: { select: { campaignCode: true, providerCode: true } },
      rewardPolicy: { select: { rewardCode: true } },
    },
  });

  const impacts = [];
  for (const v of vouchers) {
    let accessAfter: Awaited<ReturnType<typeof getEffectiveUserAccess>> | null = null;
    if (v.redeemedByUserId) {
      accessAfter = await getEffectiveUserAccess(v.redeemedByUserId);
    }
    impacts.push({
      voucherId: v.id,
      status: v.status,
      externalOrderId: v.externalOrderId,
      unitIndex: v.unitIndex,
      codeLast4: v.codeLast4,
      campaignCode: v.campaign.campaignCode,
      rewardCode: v.rewardPolicy.rewardCode,
      user: v.redeemedBy
        ? { id: v.redeemedBy.id, email: v.redeemedBy.email, plan: v.redeemedBy.plan }
        : null,
      /** approximate: current access (before revoke) for admin preview */
      currentHasProAccess: accessAfter?.hasProAccess ?? null,
      currentAccessLabel: accessAfter?.accessLabel ?? null,
    });
  }
  return impacts;
}
