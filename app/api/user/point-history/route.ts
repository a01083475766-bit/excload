import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';

function reasonLabel(reason: string): string {
  if (reason === 'FREE플랜_월간사용량자동지급') return '무료 플랜 월간 지급';
  if (reason === 'TOSS_PAYMENT_RESET') return '유료 결제 후 지급';
  if (reason === 'TOSS_RENEWAL_RESET') return '유료 정기갱신 지급';
  if (reason === 'STRIPE_PAYMENT_RESET') return 'Stripe 결제 후 지급';
  return reason || '포인트 지급';
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

    const rows = await prisma.pointHistory.findMany({
      where: {
        userId: user.id,
        change: { gt: 0 },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        change: true,
        reason: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      points: rows.map((row) => ({
        id: row.id,
        change: row.change,
        reason: row.reason,
        reasonLabel: reasonLabel(row.reason),
        grantedAt: row.createdAt.toISOString(),
        grantedAtLabel: row.createdAt.toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      })),
    });
  } catch (error) {
    console.error('[Point History API] error:', error);
    return NextResponse.json({ error: '포인트 지급 내역 조회에 실패했습니다.' }, { status: 500 });
  }
}
