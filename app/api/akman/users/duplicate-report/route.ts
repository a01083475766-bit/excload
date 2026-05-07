import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
    if (!isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const totalUsers = await prisma.user.count();

    // 이메일 대소문자만 다른 중복 가능성을 점검한다.
    const duplicateGroups = await prisma.$queryRaw<
      Array<{ normalized_email: string; ids: string[]; count: bigint }>
    >`
      SELECT
        lower(email) AS normalized_email,
        array_agg(id ORDER BY "createdAt" DESC) AS ids,
        count(*) AS count
      FROM "User"
      GROUP BY lower(email)
      HAVING count(*) > 1
      ORDER BY count(*) DESC, lower(email) ASC
    `;

    const duplicateUserIds = duplicateGroups.flatMap((group) => group.ids);
    const duplicateUsers = duplicateUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: duplicateUserIds } },
          select: {
            id: true,
            email: true,
            phone: true,
            signupProvider: true,
            lastLoginProvider: true,
            createdAt: true,
          },
        })
      : [];

    const userMap = new Map(duplicateUsers.map((u) => [u.id, u]));

    const groups = duplicateGroups.map((group) => ({
      normalizedEmail: group.normalized_email,
      count: Number(group.count),
      users: group.ids
        .map((id) => userMap.get(id))
        .filter((u): u is NonNullable<typeof u> => Boolean(u))
        .map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
        })),
    }));

    const providerCounts = await prisma.user.groupBy({
      by: ['signupProvider'],
      _count: { _all: true },
    });

    return NextResponse.json({
      success: true,
      summary: {
        checkedAt: new Date().toISOString(),
        totalUsers,
        duplicateEmailGroupCount: groups.length,
        duplicateUserCount: duplicateUserIds.length,
        signupProviderCounts: providerCounts.map((row) => ({
          provider: row.signupProvider,
          count: row._count._all,
        })),
      },
      groups,
    });
  } catch (error) {
    console.error('[Admin Duplicate Report API] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '중복 계정 리포트 조회 실패' },
      { status: 500 }
    );
  }
}
