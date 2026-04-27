import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { hashResetCode, PASSWORD_RESET_MAX_ATTEMPTS } from '@/app/lib/password-reset';

interface SignupConfirmBody {
  email?: string;
  code?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SignupConfirmBody;
    const email = (body.email || '').trim().toLowerCase();
    const code = (body.code || '').trim();

    if (!email || !code) {
      return NextResponse.json({ error: '이메일과 인증코드를 입력해주세요.' }, { status: 400 });
    }

    const verification = await prisma.signupVerification.findUnique({
      where: { email },
    });

    if (!verification || verification.usedAt) {
      return NextResponse.json({ error: '유효한 인증요청이 없습니다. 다시 요청해주세요.' }, { status: 400 });
    }

    const now = new Date();
    if (verification.expiresAt < now) {
      await prisma.signupVerification.update({
        where: { email },
        data: { usedAt: now },
      });
      return NextResponse.json({ error: '인증코드가 만료되었습니다. 다시 요청해주세요.' }, { status: 400 });
    }

    if (verification.attemptCount >= PASSWORD_RESET_MAX_ATTEMPTS) {
      return NextResponse.json({ error: '인증 시도 횟수를 초과했습니다. 다시 요청해주세요.' }, { status: 429 });
    }

    const inputHash = hashResetCode(email, code);
    if (inputHash !== verification.codeHash) {
      await prisma.signupVerification.update({
        where: { email },
        data: { attemptCount: { increment: 1 } },
      });
      return NextResponse.json({ error: '인증코드가 올바르지 않습니다.' }, { status: 400 });
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const existingByEmail = await tx.user.findUnique({
          where: { email: verification.email },
          select: { id: true },
        });
        if (existingByEmail) {
          throw new Error('EMAIL_ALREADY_EXISTS');
        }
        const existingByPhone = await tx.user.findUnique({
          where: { phone: verification.phone },
          select: { id: true },
        });
        if (existingByPhone) {
          throw new Error('PHONE_ALREADY_EXISTS');
        }

        const initialPoints =
          verification.plan === 'FREE'
            ? 5000
            : verification.plan === 'PRO' || verification.plan === 'YEARLY'
              ? 400000
              : 5000;

        const newUser = await tx.user.create({
          data: {
            email: verification.email,
            phone: verification.phone,
            passwordHash: verification.passwordHash,
            plan: verification.plan,
            points: initialPoints,
            emailVerified: new Date(),
            deviceId: verification.deviceId || null,
            nextPointDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
          select: {
            id: true,
            email: true,
          },
        });

        await tx.signupVerification.update({
          where: { email },
          data: { usedAt: now },
        });

        return newUser;
      });

      return NextResponse.json({
        success: true,
        message: '회원가입이 완료되었습니다.',
        user: result,
      });
    } catch (txError) {
      if (txError instanceof Error && txError.message === 'EMAIL_ALREADY_EXISTS') {
        return NextResponse.json({ error: '이미 존재하는 이메일입니다.' }, { status: 400 });
      }
      if (txError instanceof Error && txError.message === 'PHONE_ALREADY_EXISTS') {
        return NextResponse.json({ error: '이미 가입에 사용된 휴대폰 번호입니다.' }, { status: 400 });
      }
      throw txError;
    }
  } catch (error) {
    console.error('[Signup Confirm] error:', error);
    return NextResponse.json({ error: '회원가입 인증 확인 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
