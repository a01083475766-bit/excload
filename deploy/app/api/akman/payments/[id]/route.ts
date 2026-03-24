import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.email) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    if (!isAdminEmail(session.user.email)) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    const { id: paymentId } = await params;

    const result = await prisma.payment.deleteMany({
      where: { id: paymentId },
    });

    // 삭제된 건수가 0이어도 에러로 처리하지 않고 성공으로 응답
    return NextResponse.json({ success: true, deletedCount: result.count });
  } catch (error) {
    console.error('[Admin Delete Payment API] 에러:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : '결제 내역 삭제에 실패했습니다.',
      },
      { status: 500 }
    );
  }
}

