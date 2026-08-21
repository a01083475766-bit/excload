import { prisma } from '@/app/lib/prisma';
import { isAdminTrialActive } from '@/app/lib/admin-pro-trial';
import { getEffectivePlanForPolicy, isOpenBetaMode } from '@/app/lib/open-beta-policy';
import { getPlanDisplayName, isPaidDbPlan } from '@/app/lib/subscription/plan-change';
import { ENTITLEMENT_LIFECYCLE, VOUCHER_SOURCE } from '@/app/lib/voucher/constants';
import {
  isVoucherEntitlementActiveNow,
  resolveVoucherEntitlementsForUser,
} from '@/app/lib/voucher/resolve-entitlements';

function isFeedbackTrialActiveLocal(endsAt: Date | null | undefined, now: Date): boolean {
  if (!endsAt) return false;
  return endsAt.getTime() > now.getTime();
}

export type VoucherAccessItem = {
  lifecycleStatus: string;
  startsAt: string | null;
  endsAt: string | null;
  durationMonths: number;
};

export type EffectiveUserAccess = {
  billingPlan: string;
  /** BETA 종료 후 BETA → FREE 로 정규화한 기능/표시용 */
  effectivePlan: string;
  accessTier: 'FREE' | 'PRO';
  hasProAccess: boolean;
  proAccessUntil: string | null;
  accessLabel: string;
  hasPaidSubscription: boolean;
  canManageSubscription: boolean;
  voucherAccessUntil: string | null;
  activeVoucherCount: number;
  vouchers: VoucherAccessItem[];
  openBetaActive: boolean;
};

function maxIso(dates: (Date | null | undefined)[]): string | null {
  let max = 0;
  for (const d of dates) {
    if (d && d.getTime() > max) max = d.getTime();
  }
  return max > 0 ? new Date(max).toISOString() : null;
}

export async function getEffectiveUserAccess(
  userId: string,
  now: Date = new Date(),
): Promise<EffectiveUserAccess | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      feedbackTrialEndsAt: true,
      adminTrialEndsAt: true,
    },
  });
  if (!user) return null;

  await prisma.$transaction(async (tx) => {
    await resolveVoucherEntitlementsForUser(tx, userId, now);
  });

  const entitlements = await prisma.entitlement.findMany({
    where: {
      userId,
      source: VOUCHER_SOURCE,
      lifecycleStatus: { not: ENTITLEMENT_LIFECYCLE.REVOKED },
    },
    orderBy: [{ createdAt: 'asc' }],
  });

  const openBetaActive = isOpenBetaMode(now);
  const billingPlan = user.plan;
  const effectivePlan = getEffectivePlanForPolicy(user.plan, now);
  const hasPaidSubscription = isPaidDbPlan(user.plan);
  const adminActive = isAdminTrialActive(user.adminTrialEndsAt, now);
  const feedbackActive = isFeedbackTrialActiveLocal(user.feedbackTrialEndsAt, now);

  const activeVouchers = entitlements.filter((e) => isVoucherEntitlementActiveNow(e, now));
  const hasVoucherPro = activeVouchers.length > 0;

  const hasProAccess =
    hasPaidSubscription || adminActive || feedbackActive || hasVoucherPro;

  const accessTier: 'FREE' | 'PRO' = hasProAccess ? 'PRO' : 'FREE';

  const voucherAccessUntil = maxIso(activeVouchers.map((e) => e.endsAt));

  const trialEnds = [
    adminActive ? user.adminTrialEndsAt : null,
    feedbackActive ? user.feedbackTrialEndsAt : null,
  ];
  const proAccessUntil = hasPaidSubscription
    ? null // 구독은 별도 period UI
    : maxIso([...trialEnds, ...activeVouchers.map((e) => e.endsAt)]);

  let accessLabel: string;
  if (hasPaidSubscription) {
    accessLabel = getPlanDisplayName(user.plan);
  } else if (hasVoucherPro) {
    accessLabel = 'PRO 이용권';
  } else if (adminActive || feedbackActive) {
    accessLabel = 'PRO 체험';
  } else if (effectivePlan === 'BETA' && openBetaActive) {
    accessLabel = getPlanDisplayName('BETA');
  } else {
    accessLabel = getPlanDisplayName(
      effectivePlan === 'FREE' || effectivePlan === 'BETA' ? 'FREE' : String(effectivePlan),
    );
  }

  return {
    billingPlan,
    effectivePlan: String(effectivePlan),
    accessTier,
    hasProAccess,
    proAccessUntil,
    accessLabel,
    hasPaidSubscription,
    canManageSubscription: hasPaidSubscription,
    voucherAccessUntil,
    activeVoucherCount: activeVouchers.length,
    vouchers: entitlements.map((e) => ({
      lifecycleStatus: e.lifecycleStatus,
      startsAt: e.startsAt?.toISOString() ?? null,
      endsAt: e.endsAt?.toISOString() ?? null,
      durationMonths: e.durationMonths,
    })),
    openBetaActive,
  };
}

/** 동기 레거시 필드 + 이미 조회한 voucher 활성 여부 */
export function hasProAccessFromParts(input: {
  plan: string;
  feedbackTrialEndsAt?: Date | null;
  adminTrialEndsAt?: Date | null;
  hasActiveVoucher?: boolean;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  if (isPaidDbPlan(input.plan)) return true;
  if (isFeedbackTrialActiveLocal(input.feedbackTrialEndsAt, now)) return true;
  if (isAdminTrialActive(input.adminTrialEndsAt, now)) return true;
  if (input.hasActiveVoucher) return true;
  return false;
}
