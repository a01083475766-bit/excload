import type { Entitlement, Prisma } from '@prisma/client';
import { isPaidDbPlan } from '@/app/lib/subscription/plan-change';
import { addCalendarMonthsSeoul } from '@/app/lib/voucher/calendar-months-seoul';
import { ENTITLEMENT_LIFECYCLE, VOUCHER_SOURCE } from '@/app/lib/voucher/constants';

type Tx = Prisma.TransactionClient;

/** READY and not yet ended (active or future-dated start) */
export function voucherOccupiesTimeline(e: Entitlement, now: Date): boolean {
  if (e.lifecycleStatus === ENTITLEMENT_LIFECYCLE.REVOKED) return false;
  if (
    e.lifecycleStatus === ENTITLEMENT_LIFECYCLE.WAITING_FOR_PAID_END ||
    e.lifecycleStatus === ENTITLEMENT_LIFECYCLE.WAITING_FOR_PRIOR_VOUCHER
  ) {
    return true;
  }
  if (e.lifecycleStatus === ENTITLEMENT_LIFECYCLE.READY && e.endsAt) {
    return e.endsAt.getTime() > now.getTime();
  }
  return false;
}

export function isVoucherEntitlementActiveNow(e: Entitlement, now: Date): boolean {
  if (e.lifecycleStatus !== ENTITLEMENT_LIFECYCLE.READY) return false;
  if (!e.startsAt || !e.endsAt) return false;
  const t = now.getTime();
  return e.startsAt.getTime() <= t && t < e.endsAt.getTime();
}

export function pickInitialLifecycle(input: {
  paidActive: boolean;
  hasBlockingPriorVoucher: boolean;
}): string {
  if (input.paidActive) return ENTITLEMENT_LIFECYCLE.WAITING_FOR_PAID_END;
  if (input.hasBlockingPriorVoucher) return ENTITLEMENT_LIFECYCLE.WAITING_FOR_PRIOR_VOUCHER;
  return ENTITLEMENT_LIFECYCLE.READY;
}

export function computeReadyWindow(input: {
  redeemedAt: Date;
  serviceGaAt: Date | null | undefined;
  durationMonths: number;
}): { startsAt: Date; endsAt: Date } {
  let startsAt = input.redeemedAt;
  if (input.serviceGaAt && input.serviceGaAt.getTime() > startsAt.getTime()) {
    startsAt = input.serviceGaAt;
  }
  const endsAt = addCalendarMonthsSeoul(startsAt, input.durationMonths);
  return { startsAt, endsAt };
}

export async function userHasBlockingPriorVoucher(
  tx: Tx,
  userId: string,
  now: Date,
): Promise<boolean> {
  const existing = await tx.entitlement.findMany({
    where: {
      userId,
      source: VOUCHER_SOURCE,
      lifecycleStatus: { not: ENTITLEMENT_LIFECYCLE.REVOKED },
    },
  });
  return existing.some((e) => voucherOccupiesTimeline(e, now));
}

/**
 * Lazy resolve: WAITING → READY when conditions met.
 * Uses conditional updateMany so concurrent resolves activate once.
 */
export async function resolveVoucherEntitlementsForUser(
  tx: Tx,
  userId: string,
  now: Date,
  opts?: { serviceGaAt?: Date | null },
): Promise<void> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  if (!user) return;

  const paidActive = isPaidDbPlan(user.plan);

  // Pass 1: paid waits
  if (!paidActive) {
    const paidWaits = await tx.entitlement.findMany({
      where: {
        userId,
        source: VOUCHER_SOURCE,
        lifecycleStatus: ENTITLEMENT_LIFECYCLE.WAITING_FOR_PAID_END,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    for (let i = 0; i < paidWaits.length; i++) {
      const e = paidWaits[i]!;
      if (i === 0) {
        const startsAt = now;
        const endsAt = addCalendarMonthsSeoul(startsAt, e.durationMonths);
        await tx.entitlement.updateMany({
          where: {
            id: e.id,
            lifecycleStatus: ENTITLEMENT_LIFECYCLE.WAITING_FOR_PAID_END,
          },
          data: {
            lifecycleStatus: ENTITLEMENT_LIFECYCLE.READY,
            startsAt,
            endsAt,
          },
        });
      } else {
        // Remaining paid-waits become prior-queue after first activates
        await tx.entitlement.updateMany({
          where: {
            id: e.id,
            lifecycleStatus: ENTITLEMENT_LIFECYCLE.WAITING_FOR_PAID_END,
          },
          data: { lifecycleStatus: ENTITLEMENT_LIFECYCLE.WAITING_FOR_PRIOR_VOUCHER },
        });
      }
    }
  }

  // Pass 2: drain prior queue in order (may need multiple rounds)
  for (let round = 0; round < 20; round++) {
    const list = await tx.entitlement.findMany({
      where: {
        userId,
        source: VOUCHER_SOURCE,
        lifecycleStatus: { not: ENTITLEMENT_LIFECYCLE.REVOKED },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const next = list.find(
      (e) => e.lifecycleStatus === ENTITLEMENT_LIFECYCLE.WAITING_FOR_PRIOR_VOUCHER,
    );
    if (!next) break;

    if (paidActive) {
      // Still subscribed — nothing in prior queue should start (paid end first)
      const hasPaidWait = list.some(
        (e) => e.lifecycleStatus === ENTITLEMENT_LIFECYCLE.WAITING_FOR_PAID_END,
      );
      if (hasPaidWait || paidActive) break;
    }

    const earlier = list.filter(
      (o) =>
        o.id !== next.id &&
        (o.createdAt.getTime() < next.createdAt.getTime() ||
          (o.createdAt.getTime() === next.createdAt.getTime() && o.id < next.id)),
    );

    const blocker = earlier.find((o) => voucherOccupiesTimeline(o, now));
    if (blocker) {
      if (
        blocker.lifecycleStatus === ENTITLEMENT_LIFECYCLE.READY &&
        blocker.endsAt &&
        blocker.endsAt.getTime() > now.getTime()
      ) {
        break; // wait until prior ends (lazy on later request)
      }
      if (
        blocker.lifecycleStatus === ENTITLEMENT_LIFECYCLE.WAITING_FOR_PAID_END ||
        blocker.lifecycleStatus === ENTITLEMENT_LIFECYCLE.WAITING_FOR_PRIOR_VOUCHER
      ) {
        break;
      }
    }

    let chainEnd = now.getTime();
    for (const o of earlier) {
      if (o.lifecycleStatus === ENTITLEMENT_LIFECYCLE.READY && o.endsAt) {
        chainEnd = Math.max(chainEnd, o.endsAt.getTime());
      }
    }
    if (chainEnd > now.getTime()) break;

    let startsAt = new Date(Math.max(chainEnd, now.getTime()));
    if (opts?.serviceGaAt && opts.serviceGaAt.getTime() > startsAt.getTime()) {
      startsAt = opts.serviceGaAt;
    }
    const endsAt = addCalendarMonthsSeoul(startsAt, next.durationMonths);

    const updated = await tx.entitlement.updateMany({
      where: {
        id: next.id,
        lifecycleStatus: ENTITLEMENT_LIFECYCLE.WAITING_FOR_PRIOR_VOUCHER,
      },
      data: {
        lifecycleStatus: ENTITLEMENT_LIFECYCLE.READY,
        startsAt,
        endsAt,
      },
    });
    if (updated.count === 0) break;
  }
}
