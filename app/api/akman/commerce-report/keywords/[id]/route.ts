/**
 * PATCH/DELETE /api/akman/commerce-report/keywords/[id] — 커머스 리포트 관리 키워드 단건 (관리자 전용)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { prisma } from '@/app/lib/prisma';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const data: { isActive?: boolean; category?: string | null; sortOrder?: number } = {};

    if (typeof body.isActive === 'boolean') {
      data.isActive = body.isActive;
    }
    if (typeof body.category === 'string' || body.category === null) {
      data.category = typeof body.category === 'string' ? body.category.trim() || null : null;
    }
    if (typeof body.sortOrder === 'number') {
      data.sortOrder = body.sortOrder;
    }

    const updated = await prisma.commerceKeyword.update({ where: { id }, data });

    return NextResponse.json({
      success: true,
      keyword: {
        id: updated.id,
        keyword: updated.keyword,
        category: updated.category,
        isActive: updated.isActive,
        sortOrder: updated.sortOrder,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[CommerceReportKeywordPATCH]', error);
    return NextResponse.json({ error: '키워드 수정에 실패했습니다.' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { id } = await params;
    await prisma.commerceKeyword.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[CommerceReportKeywordDELETE]', error);
    return NextResponse.json({ error: '키워드 삭제에 실패했습니다.' }, { status: 500 });
  }
}
