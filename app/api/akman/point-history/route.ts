/**
 * 관리자 사용량(포인트) 제공·차감 이력 조회 API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { grantsOnlyPointHistoryFilter } from '@/app/lib/point-history-filter';

function parseStringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.flatMap((item) => {
    if (typeof item !== 'string') return [];
    const id = item.trim();
    return id ? [id] : [];
  });
  return [...new Set(ids)];
}

/**
 * GET /api/akman/point-history
 * scope=grants (기본): 지급·결제·관리자 조정만 (다운로드·텍스트 변환 차감 제외)
 * scope=all: 전체 이력
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    if (!isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const take = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 500);
    const scope = searchParams.get('scope') === 'all' ? 'all' : 'grants';

    const logs = await prisma.pointHistory.findMany({
      where: scope === 'grants' ? grantsOnlyPointHistoryFilter() : undefined,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        change: true,
        reason: true,
        createdAt: true,
        user: {
          select: { email: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      scope,
      logs: logs.map((log) => ({
        id: log.id,
        email: log.user?.email ?? null,
        change: log.change,
        reason: log.reason,
        createdAt: log.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[Admin Point History API] 에러:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : '사용량 이력을 불러오지 못했습니다.',
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/akman/point-history
 * 관리자 전용: 사용량 제공·결제 이력 행 삭제
 * 현재 사용자 포인트 잔액은 변경하지 않습니다.
 */
export async function DELETE(request: NextRequest) {
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
      ids?: unknown[];
    };
    const ids = body.ids !== undefined
      ? parseStringIds(body.ids)
      : typeof body.id === 'string' && body.id.trim()
        ? [body.id.trim()]
        : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: '삭제할 사용량 이력 ID가 필요합니다.' }, { status: 400 });
    }

    const result = await prisma.pointHistory.deleteMany({
      where: { id: { in: ids } },
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    });
  } catch (error) {
    console.error('[Admin Point History API] DELETE 에러:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : '사용량 이력 삭제에 실패했습니다.',
      },
      { status: 500 },
    );
  }
}
