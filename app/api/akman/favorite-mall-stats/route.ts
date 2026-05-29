import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { prisma } from '@/app/lib/prisma';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 200);

  const rows = await prisma.favoriteMallUrlStat.findMany({
    orderBy: [{ uniqueUserCount: 'desc' }, { registerCount: 'desc' }],
    take: limit,
    select: {
      id: true,
      normalizedUrl: true,
      registerCount: true,
      uniqueUserCount: true,
      updatedAt: true,
    },
  });

  const total = await prisma.favoriteMallUrlStat.count();

  return NextResponse.json({
    success: true,
    total,
    items: rows.map((row) => ({
      id: row.id,
      normalizedUrl: row.normalizedUrl,
      registerCount: row.registerCount,
      uniqueUserCount: row.uniqueUserCount,
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
}
