import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { DeleteUserAccountError } from '@/app/lib/delete-user-account';
import {
  isWithinWithdrawGrace,
  reactivateWithdrawnUser,
} from '@/app/lib/account-withdrawal';

interface RestoreAccountBody {
  email?: string;
  password?: string;
}

/**
 * POST /api/user/restore-account
 * 탈퇴 유예 기간 내 계정 복구 (포인트·플랜 유지)
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RestoreAccountBody;
    const session = await getServerSession(authOptions);

    let userId: string | null = null;

    if (session?.user?.email) {
      const sessionUser = await prisma.user.findUnique({
        where: { email: session.user.email.trim().toLowerCase() },
        select: { id: true, deletedAt: true, purgeAt: true },
      });
      if (sessionUser?.deletedAt && isWithinWithdrawGrace(sessionUser)) {
        userId = sessionUser.id;
      }
    }

    if (!userId) {
      const email = (body.email ?? session?.user?.email ?? '').trim().toLowerCase();
      const password = (body.password ?? '').trim();

      if (!email || !password) {
        return NextResponse.json(
          { error: '이메일과 비밀번호를 입력해 주세요.' },
          { status: 400 },
        );
      }

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          passwordHash: true,
          deletedAt: true,
          purgeAt: true,
        },
      });

      if (!user?.deletedAt) {
        return NextResponse.json(
          { error: '탈퇴 유예 중인 계정이 아닙니다.' },
          { status: 400 },
        );
      }

      if (!isWithinWithdrawGrace(user)) {
        return NextResponse.json(
          { error: '탈퇴 유예 기간이 지났습니다. 새로 가입해 주세요.' },
          { status: 400 },
        );
      }

      if (!user.passwordHash) {
        return NextResponse.json(
          { error: '소셜 로그인 계정은 해당 소셜로 다시 로그인하면 복구됩니다.' },
          { status: 400 },
        );
      }

      const { compare } = await import('bcryptjs');
      const matched = await compare(password, user.passwordHash);
      if (!matched) {
        return NextResponse.json({ error: '비밀번호가 일치하지 않습니다.' }, { status: 400 });
      }

      userId = user.id;
    }

    const restored = await reactivateWithdrawnUser(userId!);

    return NextResponse.json({
      success: true,
      message: `${restored.email} 계정이 복구되었습니다. 잔여 사용량과 설정이 유지됩니다.`,
    });
  } catch (error) {
    if (error instanceof DeleteUserAccountError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[User Restore Account] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '계정 복구 실패' },
      { status: 500 },
    );
  }
}
