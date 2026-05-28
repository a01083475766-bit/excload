import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';

function usageReasonLabel(reason: string): string {
  if (reason === 'TEXT_CONVERT') return '텍스트 변환';
  if (reason === 'DOWNLOAD_FILE') return '엑셀 다운로드';
  return reason || '포인트 사용';
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
        change: { lt: 0 },
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
      usages: rows.map((row) => ({
        id: row.id,
        change: Math.abs(row.change),
        reason: row.reason,
        reasonLabel: usageReasonLabel(row.reason),
        usedAt: row.createdAt.toISOString(),
        usedAtLabel: row.createdAt.toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      })),
    });
  } catch (error) {
    console.error('[Point Usage History API] error:', error);
    return NextResponse.json({ error: '포인트 사용 내역 조회에 실패했습니다.' }, { status: 500 });
  }
}
