import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isReservedNickname, RESERVED_NICKNAME_MESSAGE } from '@/app/lib/reserved-nickname';

interface UpdateNicknameBody {
  nickname?: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = (await request.json()) as UpdateNicknameBody;
    const nickname = (body.nickname || '').trim();

    if (nickname.length < 2 || nickname.length > 20) {
      return NextResponse.json(
        { error: '닉네임은 2자 이상 20자 이하로 입력해주세요.' },
        { status: 400 }
      );
    }

    if (isReservedNickname(nickname)) {
      return NextResponse.json({ error: RESERVED_NICKNAME_MESSAGE }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { email: session.user.email },
      data: { name: nickname },
      select: { id: true, email: true, name: true },
    });

    return NextResponse.json({
      success: true,
      user: updated,
    });
  } catch (error) {
    console.error('[User Update Nickname API] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '닉네임 저장 실패' },
      { status: 500 }
    );
  }
}
