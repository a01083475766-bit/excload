import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { sendPasswordResetCodeEmail } from '@/app/lib/mailer';
import {
  generateSixDigitCode,
  hashResetCode,
  PASSWORD_RESET_COOLDOWN_SECONDS,
  PASSWORD_RESET_EXPIRE_MINUTES,
  PASSWORD_RESET_PURPOSE,
} from '@/app/lib/password-reset';

interface PasswordResetRequestBody {
  email?: string;
}

const GENERIC_SUCCESS_MESSAGE = '이메일로 인증코드가 발송되었습니다.';
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_IP = 5;

function getClientIp(request: NextRequest) {
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

async function waitForMinimumResponse(startMs: number) {
  const targetMs = 300 + Math.floor(Math.random() * 201); // 300~500ms
  const elapsedMs = Date.now() - startMs;
  if (elapsedMs < targetMs) {
    await new Promise((resolve) => setTimeout(resolve, targetMs - elapsedMs));
  }
}

export async function POST(request: NextRequest) {
  const startMs = Date.now();
  try {
    console.log('API HIT');
    const body = (await request.json()) as PasswordResetRequestBody;
    const email = (body.email || '').trim().toLowerCase();
    console.log('EMAIL RECEIVED:', email);
    const ip = getClientIp(request);
    const now = new Date();
    const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);

    const recentCount = await prisma.passwordResetRequestLog.count({
      where: {
        ip,
        createdAt: {
          gte: windowStart,
        },
      },
    });

    if (recentCount >= RATE_LIMIT_MAX_PER_IP) {
      await prisma.passwordResetAuditLog.create({
        data: {
          email: email || 'unknown',
          ip,
          action: 'REQUEST_CODE',
          status: 'BLOCKED',
          reason: 'RATE_LIMIT_EXCEEDED',
        },
      }).catch(() => {});
      await waitForMinimumResponse(startMs);
      return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE }, { status: 429 });
    }

    await prisma.passwordResetRequestLog.create({
      data: {
        ip,
        email: email || null,
      },
    });

    if (!email || !email.includes('@')) {
      await prisma.passwordResetAuditLog.create({
        data: {
          email: email || 'unknown',
          ip,
          action: 'REQUEST_CODE',
          status: 'IGNORED',
          reason: 'INVALID_EMAIL_FORMAT',
        },
      }).catch(() => {});
      await waitForMinimumResponse(startMs);
      return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    console.log('USER FOUND:', user);

    if (!user) {
      await prisma.passwordResetAuditLog.create({
        data: {
          email,
          ip,
          action: 'REQUEST_CODE',
          status: 'IGNORED',
          reason: 'USER_NOT_FOUND',
        },
      }).catch(() => {});
      await waitForMinimumResponse(startMs);
      return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
    }

    const latestCode = await prisma.passwordResetCode.findFirst({
      where: {
        email,
        purpose: PASSWORD_RESET_PURPOSE,
        usedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        createdAt: true,
      },
    });

    if (latestCode) {
      const diffMs = now.getTime() - latestCode.createdAt.getTime();
      if (diffMs < PASSWORD_RESET_COOLDOWN_SECONDS * 1000) {
        await prisma.passwordResetAuditLog.create({
          data: {
            email,
            ip,
            action: 'REQUEST_CODE',
            status: 'IGNORED',
            reason: 'COOLDOWN_ACTIVE',
          },
        }).catch(() => {});
        await waitForMinimumResponse(startMs);
        return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
      }
    }

    const code = generateSixDigitCode();
    const codeHash = hashResetCode(email, code);
    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_EXPIRE_MINUTES * 60 * 1000);

    await prisma.$transaction([
      prisma.passwordResetCode.updateMany({
        where: {
          email,
          purpose: PASSWORD_RESET_PURPOSE,
          usedAt: null,
        },
        data: {
          usedAt: now,
        },
      }),
      prisma.passwordResetCode.create({
        data: {
          email,
          codeHash,
          expiresAt,
          purpose: PASSWORD_RESET_PURPOSE,
        },
      }),
    ]);

    console.log('BEFORE SEND MAIL');
    const mailResult = await sendPasswordResetCodeEmail({
      email,
      code,
      expireMinutes: PASSWORD_RESET_EXPIRE_MINUTES,
    });
    console.log('[Password Reset Request] mail result:', mailResult);

    await prisma.passwordResetAuditLog.create({
      data: {
        email,
        ip,
        action: 'REQUEST_CODE',
        status: mailResult.sent ? 'SUCCESS' : 'FAILED',
        reason: mailResult.sent ? null : mailResult.reason,
      },
    }).catch(() => {});

    await waitForMinimumResponse(startMs);
    return NextResponse.json({
      message: GENERIC_SUCCESS_MESSAGE,
      ...(process.env.NODE_ENV === 'development' ? { devCode: code } : {}),
    });
  } catch (error) {
    console.error('[Password Reset Request] error:', error);
    await waitForMinimumResponse(startMs);
    return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
  }
}
