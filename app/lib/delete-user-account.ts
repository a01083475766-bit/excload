import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { markFingerprintsBlockedOnWithdraw } from '@/app/lib/free-benefit-fingerprint';
import Stripe from 'stripe';

export class DeleteUserAccountError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'DeleteUserAccountError';
    this.statusCode = statusCode;
  }
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
        console.error('[deleteUserAccount] Stripe 구독 해지 실패:', error);
      }
    }
  }
}

/**
 * 사용자 계정 및 연관 DB 데이터 삭제.
 * 관리자 삭제·회원 자진 탈퇴 공통 처리.
 */
export async function deleteUserAccountById(userId: string): Promise<{ email: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phone: true,
      deviceId: true,
    },
  });

  if (!user) {
    throw new DeleteUserAccountError('사용자를 찾을 수 없습니다.', 404);
  }

  if (isAdminEmail(user.email)) {
    throw new DeleteUserAccountError('관리자 계정은 삭제할 수 없습니다.', 400);
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

  await cancelActiveStripeSubscriptions(userId);

  await markFingerprintsBlockedOnWithdraw({
    email: user.email,
    phone: user.phone,
    deviceId: user.deviceId,
  });

  await prisma.$transaction([
    prisma.userFavoriteMallUrlSeen.deleteMany({ where: { userId } }),
    prisma.subscription.deleteMany({ where: { userId } }),
    prisma.pointHistory.deleteMany({ where: { userId } }),
    prisma.payment.deleteMany({ where: { userId } }),
    prisma.refundRequest.deleteMany({ where: { userId } }),
    prisma.emailVerificationToken.deleteMany({ where: { email: user.email } }),
    prisma.signupVerification.deleteMany({ where: { email: user.email } }),
    prisma.passwordResetCode.deleteMany({ where: { email: user.email } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  return { email: user.email };
}
