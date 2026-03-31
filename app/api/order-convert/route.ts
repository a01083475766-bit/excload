/**
 * 텍스트 주문 변환 API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 사용량 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 * 
 * POST /api/order-convert
 * body: { inputText: string }
 * 
 * 텍스트 주문 변환 실행 시 사용량 차감 기능 포함
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';

interface OrderConvertRequest {
  inputText: string;
}

// Rate Limit Map (IP 주소별 요청 횟수 기록)
const rateLimitMap = new Map<string, { count: number; time: number }>();

/**
 * POST /api/order-convert
 * 텍스트 주문 변환 (사용량 차감 포함)
 */
export async function POST(request: NextRequest) {
  try {
    // 1. 요청자의 IP 주소 가져오기
    const ip =
      request.headers.get('x-forwarded-for') ??
      request.headers.get('x-real-ip') ??
      'unknown';

    // 2. Rate Limit 검사
    const rateLimitNow = Date.now();
    const window = 60000; // 1분

    const record = rateLimitMap.get(ip);

    if (record && rateLimitNow - record.time < window) {
      if (record.count >= 5) {
        return NextResponse.json(
          { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
          { status: 429 }
        );
      }

      record.count += 1;
    } else {
      rateLimitMap.set(ip, {
        count: 1,
        time: rateLimitNow,
      });
    }

    // 3. 세션 확인
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.email) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    // 4. 요청 본문 파싱
    const body: OrderConvertRequest = await request.json();
    const { inputText } = body;

    if (!inputText || typeof inputText !== 'string') {
      return NextResponse.json(
        { error: 'inputText가 필요합니다.' },
        { status: 400 }
      );
    }

    // 5. 텍스트 입력값 길이 계산
    const textLength = inputText.length;

    // 최대 글자수 제한 (10,000자)
    if (textLength > 10000) {
      return NextResponse.json(
        { error: '최대 10,000자까지 입력 가능합니다.' },
        { status: 400 }
      );
    }

    if (textLength === 0) {
      return NextResponse.json(
        { error: '변환할 텍스트를 입력해 주세요.' },
        { status: 400 }
      );
    }

    // 6. 현재 로그인 사용자 조회
    const userEmail = session.user.email;
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        email: true,
        plan: true,
        points: true,
        nextPointDate: true,
        isBlocked: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (user.isBlocked) {
      return NextResponse.json(
        { error: '이용이 제한된 계정입니다.' },
        { status: 403 }
      );
    }

    // 6-1. 월간 사용량 자동 제공 (Lazy Update)
    const now = new Date();
    if (user.nextPointDate && now >= user.nextPointDate) {
      let newPoints = user.points;

      if (user.plan === 'FREE') {
        newPoints = 5000;
      }

      if (user.plan === 'PRO' || user.plan === 'YEARLY') {
        newPoints = 400000;
      }

      const nextMonth = new Date(user.nextPointDate);
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      await prisma.user.update({
        where: { email: userEmail },
        data: {
          points: newPoints,
          nextPointDate: nextMonth,
        },
      });

      // 업데이트된 사용자 정보 다시 조회
      const updatedUser = await prisma.user.findUnique({
        where: { email: userEmail },
        select: {
          id: true,
          email: true,
          plan: true,
          points: true,
        },
      });

      if (updatedUser) {
        Object.assign(user, updatedUser);
      }
    }

    // 7. 사용량 부족 검사
    if (user.points < textLength) {
      return NextResponse.json(
        { error: '사용량이 부족합니다.' },
        { status: 400 }
      );
    }

    // 8. 텍스트 변환 로직 실행 (기존 로직 그대로 유지)
    // ⚠️ 헌법 준수: 서버 내부에서는 ai-gateway의 handler를 직접 import하여 호출
    // AI Gateway handler 직접 호출
    const { handleNormalize29 } = await import('@/app/api/ai-gateway/route');
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: '시스템 설정 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    // AI 활성화 여부 확인
    if (process.env.NEXT_PUBLIC_AI_ENABLED !== 'true') {
      return NextResponse.json(
        { error: '현재 텍스트 분석 기능을 사용할 수 없습니다.' },
        { status: 400 }
      );
    }

    const aiGatewayResponse = await handleNormalize29(
      { type: 'normalize-29', text: inputText },
      apiKey
    );

    if (!aiGatewayResponse.ok) {
      const errorData = await aiGatewayResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: '텍스트 분석에 실패했습니다. 다시 시도해주세요.' },
        { status: aiGatewayResponse.status }
      );
    }

    const conversionResult = await aiGatewayResponse.json();

    // 변환 결과 검증
    if (!conversionResult.orders || !Array.isArray(conversionResult.orders)) {
      return NextResponse.json(
        { error: '주문 분석 결과를 처리할 수 없습니다.' },
        { status: 500 }
      );
    }

    // 9. 변환 성공 후 사용량 차감
    const updatedUser = await prisma.user.update({
      where: { email: userEmail },
      data: {
        points: {
          decrement: textLength,
        },
      },
      select: {
        id: true,
        email: true,
        plan: true,
        points: true,
      },
    });

    // 사용량 차감 로그 기록
    await prisma.pointHistory.create({
      data: {
        userId: updatedUser.id,
        change: -textLength,
        reason: 'TEXT_CONVERT',
      },
    });

    // 10. 성공 응답 반환
    return NextResponse.json({
      success: true,
      orders: conversionResult.orders,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        plan: updatedUser.plan as 'FREE' | 'PRO' | 'YEARLY',
        points: updatedUser.points,
      },
      usedPoints: textLength,
    });
  } catch (error) {
    console.error('[Order Convert API] 에러:', error);
    return NextResponse.json(
      { error: '시스템 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
