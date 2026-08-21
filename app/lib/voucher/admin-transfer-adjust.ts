import { prisma } from '@/app/lib/prisma';
import { ENTITLEMENT_LIFECYCLE, VOUCHER_SOURCE, VOUCHER_STATUS } from '@/app/lib/voucher/constants';
import { voucherOccupiesTimeline } from '@/app/lib/voucher/resolve-entitlements';
import { resolveVoucherEntitlementsForUser } from '@/app/lib/voucher/resolve-entitlements';

export async function transferRedeemedVoucher(input: {
  voucherId: string;
  targetUserId: string;
  actorId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: '이전 사유가 필요합니다.' };

  return prisma.$transaction(async (tx) => {
    const voucher = await tx.voucher.findUnique({ where: { id: input.voucherId } });
    if (!voucher) return { ok: false as const, error: '이용권을 찾을 수 없습니다.' };
    if (voucher.status !== VOUCHER_STATUS.REDEEMED) {
      return { ok: false as const, error: '등록된(REDEEMED) 이용권만 이전할 수 있습니다.' };
    }
    if (!voucher.redeemedByUserId) {
      return { ok: false as const, error: '귀속 사용자가 없습니다.' };
    }
    if (voucher.redeemedByUserId === input.targetUserId) {
      return { ok: false as const, error: '동일 사용자로는 이전할 수 없습니다.' };
    }

    const target = await tx.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true, deletedAt: true },
    });
    if (!target || target.deletedAt) {
      return { ok: false as const, error: '대상 사용자를 찾을 수 없습니다.' };
    }

    const entitlement = await tx.entitlement.findUnique({
      where: {
        source_sourceRefId: { source: VOUCHER_SOURCE, sourceRefId: voucher.id },
      },
    });
    if (!entitlement || entitlement.lifecycleStatus === ENTITLEMENT_LIFECYCLE.REVOKED) {
      return { ok: false as const, error: '이전할 Entitlement가 없습니다.' };
    }

    const targetEntitlements = await tx.entitlement.findMany({
      where: {
        userId: input.targetUserId,
        source: VOUCHER_SOURCE,
        lifecycleStatus: { not: ENTITLEMENT_LIFECYCLE.REVOKED },
      },
    });
    const now = new Date();
    const blocking = targetEntitlements.some((e) => voucherOccupiesTimeline(e, now));
    if (blocking && entitlement.lifecycleStatus !== ENTITLEMENT_LIFECYCLE.REVOKED) {
      // Allow transfer if target has no overlapping READY/WAITING — if they do, block
      return {
        ok: false as const,
        error:
          '대상 사용자에게 이미 활성·대기 이용권이 있어 자동 이전할 수 없습니다. 기간을 정리한 뒤 다시 시도하세요.',
      };
    }

    const fromUserId = voucher.redeemedByUserId;
    await tx.voucher.update({
      where: { id: voucher.id },
      data: { redeemedByUserId: input.targetUserId },
    });
    await tx.entitlement.update({
      where: { id: entitlement.id },
      data: { userId: input.targetUserId },
    });

    await resolveVoucherEntitlementsForUser(tx, fromUserId, now);
    await resolveVoucherEntitlementsForUser(tx, input.targetUserId, now);

    await tx.voucherAuditLog.create({
      data: {
        voucherId: voucher.id,
        userId: input.targetUserId,
        actorId: input.actorId,
        action: 'TRANSFER',
        result: 'SUCCESS',
        reason,
        meta: {
          fromUserId,
          toUserId: input.targetUserId,
          startsAt: entitlement.startsAt,
          endsAt: entitlement.endsAt,
          lifecycleStatus: entitlement.lifecycleStatus,
        },
      },
    });

    return { ok: true as const };
  });
}

export async function adjustVoucherEntitlementDates(input: {
  entitlementId: string;
  actorId: string;
  reason: string;
  startsAt: Date | null;
  endsAt: Date | null;
  allowRecascade: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: '조정 사유가 필요합니다.' };

  return prisma.$transaction(async (tx) => {
    const ent = await tx.entitlement.findUnique({ where: { id: input.entitlementId } });
    if (!ent || ent.source !== VOUCHER_SOURCE) {
      return { ok: false as const, error: 'Voucher Entitlement만 조정할 수 있습니다.' };
    }
    if (ent.lifecycleStatus === ENTITLEMENT_LIFECYCLE.REVOKED) {
      return { ok: false as const, error: '회수된 이용권은 조정할 수 없습니다.' };
    }

    let startsAt = input.startsAt;
    let endsAt = input.endsAt;
    let lifecycleStatus = ent.lifecycleStatus;

    if (startsAt && endsAt) {
      if (endsAt.getTime() <= startsAt.getTime()) {
        return { ok: false as const, error: '종료일은 시작일보다 뒤여야 합니다.' };
      }
      lifecycleStatus = ENTITLEMENT_LIFECYCLE.READY;
    } else if (ent.lifecycleStatus === ENTITLEMENT_LIFECYCLE.READY) {
      return { ok: false as const, error: 'READY 이용권은 시작·종료일을 모두 지정해야 합니다.' };
    }

    const later = await tx.entitlement.findMany({
      where: {
        userId: ent.userId,
        source: VOUCHER_SOURCE,
        lifecycleStatus: { not: ENTITLEMENT_LIFECYCLE.REVOKED },
        createdAt: { gt: ent.createdAt },
      },
    });
    if (later.length > 0 && !input.allowRecascade) {
      return {
        ok: false as const,
        error:
          '이후 대기·연결 이용권이 있습니다. 기간 조정이 대기열에 영향을 줄 수 있어 차단했습니다. 확인 후 allowRecascade로 재시도하세요.',
      };
    }

    const before = {
      startsAt: ent.startsAt,
      endsAt: ent.endsAt,
      lifecycleStatus: ent.lifecycleStatus,
    };

    await tx.entitlement.update({
      where: { id: ent.id },
      data: {
        startsAt,
        endsAt,
        lifecycleStatus,
      },
    });

    if (later.length > 0 && input.allowRecascade) {
      // Reset later READY windows to waiting so resolve can rebuild chain
      await tx.entitlement.updateMany({
        where: {
          id: { in: later.map((l) => l.id) },
          lifecycleStatus: ENTITLEMENT_LIFECYCLE.READY,
        },
        data: {
          lifecycleStatus: ENTITLEMENT_LIFECYCLE.WAITING_FOR_PRIOR_VOUCHER,
          startsAt: null,
          endsAt: null,
        },
      });
      await resolveVoucherEntitlementsForUser(tx, ent.userId, new Date());
    }

    await tx.voucherAuditLog.create({
      data: {
        voucherId: ent.sourceRefId,
        userId: ent.userId,
        actorId: input.actorId,
        action: 'ADJUST_DATES',
        result: 'SUCCESS',
        reason,
        meta: {
          before,
          after: { startsAt, endsAt, lifecycleStatus },
          allowRecascade: input.allowRecascade,
        },
      },
    });

    return { ok: true as const };
  });
}
