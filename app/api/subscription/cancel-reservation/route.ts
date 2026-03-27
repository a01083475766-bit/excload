import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';

type CancelAction = 'cancel' | 'resume';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { action?: CancelAction };
    const action: CancelAction = body.action === 'resume' ? 'resume' : 'cancel';
    const cancelAtPeriodEnd = action === 'cancel';

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, plan: true },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (user.plan !== 'PRO' && user.plan !== 'YEARLY') {
      return NextResponse.json({ error: '유료 플랜 사용자만 변경할 수 있습니다.' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { cancelAtPeriodEnd },
    });

    return NextResponse.json({
      success: true,
      cancelAtPeriodEnd,
      currentPeriodEnd: null,
    });
  } catch (error) {
    console.error('[Subscription Cancel Reservation API] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '해지 예약 상태 변경에 실패했습니다.' },
      { status: 500 }
    );
  }
}
