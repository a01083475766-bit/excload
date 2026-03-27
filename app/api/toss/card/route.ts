import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        tossBillingKey: true,
        tossCardCompany: true,
        tossCardNumberMask: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const hasBillingKey = !!user.tossBillingKey;
    const cardSummary = [user.tossCardCompany, user.tossCardNumberMask]
      .filter((v): v is string => !!v && v.trim().length > 0)
      .join(' ');

    return NextResponse.json({
      ok: true,
      hasBillingKey,
      cardSummary: cardSummary || null,
    });
  } catch (error) {
    console.error('[Toss Card API] error:', error);
    return NextResponse.json({ error: '결제카드 조회에 실패했습니다.' }, { status: 500 });
  }
}
