/**
 * 이메일 인증 API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 인증 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 */

import { prisma } from '@/app/lib/prisma';
import { calculateAbuseScore } from '@/app/lib/abuseScore';
import { NextResponse } from 'next/server';

/**
 * GET /api/auth/verify-email?token=xxx
 * 이메일 인증 토큰 검증 및 사용자 인증 완료 처리
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: '인증 토큰이 필요합니다.' },
        { status: 400 }
      );
    }

    // 토큰 조회
    const record = await prisma.emailVerificationToken.findUnique({
      where: { token },
    });

    if (!record) {
      return NextResponse.json(
        { error: '유효하지 않은 인증 토큰입니다.' },
        { status: 404 }
      );
    }

    // 토큰 만료 확인
    if (record.expiresAt < new Date()) {
      // 만료된 토큰 삭제
      await prisma.emailVerificationToken.delete({
        where: { token },
      });
      return NextResponse.json(
        { error: '인증 토큰이 만료되었습니다. 다시 회원가입해주세요.' },
        { status: 400 }
      );
    }

    // 1. 현재 인증 대상 사용자 조회
    const currentUser = await prisma.user.findUnique({
      where: { email: record.email },
    });

    if (!currentUser) {
      return NextResponse.json(
        { error: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 2. deviceId 기준 기존 사용자 존재 여부 확인
    let givePoints = false;

    if (currentUser.deviceId) {
      const existingDeviceUser = await prisma.user.findFirst({
        where: {
          deviceId: currentUser.deviceId,
          NOT: {
            email: record.email,
          },
        },
      });

      if (!existingDeviceUser) {
        givePoints = true;
      }
    }

    // 3. 이메일 인증 완료 및 포인트/로그 처리
    const updatedUser = await prisma.user.update({
      where: { email: record.email },
      data: {
        emailVerified: new Date(),
        points: givePoints ? 5000 : currentUser.points ?? 0,
      },
      select: {
        id: true,
      },
    });

    if (givePoints) {
      await prisma.pointHistory.create({
        data: {
          userId: updatedUser.id,
          change: 5000,
          reason: 'EMAIL_VERIFICATION_BONUS',
        },
      });
    }

    // 이메일 인증 이후 어뷰즈 점수 계산
    await calculateAbuseScore(updatedUser.id);

    // 사용된 토큰 삭제
    await prisma.emailVerificationToken.delete({
      where: { token },
    });

    return NextResponse.json({
      success: true,
      message: '이메일 인증이 완료되었습니다. 로그인해주세요.',
      givePoints,
    });
  } catch (error) {
    console.error('[Verify Email API] 에러:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '이메일 인증 처리 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}
