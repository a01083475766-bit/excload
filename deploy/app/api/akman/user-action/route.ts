import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { userId, action } = body as { userId?: string; action?: string };

  if (!userId || !action) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  if (action === 'block') {
    await prisma.user.update({
      where: { id: userId },
      data: {
        isBlocked: true,
        blockReason: '관리자 차단',
      },
    });
  } else if (action === 'unblock') {
    await prisma.user.update({
      where: { id: userId },
      data: {
        isBlocked: false,
        blockReason: null,
      },
    });
  } else if (action === 'removePoints') {
    await prisma.user.update({
      where: { id: userId },
      data: {
        points: 0,
      },
    });
  } else {
    return NextResponse.json({ error: '알 수 없는 액션입니다.' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

