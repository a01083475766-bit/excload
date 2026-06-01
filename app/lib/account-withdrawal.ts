import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { markFingerprintsBlockedOnWithdraw } from '@/app/lib/free-benefit-fingerprint';
import Stripe from 'stripe';
import { DeleteUserAccountError } from '@/app/lib/delete-user-account';

/** 탈퇴 유예 기간(일). 이후 cron 이 계정·연관 데이터 영구 삭제 */
export const WITHDRAW_GRACE_DAYS = 7;

export const WITHDRAW_GRACE_MS = WITHDRAW_GRACE_DAYS * 24 * 60 * 60 * 1000;

export function getPurgeAtFromNow(now = new Date()): Date {
  return new Date(now.getTime() + WITHDRAW_GRACE_MS);
}

export function isWithinWithdrawGrace(
  user: { deletedAt: Date | null; purgeAt: Date | null },
  now = new Date(),
): boolean {
  return Boolean(user.deletedAt && user.purgeAt && user.purgeAt > now);
}

async function cancelActiveStripeSubscriptions(userId: string): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-02-25.clover',
  });

  const subs = await prisma.subscription.findMany({
    where: { userId },
    select: {
      stripeSubscriptionId: true,
      status: true,
    },
  });

  for (const sub of subs) {
    if (
      sub.stripeSubscriptionId &&
      ['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status)
    ) {
      try {
        await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
      } catch (error) {
        console.error('[account-withdrawal] Stripe 구독 해지 실패:', error);
      }
    }
  }
}

async function assertCanWithdraw(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      deletedAt: true,
      purgeAt: true,
    },
  });

  if (!user) {
    throw new DeleteUserAccountError('사용자를 찾을 수 없습니다.', 404);
  }

  if (isAdminEmail(user.email)) {
    throw new DeleteUserAccountError('관리자 계정은 삭제할 수 없습니다.', 400);
  }

  if (user.deletedAt) {
    throw new DeleteUserAccountError('이미 탈퇴 처리된 계정입니다.', 400);
  }

  const pendingRefund = await prisma.refundRequest.findFirst({
    where: {
      userId,
      status: { in: ['REQUESTED', 'APPROVED'] },
    },
    select: { id: true },
  });

  if (pendingRefund) {
    throw new DeleteUserAccountError(
      '환불 신청이 진행 중입니다. 처리 완료 후 탈퇴해 주세요.',
      400,
    );
  }

  return user;
}

/**
 * 회원 자진 탈퇴(유예): 데이터·포인트는 DB에 유지, purgeAt 이후 영구 삭제.
 * 무료 혜택 지문(blockedAfterWithdraw)은 영구 삭제 시에만 기록한다.
 */
export async function softWithdrawUserAccount(
  userId: string,
): Promise<{ email: string; purgeAt: string }> {
  const user = await assertCanWithdraw(userId);

  await cancelActiveStripeSubscriptions(userId);

  const now = new Date();
  const purgeAt = getPurgeAtFromNow(now);

  await prisma.user.update({
    where: { id: userId },
    data: {
      deletedAt: now,
      purgeAt,
      cancelAtPeriodEnd: true,
      subscriptionStatus: 'canceled',
    },
  });

  return {
    email: user.email,
    purgeAt: purgeAt.toISOString(),
  };
}

/** 유예 기간 내 탈퇴 취소(복구). 포인트·플랜 등 기존 값 유지. */
export async function reactivateWithdrawnUser(userId: string): Promise<{ email: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      deletedAt: true,
      purgeAt: true,
    },
  });

  if (!user) {
    throw new DeleteUserAccountError('사용자를 찾을 수 없습니다.', 404);
  }

  if (!user.deletedAt) {
    return { email: user.email };
  }

  if (!isWithinWithdrawGrace(user)) {
    throw new DeleteUserAccountError(
      '탈퇴 유예 기간이 지나 복구할 수 없습니다. 새로 가입해 주세요.',
      400,
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      deletedAt: null,
      purgeAt: null,
    },
  });

  return { email: user.email };
}

/** purgeAt 경과 계정 영구 삭제(cron). */
export async function purgeExpiredWithdrawnAccounts(): Promise<{
  purged: number;
  errors: string[];
}> {
  const now = new Date();
  const expired = await prisma.user.findMany({
    where: {
      deletedAt: { not: null },
      purgeAt: { lte: now },
    },
    select: { id: true, email: true },
  });

  const { hardDeleteUserAccountById } = await import('@/app/lib/delete-user-account');

  let purged = 0;
  const errors: string[] = [];

  for (const row of expired) {
    try {
      await hardDeleteUserAccountById(row.id);
      purged += 1;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${row.email}: ${msg}`);
      console.error('[purgeExpiredWithdrawnAccounts]', row.id, error);
    }
  }

  return { purged, errors };
}
