import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { getPlanDisplayName } from '@/app/lib/subscription/plan-change';

function paymentProviderLabel(provider: string | null): string {
  if (provider === 'TOSS') return '토스';
  if (provider === 'STRIPE') return 'Stripe';
  return provider ?? '-';
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const rows = await prisma.payment.findMany({
      where: { userId: user.id, amount: { gt: 0 } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        plan: true,
        amount: true,
        currency: true,
        paymentProvider: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      payments: rows.map((p) => ({
        id: p.id,
        plan: p.plan,
        planLabel: getPlanDisplayName(p.plan),
        amount: p.amount,
        currency: p.currency,
        paymentProvider: p.paymentProvider,
        paymentProviderLabel: paymentProviderLabel(p.paymentProvider),
        paidAt: p.createdAt.toISOString(),
        paidAtLabel: p.createdAt.toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      })),
    });
  } catch (error) {
    console.error('[Payment History API] error:', error);
    return NextResponse.json({ error: '결제 내역 조회에 실패했습니다.' }, { status: 500 });
  }
}
