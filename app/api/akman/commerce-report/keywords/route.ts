/**
 * GET/POST /api/akman/commerce-report/keywords — 커머스 리포트 관리 키워드 (관리자 전용)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { prisma } from '@/app/lib/prisma';

function mapRow(row: {
  id: string;
  keyword: string;
  category: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
}) {
  return {
    id: row.id,
    keyword: row.keyword,
    category: row.category,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const rows = await prisma.commerceKeyword.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return NextResponse.json({ success: true, keywords: rows.map(mapRow) });
  } catch (error) {
    console.error('[CommerceReportKeywordsGET]', error);
    return NextResponse.json({ error: '키워드 목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';
    const category = typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null;

    if (!keyword) {
      return NextResponse.json({ error: '키워드를 입력해 주세요.' }, { status: 400 });
    }

    const maxSortOrder = await prisma.commerceKeyword.aggregate({ _max: { sortOrder: true } });

    const created = await prisma.commerceKeyword.create({
      data: {
        keyword,
        category,
        sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
      },
    });

    return NextResponse.json({ success: true, keyword: mapRow(created) });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: '이미 등록된 키워드입니다.' }, { status: 409 });
    }
    console.error('[CommerceReportKeywordsPOST]', error);
    return NextResponse.json({ error: '키워드 등록에 실패했습니다.' }, { status: 500 });
  }
}
