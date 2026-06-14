/**
 * GET /api/akman/template-header-logs/unknown-top
 * 최근 N일 미매핑 헤더 빈도 TOP (관리자 전용)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { prisma } from '@/app/lib/prisma';
import { aggregateUnknownHeaderCounts } from '@/app/lib/template-header-log';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '30', 10) || 30, 1), 365);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 1), 200);

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    since.setUTCHours(0, 0, 0, 0);

    const rows = await prisma.templateHeaderLog.findMany({
      where: {
        createdAt: { gte: since },
      },
      select: {
        unknownHeaders: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const ranked = aggregateUnknownHeaderCounts(rows).slice(0, limit);

    return NextResponse.json({
      days,
      limit,
      count: ranked.length,
      data: ranked,
    });
  } catch (error) {
    console.error('[akman/template-header-logs/unknown-top] GET error:', error);
    return NextResponse.json(
      { error: '미매핑 헤더 집계 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
