import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/app/lib/prisma';
import {
  hashResetCode,
  PASSWORD_RESET_MAX_ATTEMPTS,
  PASSWORD_RESET_PURPOSE,
} from '@/app/lib/password-reset';

interface PasswordResetConfirmBody {
  email?: string;
  code?: string;
  newPassword?: string;
}

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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PasswordResetConfirmBody;
    const email = (body.email || '').trim().toLowerCase();
    const code = (body.code || '').trim();
    const newPassword = body.newPassword || '';
    const ip = getClientIp(request);

    if (!email || !code || !newPassword) {
      return NextResponse.json({ error: '이메일, 인증코드, 새 비밀번호를 입력해주세요.' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: '비밀번호는 최소 6자 이상이어야 합니다.' }, { status: 400 });
    }

    const resetRecord = await prisma.passwordResetCode.findFirst({
      where: {
        email,
        purpose: PASSWORD_RESET_PURPOSE,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!resetRecord || resetRecord.usedAt) {
      await prisma.passwordResetAuditLog.create({
        data: {
          email,
          ip,
          action: 'CONFIRM_RESET',
          status: 'FAILED',
          reason: 'NO_ACTIVE_CODE',
        },
      }).catch(() => {});
      return NextResponse.json({ error: '유효한 인증코드가 없습니다. 코드를 다시 요청해주세요.' }, { status: 400 });
    }

    const now = new Date();
    if (resetRecord.expiresAt < now) {
      await prisma.passwordResetCode.updateMany({
        where: {
          id: resetRecord.id,
          usedAt: null,
        },
        data: { usedAt: now },
      });
      await prisma.passwordResetAuditLog.create({
        data: {
          email,
          ip,
          action: 'CONFIRM_RESET',
          status: 'FAILED',
          reason: 'CODE_EXPIRED',
        },
      }).catch(() => {});
      return NextResponse.json({ error: '인증코드가 만료되었습니다. 다시 요청해주세요.' }, { status: 400 });
    }

    if (resetRecord.attemptCount >= PASSWORD_RESET_MAX_ATTEMPTS) {
      await prisma.passwordResetAuditLog.create({
        data: {
          email,
          ip,
          action: 'CONFIRM_RESET',
          status: 'BLOCKED',
          reason: 'MAX_ATTEMPTS_REACHED',
        },
      }).catch(() => {});
      return NextResponse.json({ error: '인증 시도 횟수를 초과했습니다. 코드를 다시 요청해주세요.' }, { status: 429 });
    }

    const inputHash = hashResetCode(email, code);
    if (inputHash !== resetRecord.codeHash) {
      const increased = await prisma.passwordResetCode.updateMany({
        where: {
          id: resetRecord.id,
          usedAt: null,
          attemptCount: {
            lt: PASSWORD_RESET_MAX_ATTEMPTS,
          },
        },
        data: {
          attemptCount: {
            increment: 1,
          },
        },
      });

      if (increased.count === 0) {
        await prisma.passwordResetAuditLog.create({
          data: {
            email,
            ip,
            action: 'CONFIRM_RESET',
            status: 'BLOCKED',
            reason: 'MAX_ATTEMPTS_REACHED',
          },
        }).catch(() => {});
        return NextResponse.json({ error: '인증 시도 횟수를 초과했습니다. 코드를 다시 요청해주세요.' }, { status: 429 });
      }

      const latestAttempt = await prisma.passwordResetCode.findUnique({
        where: { id: resetRecord.id },
        select: { attemptCount: true },
      });

      if ((latestAttempt?.attemptCount || 0) >= PASSWORD_RESET_MAX_ATTEMPTS) {
        await prisma.passwordResetAuditLog.create({
          data: {
            email,
            ip,
            action: 'CONFIRM_RESET',
            status: 'BLOCKED',
            reason: 'MAX_ATTEMPTS_REACHED',
          },
        }).catch(() => {});
        return NextResponse.json({ error: '인증 시도 횟수를 초과했습니다. 코드를 다시 요청해주세요.' }, { status: 429 });
      }

      await prisma.passwordResetAuditLog.create({
        data: {
          email,
          ip,
          action: 'CONFIRM_RESET',
          status: 'FAILED',
          reason: 'CODE_MISMATCH',
        },
      }).catch(() => {});
      return NextResponse.json({ error: '인증코드가 올바르지 않습니다.' }, { status: 400 });
    }

    const nextPasswordHash = await hash(newPassword, 10);

    try {
      await prisma.$transaction(async (tx) => {
        const consumed = await tx.passwordResetCode.updateMany({
          where: {
            id: resetRecord.id,
            usedAt: null,
            expiresAt: {
              gt: now,
            },
            attemptCount: {
              lt: PASSWORD_RESET_MAX_ATTEMPTS,
            },
            codeHash: inputHash,
          },
          data: {
            usedAt: now,
          },
        });

        if (consumed.count !== 1) {
          throw new Error('RESET_CODE_NOT_AVAILABLE');
        }

        const updatedUser = await tx.user.updateMany({
          where: { email },
          data: {
            passwordHash: nextPasswordHash,
          },
        });

        if (updatedUser.count !== 1) {
          throw new Error('RESET_USER_NOT_FOUND');
        }
      });
    } catch (txError) {
      if (txError instanceof Error && txError.message === 'RESET_CODE_NOT_AVAILABLE') {
        await prisma.passwordResetAuditLog.create({
          data: {
            email,
            ip,
            action: 'CONFIRM_RESET',
            status: 'FAILED',
            reason: 'CODE_NOT_AVAILABLE',
          },
        }).catch(() => {});
        return NextResponse.json({ error: '인증코드가 이미 사용되었거나 만료되었습니다. 다시 요청해주세요.' }, { status: 400 });
      }
      if (txError instanceof Error && txError.message === 'RESET_USER_NOT_FOUND') {
        await prisma.passwordResetAuditLog.create({
          data: {
            email,
            ip,
            action: 'CONFIRM_RESET',
            status: 'FAILED',
            reason: 'USER_NOT_FOUND',
          },
        }).catch(() => {});
        return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
      }
      throw txError;
    }

    await prisma.passwordResetAuditLog.create({
      data: {
        email,
        ip,
        action: 'CONFIRM_RESET',
        status: 'SUCCESS',
        reason: null,
      },
    }).catch(() => {});
    return NextResponse.json({ message: '비밀번호가 변경되었습니다.' });
  } catch (error) {
    console.error('[Password Reset Confirm] error:', error);
    return NextResponse.json({ error: '비밀번호 변경 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
