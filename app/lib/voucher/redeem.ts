import { prisma } from '@/app/lib/prisma';
import { isPaidDbPlan } from '@/app/lib/subscription/plan-change';
import {
  CAMPAIGN_STATUS,
  ENTITLEMENT_LIFECYCLE,
  REDEEM_GENERIC_ERROR,
  VOUCHER_SOURCE,
  VOUCHER_STATUS,
} from '@/app/lib/voucher/constants';
import { hashVoucherCode, normalizeVoucherCodeInput } from '@/app/lib/voucher/code-crypto';
import {
  computeReadyWindow,
  pickInitialLifecycle,
  resolveVoucherEntitlementsForUser,
  userHasBlockingPriorVoucher,
} from '@/app/lib/voucher/resolve-entitlements';

export type RedeemResult =
  | {
      ok: true;
      entitlement: {
        lifecycleStatus: string;
        startsAt: string | null;
        endsAt: string | null;
        durationMonths: number;
      };
      campaignSlug: string;
    }
  | { ok: false; error: string; status: number };

export async function redeemVoucherCode(input: {
  userId: string;
  codePlaintext: string;
  campaignSlug?: string | null;
  ip?: string | null;
  now?: Date;
}): Promise<RedeemResult> {
  const now = input.now ?? new Date();
  const normalized = normalizeVoucherCodeInput(input.codePlaintext);
  if (normalized.length < 12) {
    return { ok: false, error: REDEEM_GENERIC_ERROR, status: 400 };
  }

  let codeHash: string;
  try {
    codeHash = hashVoucherCode(normalized);
  } catch {
    console.error('[voucher] HMAC secret missing during redeem');
    return { ok: false, error: '일시적으로 등록할 수 없습니다.', status: 503 };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const voucher = await tx.voucher.findUnique({
        where: { codeHash },
        include: {
          campaign: true,
          rewardPolicy: true,
        },
      });

      if (!voucher) {
        await tx.voucherAuditLog.create({
          data: {
            userId: input.userId,
            action: 'REDEEM',
            result: 'FAILED',
            reason: 'NOT_FOUND_OR_INVALID',
            ip: input.ip ?? null,
          },
        });
        return { ok: false, error: REDEEM_GENERIC_ERROR, status: 400 };
      }

      if (input.campaignSlug && voucher.campaign.slug !== input.campaignSlug) {
        await tx.voucherAuditLog.create({
          data: {
            voucherId: voucher.id,
            userId: input.userId,
            action: 'REDEEM',
            result: 'FAILED',
            reason: 'CAMPAIGN_MISMATCH',
            ip: input.ip ?? null,
          },
        });
        return { ok: false, error: REDEEM_GENERIC_ERROR, status: 400 };
      }

      const campaign = voucher.campaign;
      if (campaign.status !== CAMPAIGN_STATUS.ACTIVE) {
        await tx.voucherAuditLog.create({
          data: {
            voucherId: voucher.id,
            userId: input.userId,
            action: 'REDEEM',
            result: 'FAILED',
            reason: 'CAMPAIGN_INACTIVE',
            ip: input.ip ?? null,
          },
        });
        return { ok: false, error: REDEEM_GENERIC_ERROR, status: 400 };
      }

      if (campaign.redeemFrom && now.getTime() < campaign.redeemFrom.getTime()) {
        await tx.voucherAuditLog.create({
          data: {
            voucherId: voucher.id,
            userId: input.userId,
            action: 'REDEEM',
            result: 'FAILED',
            reason: 'REDEEM_NOT_STARTED',
            ip: input.ip ?? null,
          },
        });
        return {
          ok: false,
          error: '아직 이용권 등록 기간이 시작되지 않았습니다.',
          status: 400,
        };
      }

      if (campaign.redeemUntil && now.getTime() >= campaign.redeemUntil.getTime()) {
        await tx.voucherAuditLog.create({
          data: {
            voucherId: voucher.id,
            userId: input.userId,
            action: 'REDEEM',
            result: 'FAILED',
            reason: 'REDEEM_CLOSED',
            ip: input.ip ?? null,
          },
        });
        return { ok: false, error: REDEEM_GENERIC_ERROR, status: 400 };
      }

      if (voucher.status !== VOUCHER_STATUS.ISSUED) {
        await tx.voucherAuditLog.create({
          data: {
            voucherId: voucher.id,
            userId: input.userId,
            action: 'REDEEM',
            result: 'FAILED',
            reason: `STATUS_${voucher.status}`,
            ip: input.ip ?? null,
          },
        });
        return { ok: false, error: REDEEM_GENERIC_ERROR, status: 400 };
      }

      if (!voucher.grantsProAccessSnapshot) {
        return { ok: false, error: REDEEM_GENERIC_ERROR, status: 400 };
      }

      const claimed = await tx.voucher.updateMany({
        where: {
          id: voucher.id,
          status: VOUCHER_STATUS.ISSUED,
        },
        data: {
          status: VOUCHER_STATUS.REDEEMED,
          redeemedByUserId: input.userId,
          redeemedAt: now,
        },
      });

      if (claimed.count !== 1) {
        await tx.voucherAuditLog.create({
          data: {
            voucherId: voucher.id,
            userId: input.userId,
            action: 'REDEEM',
            result: 'FAILED',
            reason: 'CONCURRENT_OR_ALREADY_USED',
            ip: input.ip ?? null,
          },
        });
        return { ok: false, error: REDEEM_GENERIC_ERROR, status: 409 };
      }

      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { plan: true },
      });
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      const paidActive = isPaidDbPlan(user.plan);
      const hasPrior = await userHasBlockingPriorVoucher(tx, input.userId, now);
      const lifecycle = pickInitialLifecycle({
        paidActive,
        hasBlockingPriorVoucher: hasPrior,
      });

      let startsAt: Date | null = null;
      let endsAt: Date | null = null;
      if (lifecycle === ENTITLEMENT_LIFECYCLE.READY) {
        const window = computeReadyWindow({
          redeemedAt: now,
          serviceGaAt: campaign.serviceGaAt,
          durationMonths: voucher.durationMonthsSnapshot,
        });
        startsAt = window.startsAt;
        endsAt = window.endsAt;
      }

      const entitlement = await tx.entitlement.create({
        data: {
          userId: input.userId,
          type: voucher.accessTierSnapshot || 'PRO',
          source: VOUCHER_SOURCE,
          sourceRefId: voucher.id,
          lifecycleStatus: lifecycle,
          startsAt,
          endsAt,
          durationMonths: voucher.durationMonthsSnapshot,
        },
      });

      await resolveVoucherEntitlementsForUser(tx, input.userId, now, {
        serviceGaAt: campaign.serviceGaAt,
      });

      const finalEnt = await tx.entitlement.findUnique({
        where: { id: entitlement.id },
      });

      await tx.voucherAuditLog.create({
        data: {
          voucherId: voucher.id,
          userId: input.userId,
          actorId: input.userId,
          action: 'REDEEM',
          result: 'SUCCESS',
          meta: {
            lifecycleStatus: finalEnt?.lifecycleStatus ?? lifecycle,
            durationMonths: voucher.durationMonthsSnapshot,
            pointsMode: voucher.pointsModeSnapshot,
          },
          ip: input.ip ?? null,
        },
      });

      return {
        ok: true as const,
        entitlement: {
          lifecycleStatus: finalEnt?.lifecycleStatus ?? lifecycle,
          startsAt: finalEnt?.startsAt?.toISOString() ?? null,
          endsAt: finalEnt?.endsAt?.toISOString() ?? null,
          durationMonths: voucher.durationMonthsSnapshot,
        },
        campaignSlug: campaign.slug,
      };
    });
  } catch (e) {
    console.error('[voucher] redeem failed:', e);
    return { ok: false, error: '등록 처리 중 오류가 발생했습니다.', status: 500 };
  }
}
