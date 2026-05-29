import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import {
  loadUserFavoriteMalls,
  replaceUserFavoriteMalls,
  sanitizeFavoriteMallEntries,
} from '@/app/lib/favorite-malls-server';

async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const entries = await loadUserFavoriteMalls(userId);
    return NextResponse.json({ success: true, entries });
  } catch (error) {
    console.error('[Favorite Malls GET] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '즐겨찾기 조회 실패' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = (await request.json()) as { entries?: unknown };
    const sanitized = sanitizeFavoriteMallEntries(body.entries);
    const entries = await replaceUserFavoriteMalls(userId, sanitized);

    return NextResponse.json({ success: true, entries });
  } catch (error) {
    console.error('[Favorite Malls PUT] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '즐겨찾기 저장 실패' },
      { status: 500 },
    );
  }
}
