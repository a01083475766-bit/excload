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
      cardCompany: user.tossCardCompany || null,
      cardNumberMask: user.tossCardNumberMask || null,
    });
  } catch (error) {
    console.error('[Toss Card API] error:', error);
    return NextResponse.json({ error: '결제카드 조회에 실패했습니다.' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        plan: true,
        tossBillingKey: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (user.plan === 'PRO' || user.plan === 'YEARLY') {
      return NextResponse.json(
        {
          error:
            '유료 플랜 이용 중에는 카드 삭제 대신 구독 해지 예약을 먼저 진행해 주세요.',
        },
        { status: 409 }
      );
    }

    if (!user.tossBillingKey) {
      return NextResponse.json({ ok: true, hasBillingKey: false });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          tossBillingKey: null,
          tossCardCompany: null,
          tossCardNumberMask: null,
          tossChargeCooldownUntil: null,
        },
      }),
      prisma.subscription.updateMany({
        where: {
          userId: user.id,
          paymentProvider: 'TOSS',
        },
        data: {
          tossBillingKey: null,
        },
      }),
    ]);

    return NextResponse.json({ ok: true, hasBillingKey: false });
  } catch (error) {
    console.error('[Toss Card DELETE API] error:', error);
    return NextResponse.json({ error: '결제카드 삭제에 실패했습니다.' }, { status: 500 });
  }
}
