/**
 * GET /api/akman/header-usage — 헤더별 사용 횟수 (관리자)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { prisma } from '@/app/lib/prisma';
import { sanitizeHeaderLabel } from '@/app/lib/template-header-log';
import type { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const headerSearch = searchParams.get('headerSearch')?.trim();
    const take = Math.min(
      Math.max(parseInt(searchParams.get('limit') ?? '200', 10) || 200, 1),
      500,
    );

    const dictionaryWhere: Prisma.HeaderDictionaryWhereInput = {};
    if (headerSearch) {
      const q = sanitizeHeaderLabel(headerSearch);
      if (q) {
        dictionaryWhere.header = { contains: q, mode: 'insensitive' };
      }
    }

    const rows = await prisma.headerUsageCount.findMany({
      where:
        Object.keys(dictionaryWhere).length > 0
          ? { dictionary: dictionaryWhere }
          : undefined,
      orderBy: [{ count: 'desc' }, { lastSeenAt: 'desc' }],
      take,
      include: {
        dictionary: {
          select: {
            header: true,
            firstSeenAt: true,
            page: true,
            source: true,
            exampleBaseHeader: true,
          },
        },
      },
    });

    const data = rows.map((row) => ({
      id: row.id,
      header: row.dictionary.header,
      count: row.count,
      lastSeenAt: row.lastSeenAt.toISOString(),
      firstSeenAt: row.dictionary.firstSeenAt.toISOString(),
      page: row.dictionary.page,
      source: row.dictionary.source,
      exampleBaseHeader: row.dictionary.exampleBaseHeader,
    }));

    return NextResponse.json({ data, count: data.length });
  } catch (error) {
    console.error('[akman/header-usage] GET error:', error);
    return NextResponse.json(
      { error: '헤더 사용량 조회 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
