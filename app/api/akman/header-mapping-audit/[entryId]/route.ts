/**
 * PATCH /api/akman/header-mapping-audit/[entryId]
 * 관리자 전용 헤더 매핑 감사 엔트리 검토 상태 변경
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { HeaderMappingAdminStatus, type Prisma } from '@prisma/client';

import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { prisma } from '@/app/lib/prisma';
import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';

const ALLOWED_ADMIN_STATUSES = [
  HeaderMappingAdminStatus.CONFIRMED,
  HeaderMappingAdminStatus.IGNORED,
  HeaderMappingAdminStatus.HOLD,
] as const;
const BASE_HEADER_SET = new Set<string>([...BASE_HEADERS]);

type AllowedAdminStatus = (typeof ALLOWED_ADMIN_STATUSES)[number];

function isAllowedAdminStatus(value: unknown): value is AllowedAdminStatus {
  return typeof value === 'string' && (ALLOWED_ADMIN_STATUSES as readonly string[]).includes(value);
}

function sanitizeAdminMemo(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 1000) : null;
}

function sanitizeOptionalString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
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
}) {
  return {
    id: row.id,
    originalHeader: row.originalHeader,
    baseHeader: row.baseHeader,
    status: row.status,
    method: row.method,
    confidenceReason: row.confidenceReason,
    sampleValueType: row.sampleValueType,
    maskedSamples: row.maskedSamples,
    sampleCount: row.sampleCount,
    hasMaskedSamples: row.hasMaskedSamples,
    adminStatus: row.adminStatus,
    adminSelectedBaseHeader: row.adminSelectedBaseHeader,
    adminSelectedAt: row.adminSelectedAt?.toISOString() ?? null,
    adminMemo: row.adminMemo,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 });
    }

    const { entryId } = await params;
    if (!entryId) {
      return NextResponse.json({ error: 'entryId가 필요합니다.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const hasAdminSelectedBaseHeaderInput = Object.prototype.hasOwnProperty.call(
      body ?? {},
      'adminSelectedBaseHeader',
    );
    const adminSelectedBaseHeader = sanitizeOptionalString(body?.adminSelectedBaseHeader);

    if (!hasAdminSelectedBaseHeaderInput && body?.adminStatus === HeaderMappingAdminStatus.CHANGED) {
      return NextResponse.json(
        { error: 'CHANGED 상태는 adminSelectedBaseHeader가 있을 때만 사용할 수 있습니다.' },
        { status: 400 },
      );
    }

    if (
      hasAdminSelectedBaseHeaderInput &&
      (!adminSelectedBaseHeader || !BASE_HEADER_SET.has(adminSelectedBaseHeader))
    ) {
      return NextResponse.json(
        { error: 'adminSelectedBaseHeader가 기준헤더 목록에 없습니다.' },
        { status: 400 },
      );
    }

    if (!hasAdminSelectedBaseHeaderInput && !isAllowedAdminStatus(body?.adminStatus)) {
      return NextResponse.json(
        { error: 'adminStatus는 CONFIRMED, IGNORED, HOLD 중 하나여야 합니다.' },
        { status: 400 },
      );
    }

    const existing = await prisma.headerMappingAuditEntry.findUnique({
      where: { id: entryId },
      select: {
        id: true,
        baseHeader: true,
        auditLog: {
          select: {
            expiresAt: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: '엔트리를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (existing.auditLog.expiresAt && existing.auditLog.expiresAt <= new Date()) {
      return NextResponse.json({ error: '만료된 감사 로그는 수정할 수 없습니다.' }, { status: 400 });
    }

    const reviewedAt = new Date();
    const updateData: Prisma.HeaderMappingAuditEntryUpdateInput = hasAdminSelectedBaseHeaderInput
      ? {
          adminStatus:
            adminSelectedBaseHeader === existing.baseHeader
              ? HeaderMappingAdminStatus.CONFIRMED
              : HeaderMappingAdminStatus.CHANGED,
          adminSelectedBaseHeader,
          adminSelectedAt: reviewedAt,
          adminMemo: sanitizeAdminMemo(body?.adminMemo),
          reviewedAt,
        }
      : {
          adminStatus: body.adminStatus,
          adminMemo: sanitizeAdminMemo(body?.adminMemo),
          reviewedAt,
        };

    const updated = await prisma.headerMappingAuditEntry.update({
      where: { id: entryId },
      data: updateData,
      select: {
        id: true,
        originalHeader: true,
        baseHeader: true,
        status: true,
        method: true,
        confidenceReason: true,
        sampleValueType: true,
        maskedSamples: true,
        sampleCount: true,
        hasMaskedSamples: true,
        adminStatus: true,
        adminSelectedBaseHeader: true,
        adminSelectedAt: true,
        adminMemo: true,
        reviewedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      entry: mapEntry(updated),
    });
  } catch (error) {
    console.error('[akman/header-mapping-audit/[entryId]] PATCH error:', error);
    return NextResponse.json(
      { error: '헤더 매핑 감사 엔트리 상태 변경 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
