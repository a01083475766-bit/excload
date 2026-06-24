/**
 * GET /api/akman/header-mapping-audit — 관리자 전용 헤더 매핑 감사 로그 조회
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Prisma } from '@prisma/client';

import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { prisma } from '@/app/lib/prisma';

const HEADER_MAPPING_STATUSES = [
  'AUTO_MATCHED',
  'LOW_CONFIDENCE',
  'UNMAPPED',
  'NEEDS_REVIEW',
  'CONFIRMED',
  'IGNORED',
] as const;

const HEADER_MAPPING_METHODS = [
  'BASE_HEADER',
  'DB_ALIAS',
  'STATIC_ALIAS',
  'AI',
  'REFINED',
  'UNMAPPED',
] as const;

const HEADER_SAMPLE_VALUE_TYPES = [
  'DATE',
  'MONEY',
  'PHONE',
  'ADDRESS',
  'NAME',
  'MESSAGE',
  'CODE',
  'STATUS',
  'TEXT',
  'EMPTY',
] as const;

const HEADER_MAPPING_ADMIN_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'CHANGED',
  'IGNORED',
  'HOLD',
] as const;

type AliasStatus =
  | 'NOT_REGISTERED'
  | 'REGISTERED_SAME'
  | 'CONFLICT'
  | 'DB_ALIAS_SOURCE'
  | 'NOT_ELIGIBLE';

type AliasLookup = Map<string, string>;

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const n = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function parseEnum<T extends readonly string[]>(value: string | null, allowed: T): T[number] | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  return (allowed as readonly string[]).includes(v) ? v : undefined;
}

function parseSearch(value: string | null): string | undefined {
  const v = value?.trim();
  return v ? v.slice(0, 100) : undefined;
}

function parseStringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.flatMap((item) => {
    if (typeof item !== 'string') return [];
    const id = item.trim();
    return id ? [id] : [];
  });
  return [...new Set(ids)];
}

function buildEntryWhere(searchParams: URLSearchParams): Prisma.HeaderMappingAuditEntryWhereInput {
  const status = parseEnum(searchParams.get('status'), HEADER_MAPPING_STATUSES);
  const method = parseEnum(searchParams.get('method'), HEADER_MAPPING_METHODS);
  const sampleValueType = parseEnum(searchParams.get('sampleValueType'), HEADER_SAMPLE_VALUE_TYPES);
  const adminStatus = parseEnum(searchParams.get('adminStatus'), HEADER_MAPPING_ADMIN_STATUSES);
  const originalHeader = parseSearch(searchParams.get('originalHeader'));
  const baseHeader = parseSearch(searchParams.get('baseHeader'));

  const where: Prisma.HeaderMappingAuditEntryWhereInput = {};
  if (status) where.status = status;
  if (method) where.method = method;
  if (sampleValueType) where.sampleValueType = sampleValueType;
  if (adminStatus) where.adminStatus = adminStatus;
  if (originalHeader) where.originalHeader = { contains: originalHeader, mode: 'insensitive' };
  if (baseHeader) where.baseHeader = { contains: baseHeader, mode: 'insensitive' };
  return where;
}

function hasEntryFilter(where: Prisma.HeaderMappingAuditEntryWhereInput): boolean {
  return Object.keys(where).length > 0;
}

function getAliasStatus(
  row: {
    originalHeader: string;
    baseHeader: string | null;
    adminSelectedBaseHeader: string | null;
    method: string;
  },
  aliasLookup: AliasLookup,
): { aliasStatus: AliasStatus; existingAliasBaseHeader: string | null } {
  const effectiveBaseHeader = row.adminSelectedBaseHeader ?? row.baseHeader;

  if (row.method === 'DB_ALIAS') {
    return { aliasStatus: 'DB_ALIAS_SOURCE', existingAliasBaseHeader: effectiveBaseHeader };
  }

  const alias = row.originalHeader.trim();
  if (!alias || !effectiveBaseHeader) {
    return { aliasStatus: 'NOT_ELIGIBLE', existingAliasBaseHeader: null };
  }

  const existingBaseHeader = aliasLookup.get(alias) ?? null;
  if (!existingBaseHeader) {
    return { aliasStatus: 'NOT_REGISTERED', existingAliasBaseHeader: null };
  }

  return {
    aliasStatus: existingBaseHeader === effectiveBaseHeader ? 'REGISTERED_SAME' : 'CONFLICT',
    existingAliasBaseHeader: existingBaseHeader,
  };
}

function mapEntry(row: {
  id: string;
  originalHeader: string;
  baseHeader: string | null;
  status: string;
  method: string;
  confidenceReason: string | null;
  sampleValueType: string;
  maskedSamples: unknown;
  sampleCount: number;
  hasMaskedSamples: boolean;
  adminStatus: string;
  adminSelectedBaseHeader: string | null;
  adminSelectedAt: Date | null;
  adminMemo: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}, aliasLookup: AliasLookup) {
  const aliasState = getAliasStatus(row, aliasLookup);
  const effectiveBaseHeader = row.adminSelectedBaseHeader ?? row.baseHeader;
  return {
    id: row.id,
    originalHeader: row.originalHeader,
    baseHeader: row.baseHeader,
    adminSelectedBaseHeader: row.adminSelectedBaseHeader,
    adminSelectedAt: row.adminSelectedAt?.toISOString() ?? null,
    effectiveBaseHeader,
    status: row.status,
    method: row.method,
    confidenceReason: row.confidenceReason,
    sampleValueType: row.sampleValueType,
    maskedSamples: row.maskedSamples,
    sampleCount: row.sampleCount,
    hasMaskedSamples: row.hasMaskedSamples,
    adminStatus: row.adminStatus,
    adminMemo: row.adminMemo,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    aliasStatus: aliasState.aliasStatus,
    existingAliasBaseHeader: aliasState.existingAliasBaseHeader,
  };
}

function mapLog(row: {
  id: string;
  fileHash: string | null;
  user: { email: string | null } | null;
  source: string | null;
  totalHeaders: number;
  autoMatchedCount: number;
  unmappedCount: number;
  lowConfidenceCount: number;
  needsReviewCount: number;
  entriesWithMaskedSamplesCount: number;
  createdAt: Date;
  expiresAt: Date | null;
  entries: Parameters<typeof mapEntry>[0][];
}, aliasLookup: AliasLookup) {
  return {
    id: row.id,
    fileHash: row.fileHash,
    userEmail: row.user?.email ?? null,
    source: row.source,
    totalHeaders: row.totalHeaders,
    autoMatchedCount: row.autoMatchedCount,
    unmappedCount: row.unmappedCount,
    lowConfidenceCount: row.lowConfidenceCount,
    needsReviewCount: row.needsReviewCount,
    entriesWithMaskedSamplesCount: row.entriesWithMaskedSamplesCount,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    entries: row.entries.map((entry) => mapEntry(entry, aliasLookup)),
  };
}

function collectEntryAliases(rows: { entries: { originalHeader: string }[] }[]): string[] {
  return [
    ...new Set(
      rows
        .flatMap((row) => row.entries)
        .map((entry) => entry.originalHeader.trim())
        .filter(Boolean),
    ),
  ];
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parsePositiveInt(searchParams.get('page'), 1, 10_000);
    const pageSize = parsePositiveInt(searchParams.get('pageSize'), 20, 100);
    const entryLimit = parsePositiveInt(searchParams.get('entryLimit'), 20, 100);
    const source = parseSearch(searchParams.get('source'));
    const entryWhere = buildEntryWhere(searchParams);
    const entryFiltered = hasEntryFilter(entryWhere);
    const now = new Date();

    const where: Prisma.HeaderMappingAuditLogWhereInput = {
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
    if (source) where.source = { contains: source, mode: 'insensitive' };
    if (entryFiltered) where.entries = { some: entryWhere };

    const [total, rows] = await Promise.all([
      prisma.headerMappingAuditLog.count({ where }),
      prisma.headerMappingAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: {
              email: true,
            },
          },
          entries: {
            where: entryFiltered ? entryWhere : undefined,
            orderBy: { createdAt: 'asc' },
            take: entryLimit,
          },
        },
      }),
    ]);

    const aliases = collectEntryAliases(rows);
    const headerAliases =
      aliases.length > 0
        ? await prisma.headerAlias.findMany({
            where: {
              alias: { in: aliases },
            },
            select: {
              alias: true,
              baseHeader: true,
            },
          })
        : [];
    const aliasLookup = new Map(headerAliases.map((item) => [item.alias, item.baseHeader]));

    return NextResponse.json({
      data: rows.map((row) => mapLog(row, aliasLookup)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('[akman/header-mapping-audit] GET error:', error);
    return NextResponse.json(
      { error: '헤더 매핑 감사 로그 조회 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const ids = parseStringIds(body?.ids);

    if (ids.length > 0) {
      const result = await prisma.headerMappingAuditLog.deleteMany({
        where: { id: { in: ids } },
      });

      return NextResponse.json({ ok: true, deletedCount: result.count });
    }

    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) {
      return NextResponse.json({ error: '삭제할 헤더 매핑 감사 로그 ID가 필요합니다.' }, { status: 400 });
    }

    await prisma.headerMappingAuditLog.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true, deletedCount: 1 });
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (code === 'P2025') {
      return NextResponse.json({ error: '삭제할 헤더 매핑 감사 로그를 찾을 수 없습니다.' }, { status: 404 });
    }

    console.error('[akman/header-mapping-audit] DELETE error:', error);
    return NextResponse.json(
      { error: '헤더 매핑 감사 로그 삭제 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
