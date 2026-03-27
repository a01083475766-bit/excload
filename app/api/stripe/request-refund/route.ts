import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';

const REFUND_WINDOW_DAYS = 7;

function subtractDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

export async function POST(_request: NextRequest) {
  try {
    const body = (await _request.json().catch(() => ({}))) as {
      bankName?: string;
      accountNumber?: string;
      accountHolder?: string;
      replyEmail?: string;
    };

    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, email: true, plan: true },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const bankName = (body.bankName || '').trim();
    const accountNumber = (body.accountNumber || '').trim();
    const accountHolder = (body.accountHolder || '').trim();
    const replyEmail = (body.replyEmail || '').trim();

    if (!bankName || !accountNumber || !accountHolder || !replyEmail) {
      return NextResponse.json(
        { error: '환불 신청을 위해 은행명, 계좌번호, 예금주, 회신 이메일을 입력해 주세요.' },
        { status: 400 }
      );
    }
    if (!replyEmail.includes('@')) {
      return NextResponse.json(
        { error: '회신 이메일 형식이 올바르지 않습니다.' },
        { status: 400 }
      );
    }

    const latestPayment = await prisma.payment.findFirst({
      where: {
        userId: user.id,
        amount: { gt: 0 },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestPayment) {
      return NextResponse.json(
        { error: '환불 가능한 최근 결제 내역이 없습니다.' },
        { status: 400 }
      );
    }

    const now = new Date();
    const refundLimit = subtractDays(now, REFUND_WINDOW_DAYS);
    const outOfWindow = latestPayment.createdAt < refundLimit;

    const usedPointHistory = await prisma.pointHistory.findFirst({
      where: {
        userId: user.id,
        createdAt: { gt: latestPayment.createdAt },
        change: { lt: 0 },
      },
      orderBy: { createdAt: 'desc' },
    });

    const reason = [
      outOfWindow
        ? `환불 요청 기간(${REFUND_WINDOW_DAYS}일) 초과`
        : `환불 요청 기간(${REFUND_WINDOW_DAYS}일) 이내`,
      usedPointHistory ? '결제 이후 사용 이력 있음' : '결제 이후 사용 이력 없음',
      `회신 이메일: ${replyEmail}`,
    ].join(' | ');

    await prisma.$transaction([
      prisma.refundRequest.create({
        data: {
          userId: user.id,
          paymentId: latestPayment.id,
          type: 'REFUND',
          status: 'REQUESTED',
          bankName,
          accountNumber,
          accountHolder,
          reason,
        },
      }),
      prisma.pointHistory.create({
        data: {
          userId: user.id,
          change: 0,
          reason: 'REFUND_REQUEST_REVIEW',
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: outOfWindow
        ? `환불 신청 가능 기간(${REFUND_WINDOW_DAYS}일)이 경과한 건으로 접수되었습니다. 검토 후 영업일 기준 3~5일 내 처리 결과를 회신 이메일로 안내드립니다.`
        : '환불 신청이 접수되었습니다. 검토 후 영업일 기준 3~5일 내 처리 결과를 회신 이메일로 안내드립니다.',
    });
  } catch (error) {
    console.error('[Refund API] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '환불 신청 처리에 실패했습니다.' },
      { status: 500 }
    );
  }
}
