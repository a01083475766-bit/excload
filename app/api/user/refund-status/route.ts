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
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const pendingRequest = await prisma.refundRequest.findFirst({
      where: {
        userId: user.id,
        status: { in: ['REQUESTED', 'APPROVED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, createdAt: true },
    });

    return NextResponse.json({
      success: true,
      hasPendingRefund: !!pendingRequest,
      refundRequest: pendingRequest
        ? {
            id: pendingRequest.id,
            status: pendingRequest.status,
            createdAt: pendingRequest.createdAt.toISOString(),
          }
        : null,
    });
  } catch (error) {
    console.error('[Refund Status API] error:', error);
    return NextResponse.json({ error: '환불 상태 조회에 실패했습니다.' }, { status: 500 });
  }
}
