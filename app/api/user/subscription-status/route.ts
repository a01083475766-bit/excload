import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        plan: true,
        cancelAtPeriodEnd: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: ['active', 'trialing', 'past_due', 'unpaid'] },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        status: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: true,
      },
    });

    return NextResponse.json({
      success: true,
      subscription: {
        status: subscription?.status ?? null,
        cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? user.cancelAtPeriodEnd ?? false,
        currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error('[Subscription Status API] error:', error);
    return NextResponse.json({ error: '구독 상태 조회에 실패했습니다.' }, { status: 500 });
  }
}
