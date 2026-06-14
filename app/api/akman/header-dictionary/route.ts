/**
 * GET /api/akman/header-dictionary — 신규 발견 헤더 목록 (관리자)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { prisma } from '@/app/lib/prisma';
import {
  isTemplateHeaderLogPage,
  isTemplateHeaderLogSource,
  sanitizeHeaderLabel,
} from '@/app/lib/template-header-log';
import type { Prisma } from '@prisma/client';

function parseDateStart(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseDateEnd(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const pageFilter = searchParams.get('page');
    const sourceFilter = searchParams.get('source');
    const headerSearch = searchParams.get('headerSearch')?.trim();
    const dateFrom = parseDateStart(searchParams.get('dateFrom'));
    const dateTo = parseDateEnd(searchParams.get('dateTo'));
    const take = Math.min(
      Math.max(parseInt(searchParams.get('limit') ?? '200', 10) || 200, 1),
      500,
    );

    const where: Prisma.HeaderDictionaryWhereInput = {};

    if (pageFilter && isTemplateHeaderLogPage(pageFilter)) {
      where.page = pageFilter;
    }
    if (sourceFilter && isTemplateHeaderLogSource(sourceFilter)) {
      where.source = sourceFilter;
    }
    if (dateFrom || dateTo) {
      where.firstSeenAt = {};
      if (dateFrom) where.firstSeenAt.gte = dateFrom;
      if (dateTo) where.firstSeenAt.lte = dateTo;
    }
    if (headerSearch) {
      const q = sanitizeHeaderLabel(headerSearch);
      if (q) {
        where.header = { contains: q, mode: 'insensitive' };
      }
    }

    const rows = await prisma.headerDictionary.findMany({
      where,
      orderBy: { firstSeenAt: 'desc' },
      take,
      include: {
        usage: { select: { count: true, lastSeenAt: true } },
      },
    });

    const data = rows.map((row) => ({
      id: row.id,
      header: row.header,
      firstSeenAt: row.firstSeenAt.toISOString(),
      page: row.page,
      source: row.source,
      exampleBaseHeader: row.exampleBaseHeader,
      usageCount: row.usage?.count ?? 0,
      lastSeenAt: row.usage?.lastSeenAt?.toISOString() ?? null,
    }));

    return NextResponse.json({ data, count: data.length });
  } catch (error) {
    console.error('[akman/header-dictionary] GET error:', error);
    return NextResponse.json(
      { error: '헤더 사전 조회 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
