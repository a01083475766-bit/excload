/**
 * 예약된 플랜 변경 취소
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { pendingPlan: true },
    });

    if (!user?.pendingPlan) {
      return NextResponse.json({
        success: true,
        message: '예약된 플랜 변경이 없습니다.',
      });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        pendingPlan: null,
        pendingPlanApplyAt: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: '플랜 변경 예약이 취소되었습니다.',
    });
  } catch (error) {
    console.error('[cancel-plan-change]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '플랜 변경 예약 취소에 실패했습니다.' },
      { status: 500 }
    );
  }
}
