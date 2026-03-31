import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';

type RefundStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
    if (!isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const requests = await prisma.refundRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ success: true, requests });
  } catch (error) {
    console.error('[Akman Refund Requests API][GET] error:', error);
    return NextResponse.json({ error: '환불 신청 목록 조회 실패' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
    if (!isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      status?: RefundStatus;
    };

    const id = (body.id || '').trim();
    const status = body.status;
    const allowed: RefundStatus[] = ['REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED'];

    if (!id || !status || !allowed.includes(status)) {
      return NextResponse.json({ error: 'id와 유효한 status가 필요합니다.' }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.refundRequest.findUnique({
        where: { id },
        select: { id: true, userId: true, status: true },
      });

      if (!current) {
        throw new Error('환불 신청 내역을 찾을 수 없습니다.');
      }

      const next = await tx.refundRequest.update({
        where: { id },
        data: {
          status,
          processedAt: status === 'REQUESTED' ? null : new Date(),
        },
      });

      // REJECTED 전환 시, 환불 신청 시점에 차감(보류)했던 사용량을 1회 복구
      const rejectedNow =
        status === 'REJECTED' && (current.status === 'REQUESTED' || current.status === 'APPROVED');

      if (rejectedNow) {
        const restoreReason = `REFUND_REQUEST_RESTORE:${id}`;
        const alreadyRestored = await tx.pointHistory.findFirst({
          where: {
            userId: current.userId,
            reason: restoreReason,
          },
          select: { id: true },
        });

        if (!alreadyRestored) {
          const holdHistory = await tx.pointHistory.findFirst({
            where: {
              userId: current.userId,
              reason: 'REFUND_REQUEST_HOLD',
              change: { lt: 0 },
            },
            orderBy: { createdAt: 'desc' },
            select: { change: true },
          });

          const restoreAmount = holdHistory ? Math.abs(holdHistory.change) : 0;
          if (restoreAmount > 0) {
            await tx.user.update({
              where: { id: current.userId },
              data: { points: { increment: restoreAmount } },
            });
            await tx.pointHistory.create({
              data: {
                userId: current.userId,
                change: restoreAmount,
                reason: restoreReason,
              },
            });
          }
        }
      }

      return next;
    });

    return NextResponse.json({ success: true, request: updated });
  } catch (error) {
    console.error('[Akman Refund Requests API][PATCH] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '환불 신청 상태 변경 실패' },
      { status: 500 }
    );
  }
}
