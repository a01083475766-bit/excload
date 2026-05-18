/**
 * 정기결제 실패 · 유예기간 처리 (토스 빌링 최소 안전장치)
 */
import { prisma } from '@/app/lib/prisma';

export const SUBSCRIPTION_GRACE_DAYS = 7;

export type SubscriptionStatusValue = 'active' | 'past_due' | 'canceled';

export function isPastDueStatus(status: string | null | undefined): boolean {
  return status === 'past_due';
}

export function paymentFailureClearData() {
  return {
    subscriptionStatus: 'active' as const,
    paymentFailedAt: null,
    paymentFailureReason: null,
    paymentRetryCount: 0,
    gracePeriodUntil: null,
  };
}

/** 유예 만료 시 FREE + canceled. true면 다운그레이드 수행됨 */
export async function applyGraceExpiryIfNeeded(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      subscriptionStatus: true,
      gracePeriodUntil: true,
    },
  });
  if (!user || user.subscriptionStatus !== 'past_due') return false;
  if (!user.gracePeriodUntil || user.gracePeriodUntil.getTime() > Date.now()) return false;

  await prisma.user.update({
    where: { id: userId },
    data: {
      plan: 'FREE',
      subscriptionStatus: 'canceled',
      cancelAtPeriodEnd: false,
    },
  });
  return true;
}

export async function recordPaymentFailure(
  userId: string,
  reason: string,
  code?: string
): Promise<void> {
  const now = new Date();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { gracePeriodUntil: true, paymentRetryCount: true },
  });
  if (!user) return;

  const reasonText = [code, reason].filter(Boolean).join(' · ').slice(0, 500);
  const existingGrace =
    user.gracePeriodUntil && user.gracePeriodUntil.getTime() > now.getTime()
      ? user.gracePeriodUntil
      : null;
  const gracePeriodUntil =
    existingGrace ?? new Date(now.getTime() + SUBSCRIPTION_GRACE_DAYS * 24 * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: 'past_due',
      paymentFailedAt: now,
      paymentFailureReason: reasonText || '결제 승인 실패',
      paymentRetryCount: { increment: 1 },
      gracePeriodUntil,
    },
  });
}

export async function clearPaymentFailureOnCardUpdate(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: paymentFailureClearData(),
  });
}
