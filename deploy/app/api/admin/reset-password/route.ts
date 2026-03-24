/**
 * 관리자 비밀번호 재설정 API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 관리자 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';

interface ResetPasswordRequest {
  email: string;
  newPassword: string;
}

/**
 * POST /api/admin/reset-password
 * 관리자가 사용자 비밀번호 재설정
 */
export async function POST(request: NextRequest) {
  try {
    // 관리자 권한 확인
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.email) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    // 관리자 권한 확인 (akman 또는 ADMIN_EMAIL)
    if (!isAdminEmail(session.user.email)) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    const body: ResetPasswordRequest = await request.json();
    const { email, newPassword } = body;

    // 유효성 검사
    if (!email || !newPassword) {
      return NextResponse.json(
        { error: '이메일과 새 비밀번호가 필요합니다.' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: '비밀번호는 최소 6자 이상이어야 합니다.' },
        { status: 400 }
      );
    }

    // Prisma를 사용하여 비밀번호 재설정
    try {
      const { prisma } = await import('@/app/lib/prisma');
      
      // 사용자 조회
      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
        },
      });

      if (!user) {
        return NextResponse.json(
          { error: '사용자를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      // 비밀번호 해시 생성 (btoa 사용 - 현재 시스템과 동일)
      const passwordHash = btoa(newPassword);

      // 비밀번호 업데이트
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
        },
      });

      return NextResponse.json({
        success: true,
        message: '비밀번호가 재설정되었습니다.',
        email: user.email,
      });
    } catch (dbError) {
      console.error('[Admin Reset Password API] DB 업데이트 실패:', dbError);
      return NextResponse.json(
        {
          error: '비밀번호 재설정 중 오류가 발생했습니다.',
          details: dbError instanceof Error ? dbError.message : String(dbError),
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[Admin Reset Password API] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '비밀번호 재설정 실패' },
      { status: 500 }
    );
  }
}
