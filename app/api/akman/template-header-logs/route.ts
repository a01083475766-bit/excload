/**
 * GET /api/akman/template-header-logs — 관리자 전용 양식 헤더 수집 로그
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { prisma } from '@/app/lib/prisma';
import {
  isTemplateHeaderLogPage,
  isTemplateHeaderLogSource,
  maskEmailForAdmin,
  sanitizeHeaderLabel,
  buildHeaderSetFingerprint,
  type TemplateHeaderLogMappedEntry,
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

function headersContainSearch(headers: unknown, search: string): boolean {
  if (!Array.isArray(headers)) return false;
  const q = search.toLowerCase();
  return headers.some((h) => String(h ?? '').toLowerCase().includes(q));
}

function mapLogRow(row: {
  id: string;
  createdAt: Date;
  page: string;
  templateName: string | null;
  courierName: string | null;
  headerCount: number;
  mappingSuccessRate: number | null;
  headers: unknown;
  unknownHeaders: unknown;
  mappedHeaders: unknown;
  fileSessionId: string | null;
  templateId: string | null;
  source: string;
  user: { email: string } | null;
}) {
  const unknown = Array.isArray(row.unknownHeaders)
    ? (row.unknownHeaders as string[])
    : [];
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    maskedEmail: maskEmailForAdmin(row.user?.email),
    page: row.page,
    templateName: row.templateName,
    courierName: row.courierName,
    headerCount: row.headerCount,
    unknownCount: unknown.length,
    mappingSuccessRate: row.mappingSuccessRate,
    headers: row.headers,
    unknownHeaders: row.unknownHeaders,
    mappedHeaders: row.mappedHeaders as TemplateHeaderLogMappedEntry[],
    fileSessionId: row.fileSessionId,
    templateId: row.templateId,
    source: row.source,
  };
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
    const courierName = searchParams.get('courierName')?.trim();
    const hasUnknown = searchParams.get('hasUnknown');
    const headerSearch = searchParams.get('headerSearch')?.trim();
    const dateFrom = parseDateStart(searchParams.get('dateFrom'));
    const dateTo = parseDateEnd(searchParams.get('dateTo'));
    const groupByHeaderSet = searchParams.get('groupByHeaderSet') === 'true';
    const take = Math.min(
      Math.max(parseInt(searchParams.get('limit') ?? (groupByHeaderSet ? '20' : '200'), 10) || (groupByHeaderSet ? 20 : 200), 1),
      500,
    );

    const where: Prisma.TemplateHeaderLogWhereInput = {};

    if (pageFilter && isTemplateHeaderLogPage(pageFilter)) {
      where.page = pageFilter;
    }

    if (sourceFilter && isTemplateHeaderLogSource(sourceFilter)) {
      where.source = sourceFilter;
    }

    if (courierName) {
      where.courierName = { contains: courierName, mode: 'insensitive' };
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = dateFrom;
      if (dateTo) where.createdAt.lte = dateTo;
    }

    const needsMemoryFilter = Boolean(headerSearch) || hasUnknown === 'true' || hasUnknown === 'false';

    let rows = await prisma.templateHeaderLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: needsMemoryFilter || groupByHeaderSet ? 500 : take,
      include: {
        user: { select: { email: true } },
      },
    });

    if (hasUnknown === 'true') {
      rows = rows.filter(
        (row) => Array.isArray(row.unknownHeaders) && (row.unknownHeaders as unknown[]).length > 0,
      );
    } else if (hasUnknown === 'false') {
      rows = rows.filter(
        (row) =>
          !Array.isArray(row.unknownHeaders) || (row.unknownHeaders as unknown[]).length === 0,
      );
    }

    if (headerSearch) {
      const q = sanitizeHeaderLabel(headerSearch).toLowerCase();
      if (q) {
        rows = rows.filter((row) => headersContainSearch(row.headers, q));
      }
    }

    if (groupByHeaderSet) {
      type GroupAcc = {
        fingerprint: string;
        headers: string[];
        repeatCount: number;
        latestCreatedAt: string;
        page: string;
        source: string;
        headerCount: number;
        unknownCount: number;
        mappingSuccessRate: number | null;
        logs: ReturnType<typeof mapLogRow>[];
      };

      const groups = new Map<string, GroupAcc>();

      for (const row of rows) {
        const fingerprint = buildHeaderSetFingerprint(row.headers);
        if (!fingerprint) continue;

        const mapped = mapLogRow(row);
        const existing = groups.get(fingerprint);
        if (!existing) {
          groups.set(fingerprint, {
            fingerprint,
            headers: Array.isArray(row.headers)
              ? (row.headers as string[]).map((h) => sanitizeHeaderLabel(h)).filter(Boolean)
              : [],
            repeatCount: 1,
            latestCreatedAt: mapped.createdAt,
            page: mapped.page,
            source: mapped.source,
            headerCount: mapped.headerCount,
            unknownCount: mapped.unknownCount,
            mappingSuccessRate: mapped.mappingSuccessRate,
            logs: [mapped],
          });
          continue;
        }

        existing.repeatCount += 1;
        existing.logs.push(mapped);
        if (mapped.createdAt > existing.latestCreatedAt) {
          existing.latestCreatedAt = mapped.createdAt;
          existing.page = mapped.page;
          existing.source = mapped.source;
          existing.headerCount = mapped.headerCount;
          existing.unknownCount = mapped.unknownCount;
          existing.mappingSuccessRate = mapped.mappingSuccessRate;
        }
      }

      const grouped = [...groups.values()]
        .sort(
          (a, b) =>
            b.repeatCount - a.repeatCount ||
            b.latestCreatedAt.localeCompare(a.latestCreatedAt),
        )
        .slice(0, take);

      return NextResponse.json({
        grouped: true,
        data: grouped,
        count: grouped.length,
      });
    }

    rows = rows.slice(0, take);

    const data = rows.map((row) => mapLogRow(row));

    return NextResponse.json({ grouped: false, data, count: data.length });
  } catch (error) {
    console.error('[akman/template-header-logs] GET error:', error);
    return NextResponse.json(
      { error: '로그 조회 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
