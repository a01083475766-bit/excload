import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/app/lib/prisma';
import { sendSignupVerificationCodeEmail } from '@/app/lib/mailer';
import {
  generateSixDigitCode,
  hashResetCode,
  PASSWORD_RESET_COOLDOWN_SECONDS,
  PASSWORD_RESET_EXPIRE_MINUTES,
} from '@/app/lib/password-reset';
import { isValidKoreanPhoneDigits, normalizeKoreanPhoneDigits } from '@/app/lib/phone-kr';

interface SignupRequestBody {
  email?: string;
  phone?: string;
  password?: string;
  plan?: 'FREE' | 'PRO' | 'YEARLY';
  deviceId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SignupRequestBody;
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    const plan = body.plan || 'FREE';
    const phoneDigits = normalizeKoreanPhoneDigits(String(body.phone || ''));

    if (!email || !password) {
      return NextResponse.json({ error: '이메일과 비밀번호를 입력해주세요.' }, { status: 400 });
    }
    if (!isValidKoreanPhoneDigits(phoneDigits)) {
      return NextResponse.json(
        { error: '휴대폰 번호는 10~11자리 숫자(010, 011 등) 형식으로 입력해주세요.' },
        { status: 400 },
      );
    }
    if (password.length < 6) {
      return NextResponse.json({ error: '비밀번호는 최소 6자 이상이어야 합니다.' }, { status: 400 });
    }

    const blockedDomains = new Set([
      'mailinator.com',
      '10minutemail.com',
      'guerrillamail.com',
      'tempmail.com',
      'trashmail.com',
    ]);
    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (emailDomain && blockedDomains.has(emailDomain)) {
      return NextResponse.json(
        { error: '임시 이메일은 사용할 수 없습니다. 일반 이메일(Gmail, 네이버 등)을 사용해주세요.' },
        { status: 400 },
      );
    }

    const [existingEmailUser, existingPhoneUser, existingVerification] = await Promise.all([
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
      prisma.user.findUnique({ where: { phone: phoneDigits }, select: { id: true } }),
      prisma.signupVerification.findUnique({
        where: { email },
        select: { createdAt: true },
      }),
    ]);

    if (existingEmailUser) {
      return NextResponse.json({ error: '이미 존재하는 이메일입니다.' }, { status: 400 });
    }
    if (existingPhoneUser) {
      return NextResponse.json({ error: '이미 가입에 사용된 휴대폰 번호입니다.' }, { status: 400 });
    }

    const now = new Date();
    if (existingVerification) {
      const diffMs = now.getTime() - existingVerification.createdAt.getTime();
      if (diffMs < PASSWORD_RESET_COOLDOWN_SECONDS * 1000) {
        return NextResponse.json(
          { error: `코드 재전송은 ${PASSWORD_RESET_COOLDOWN_SECONDS}초 후에 가능합니다.` },
          { status: 429 },
        );
      }
    }

    const code = generateSixDigitCode();
    const codeHash = hashResetCode(email, code);
    const passwordHash = await hash(password, 10);
    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_EXPIRE_MINUTES * 60 * 1000);

    await prisma.signupVerification.upsert({
      where: { email },
      update: {
        phone: phoneDigits,
        passwordHash,
        plan,
        deviceId: body.deviceId || null,
        codeHash,
        expiresAt,
        usedAt: null,
        attemptCount: 0,
      },
      create: {
        email,
        phone: phoneDigits,
        passwordHash,
        plan,
        deviceId: body.deviceId || null,
        codeHash,
        expiresAt,
      },
    });

    const mailResult = await sendSignupVerificationCodeEmail({
      email,
      code,
      expireMinutes: PASSWORD_RESET_EXPIRE_MINUTES,
    });
    if (!mailResult.sent) {
      return NextResponse.json(
        { error: '인증코드 메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: '가입한 이메일로 코드를 보냈습니다. 코드를 입력해주세요.',
    });
  } catch (error) {
    console.error('[Signup Request] error:', error);
    return NextResponse.json({ error: '회원가입 인증코드 요청 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
