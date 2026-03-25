/**
 * 관리자 계정 생성 API (akman)
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 관리자 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 * 
 * 보안: 이 API는 서버에서만 실행되어야 하며, 환경 변수로 보호됩니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

interface CreateAkmanRequest {
  password: string;
  adminSecret?: string; // 보안을 위한 시크릿 키
}

/**
 * POST /api/admin/create-akman
 * akman 관리자 계정 생성
 * 
 * 이메일 형식이 아닌 "akman" 아이디로 계정을 생성합니다.
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateAkmanRequest = await request.json();
    const { password, adminSecret } = body;

    // 보안: 환경 변수로 보호 (선택적)
    if (process.env.ADMIN_CREATE_SECRET && adminSecret !== process.env.ADMIN_CREATE_SECRET) {
      return NextResponse.json(
        { error: '인증 실패' },
        { status: 401 }
      );
    }

    // 유효성 검사
    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: '비밀번호는 최소 6자 이상이어야 합니다.' },
        { status: 400 }
      );
    }

    // akman 계정이 이미 존재하는지 확인
    const existingAkman = await prisma.user.findUnique({
      where: { email: 'akman' },
    });

    if (existingAkman) {
      return NextResponse.json(
        { 
          error: 'akman 계정이 이미 존재합니다.',
          exists: true,
        },
        { status: 400 }
      );
    }

    // 비밀번호 해시 생성 (btoa 사용 - 현재 시스템과 동일)
    const passwordHash = btoa(password);

    // akman 계정 생성
    const akman = await prisma.user.create({
      data: {
        email: 'akman', // 이메일 형식이 아닌 아이디
        passwordHash,
        plan: 'PRO', // 관리자는 PRO 플랜
        points: 999999999, // 관리자 포인트
        emailVerified: new Date(), // 이메일 인증 완료 처리
      },
      select: {
        id: true,
        email: true,
        plan: true,
        points: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'akman 관리자 계정이 생성되었습니다.',
      user: {
        id: akman.id,
        email: akman.email,
        plan: akman.plan,
        points: akman.points,
      },
      loginInfo: {
        email: 'akman',
        password: '입력하신 비밀번호',
      },
    });
  } catch (error) {
    console.error('[Create Akman API] 에러:', error);
    
    // Prisma 에러 처리
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'akman 계정이 이미 존재합니다.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'akman 계정 생성 실패',
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
