import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { DeleteUserAccountError } from '@/app/lib/delete-user-account';
import {
  softWithdrawUserAccount,
  WITHDRAW_GRACE_DAYS,
} from '@/app/lib/account-withdrawal';

interface DeleteAccountBody {
  password?: string;
  confirmText?: string;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { passwordHash: true },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      requiresPassword: !!user.passwordHash,
    });
  } catch (error) {
    console.error('[User Delete Account GET] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '탈퇴 정보 조회 실패' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const body = (await request.json()) as DeleteAccountBody;

    if (user.passwordHash) {
      const password = (body.password ?? '').trim();
      if (!password) {
        return NextResponse.json({ error: '비밀번호를 입력해 주세요.' }, { status: 400 });
      }
      const { compare } = await import('bcryptjs');
      const matched = await compare(password, user.passwordHash);
      if (!matched) {
        return NextResponse.json({ error: '비밀번호가 일치하지 않습니다.' }, { status: 400 });
      }
    } else {
      const confirmText = (body.confirmText ?? '').trim();
      if (confirmText !== '탈퇴합니다') {
        return NextResponse.json(
          { error: '확인 문구「탈퇴합니다」를 정확히 입력해 주세요.' },
          { status: 400 },
        );
      }
    }

    const withdrawn = await softWithdrawUserAccount(user.id);

    return NextResponse.json({
      success: true,
      message: `${withdrawn.email} 계정이 탈퇴 처리되었습니다. ${WITHDRAW_GRACE_DAYS}일 이내 로그인·재가입 시 복구할 수 있으며, 잔여 사용량은 유지됩니다.`,
      purgeAt: withdrawn.purgeAt,
      graceDays: WITHDRAW_GRACE_DAYS,
    });
  } catch (error) {
    if (error instanceof DeleteUserAccountError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[User Delete Account POST] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '회원 탈퇴 처리 실패' },
      { status: 500 },
    );
  }
}
