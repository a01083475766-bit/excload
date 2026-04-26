/**
 * 사용자 생성 API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 사용자 DB는 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isValidKoreanPhoneDigits,
  normalizeKoreanPhoneDigits,
} from '@/app/lib/phone-kr';

// ⚠️ 임시: Supabase 클라이언트가 없으므로 로컬 스토리지 방식으로 구현
// 실제 구현 시에는 Supabase 클라이언트를 사용하여 DB에 저장

interface CreateUserRequest {
  email: string;
  passwordHash: string;
  phone: string;
  plan?: 'FREE' | 'PRO' | 'YEARLY';
  deviceId?: string;
}

/**
 * POST /api/user/create
 * 회원가입 시 사용자 생성
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateUserRequest = await request.json();
    const { email, passwordHash, phone, plan = 'FREE', deviceId } = body;

    const ip =
      request.headers.get('x-forwarded-for') ??
      request.headers.get('x-real-ip') ??
      'unknown';

    // 유효성 검사
    if (!email || !passwordHash) {
      return NextResponse.json(
        { error: '이메일과 비밀번호 해시가 필요합니다.' },
        { status: 400 }
      );
    }

    if (phone === undefined || phone === null || String(phone).trim() === '') {
      return NextResponse.json(
        { error: '휴대폰 번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    const phoneDigits = normalizeKoreanPhoneDigits(String(phone));
    if (!isValidKoreanPhoneDigits(phoneDigits)) {
      return NextResponse.json(
        { error: '휴대폰 번호는 10~11자리 숫자(010, 011 등) 형식으로 입력해주세요.' },
        { status: 400 }
      );
    }

    // 이메일 도메인 필터링 (임시 이메일 차단)
    const emailDomain = email.split('@')[1]?.toLowerCase();
    const blockedDomains = [
      'mailinator.com',
      '10minutemail.com',
      'guerrillamail.com',
      'tempmail.com',
      'trashmail.com',
    ];

    if (emailDomain && blockedDomains.includes(emailDomain)) {
      return NextResponse.json(
        {
          error:
            '임시 이메일은 사용할 수 없습니다. 일반 이메일(Gmail, 네이버 등)을 사용해주세요.',
        },
        { status: 400 }
      );
    }

    // Prisma를 사용하여 DB에 사용자 생성
    try {
      const { prisma } = await import('@/app/lib/prisma');
      
      const initialPoints =
        plan === 'FREE' ? 5000 : plan === 'PRO' || plan === 'YEARLY' ? 400000 : 5000;

      // 사용자 생성
      const newUser = await prisma.user.create({
        data: {
          email,
          phone: phoneDigits,
          passwordHash, // 비밀번호 해시 저장
          plan,
          points: initialPoints,
          emailVerified: null, // 이메일 인증 전
          deviceId: deviceId || null,
          lastIp: ip,
          nextPointDate: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          ),
        },
        select: {
          id: true,
          email: true,
          plan: true,
          points: true,
          createdAt: true,
        },
      });

      // 이메일 인증 토큰 생성
      const token = crypto.randomUUID();
      await prisma.emailVerificationToken.create({
        data: {
          email,
          token,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24시간 후 만료
        },
      });

      // 이메일 인증 링크 생성
      const verifyUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/auth/verify-email?token=${token}`;
      
      // 임시: 콘솔에 인증 링크 출력 (나중에 Resend로 실제 이메일 발송)
      console.log('📧 EMAIL VERIFY LINK:', verifyUrl);

      return NextResponse.json({
        success: true,
        user: {
          id: newUser.id,
          email: newUser.email,
          plan: newUser.plan as 'FREE' | 'PRO' | 'YEARLY',
          points: newUser.points,
          createdAt: newUser.createdAt.toISOString(),
        },
        message: '회원가입이 완료되었습니다. 이메일 인증을 완료해주세요.',
        // 개발 환경에서만 인증 링크 반환
        ...(process.env.NODE_ENV === 'development' && { verifyUrl }),
      });
    } catch (dbError: any) {
      console.error('[User Create API] DB 생성 실패:', dbError);
      
      // 중복 이메일 오류 처리
      if (dbError.code === 'P2002') {
        const target = dbError?.meta?.target;
        const fields = Array.isArray(target) ? target : target ? [target] : [];
        if (fields.includes('phone')) {
          return NextResponse.json(
            { error: '이미 가입에 사용된 휴대폰 번호입니다.' },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: '이미 존재하는 이메일입니다.' },
          { status: 400 }
        );
      }
      
      // DB 연결 오류 또는 기타 오류
      // ⚠️ 개발 환경에서도 실제 DB 저장 실패 시 에러 반환
      return NextResponse.json(
        { 
          error: '데이터베이스 연결에 실패했습니다. 데이터베이스 설정을 확인해주세요.',
          details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[User Create API] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '사용자 생성 실패' },
      { status: 500 }
    );
  }
}
