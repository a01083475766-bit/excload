/**
 * GET /api/akman/template-header-logs/usage-top
 * 최근 N일 헤더명별 사용 횟수 TOP (관리자 전용)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { prisma } from '@/app/lib/prisma';
import {
  aggregateHeaderUsageFromLogs,
  isTemplateHeaderLogPage,
  sanitizeHeaderLabel,
} from '@/app/lib/template-header-log';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '30', 10) || 30, 1), 365);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 1), 200);
    const pageFilter = searchParams.get('page');
    const headerSearch = searchParams.get('headerSearch')?.trim();

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    since.setUTCHours(0, 0, 0, 0);

    const rows = await prisma.templateHeaderLog.findMany({
      where: {
        createdAt: { gte: since },
        ...(pageFilter && isTemplateHeaderLogPage(pageFilter) ? { page: pageFilter } : {}),
      },
      select: {
        headers: true,
        mappedHeaders: true,
        unknownHeaders: true,
        page: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    let ranked = aggregateHeaderUsageFromLogs(rows);

    if (headerSearch) {
      const q = sanitizeHeaderLabel(headerSearch).toLowerCase();
      if (q) {
        ranked = ranked.filter((row) => row.header.toLowerCase().includes(q));
      }
    }

    ranked = ranked.slice(0, limit);

    const headerNames = ranked.map((row) => row.header);
    const dictionaryRows =
      headerNames.length > 0
        ? await prisma.headerDictionary.findMany({
            where: { header: { in: headerNames } },
            include: { usage: { select: { count: true } } },
          })
        : [];

    const dictByHeader = new Map(
      dictionaryRows.map((row) => [
        row.header,
        {
          exampleBaseHeader: row.exampleBaseHeader,
          lifetimeCount: row.usage?.count ?? null,
        },
      ]),
    );

    const data = ranked.map((row) => {
      const dict = dictByHeader.get(row.header);
      const exampleBaseHeader = row.exampleBaseHeader ?? dict?.exampleBaseHeader ?? null;
      return {
        ...row,
        exampleBaseHeader,
        isUnmapped: exampleBaseHeader == null && row.isUnmapped,
        lifetimeCount: dict?.lifetimeCount ?? null,
      };
    });

    return NextResponse.json({
      days,
      limit,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error('[akman/template-header-logs/usage-top] GET error:', error);
    return NextResponse.json(
      { error: '헤더 사용 횟수 집계 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
