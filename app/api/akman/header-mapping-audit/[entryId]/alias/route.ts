/**
 * POST /api/akman/header-mapping-audit/[entryId]/alias
 * 관리자 전용: 확인된 헤더 매핑 감사 엔트리를 DB HeaderAlias로 등록
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { clearHeaderAliasDictionaryCache } from '@/app/lib/header-alias-cache';
import { prisma } from '@/app/lib/prisma';
import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';

const BASE_HEADER_SET = new Set<string>([...BASE_HEADERS]);

function sanitizeAlias(value: string): string {
  return value.trim();
}

function mapAlias(row: {
  id: string;
  alias: string;
  baseHeader: string;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    alias: row.alias,
    baseHeader: row.baseHeader,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function POST(
  _request: NextRequest,
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

    const entry = await prisma.headerMappingAuditEntry.findUnique({
      where: { id: entryId },
      select: {
        id: true,
        originalHeader: true,
        baseHeader: true,
        adminSelectedBaseHeader: true,
        method: true,
        adminStatus: true,
        auditLog: {
          select: {
            expiresAt: true,
          },
        },
      },
    });

    if (!entry) {
      return NextResponse.json({ error: '엔트리를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (entry.auditLog.expiresAt && entry.auditLog.expiresAt <= new Date()) {
      return NextResponse.json({ error: '만료된 감사 로그는 별칭으로 등록할 수 없습니다.' }, { status: 400 });
    }

    if (entry.adminStatus !== 'CONFIRMED' && entry.adminStatus !== 'CHANGED') {
      return NextResponse.json({ error: 'CONFIRMED 또는 CHANGED 상태의 엔트리만 별칭으로 등록할 수 있습니다.' }, { status: 400 });
    }

    const alias = sanitizeAlias(entry.originalHeader);
    if (!alias) {
      return NextResponse.json({ error: 'originalHeader가 비어 있어 별칭으로 등록할 수 없습니다.' }, { status: 400 });
    }

    const targetBaseHeader = entry.adminSelectedBaseHeader?.trim() || entry.baseHeader?.trim();
    if (!targetBaseHeader) {
      return NextResponse.json({ error: 'targetBaseHeader가 없어 별칭으로 등록할 수 없습니다.' }, { status: 400 });
    }

    if (!BASE_HEADER_SET.has(targetBaseHeader)) {
      return NextResponse.json({ error: 'targetBaseHeader가 기준헤더 목록에 없습니다.' }, { status: 400 });
    }

    if (entry.method === 'DB_ALIAS') {
      return NextResponse.json({
        success: true,
        alreadyDbAlias: true,
        message: '이미 DB 별칭 기반으로 매핑된 엔트리입니다.',
      });
    }

    const existing = await prisma.headerAlias.findUnique({
      where: { alias },
    });

    if (existing) {
      if (existing.baseHeader === targetBaseHeader) {
        clearHeaderAliasDictionaryCache();
        return NextResponse.json({
          success: true,
          alreadyExists: true,
          data: mapAlias(existing),
        });
      }

      return NextResponse.json(
        {
          error: '이미 다른 기준헤더로 등록된 alias입니다.',
          conflict: {
            alias,
            existingBaseHeader: existing.baseHeader,
            requestedBaseHeader: targetBaseHeader,
          },
        },
        { status: 409 },
      );
    }

    const headerAlias = await prisma.headerAlias.create({
      data: {
        alias,
        baseHeader: targetBaseHeader,
        source: `header-mapping-audit:${entry.id}`,
      },
    });

    clearHeaderAliasDictionaryCache();

    return NextResponse.json({
      success: true,
      data: mapAlias(headerAlias),
    });
  } catch (error) {
    console.error('[akman/header-mapping-audit/[entryId]/alias] POST error:', error);
    return NextResponse.json(
      { error: '헤더 매핑 감사 엔트리 별칭 등록 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
