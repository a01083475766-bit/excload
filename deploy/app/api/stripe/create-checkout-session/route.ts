/**
 * Stripe 결제 세션 생성 API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 결제 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import Stripe from 'stripe';

interface CreateCheckoutSessionRequest {
  planType: 'monthly' | 'yearly';
}

/**
 * POST /api/stripe/create-checkout-session
 * Stripe Checkout 세션 생성
 */
export async function POST(request: NextRequest) {
  try {
    // Stripe Secret Key 확인 (가장 먼저 확인)
    if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.trim() === '') {
      console.error('[Stripe Checkout] STRIPE_SECRET_KEY가 설정되지 않았습니다.');
      return NextResponse.json(
        { error: 'Stripe Secret Key가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // Stripe 클라이언트 초기화
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-02-25.clover',
    });

    // 세션 확인
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.email) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body: CreateCheckoutSessionRequest = await request.json();
    const { planType } = body;

    // 1️⃣ planType 수신 확인 로그
    console.log('[Stripe Checkout] 수신된 planType:', planType);
    console.log('[Stripe Checkout] planType 타입:', typeof planType);
    console.log('[Stripe Checkout] planType === "monthly":', planType === 'monthly');
    console.log('[Stripe Checkout] planType === "yearly":', planType === 'yearly');

    // 유효성 검사
    if (!planType || (planType !== 'monthly' && planType !== 'yearly')) {
      console.error('[Stripe Checkout] 유효하지 않은 planType:', planType);
      return NextResponse.json(
        { error: '유효한 플랜 타입이 필요합니다. (monthly 또는 yearly)' },
        { status: 400 }
      );
    }

    const userEmail = session.user.email;
    const userId = session.user.id || 'temp-id';

    // 사용자 조회 및 기존 구독 확인
    const { prisma } = await import('@/app/lib/prisma');
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true, stripeCustomerId: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // Stripe Customer 확인 및 생성
    let customerId = user.stripeCustomerId;
    
    if (!customerId) {
      // Stripe Customer 생성
      console.log('[Stripe Checkout] Stripe Customer 생성 중:', {
        userId: user.id,
        email: userEmail,
      });
      
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          userId: user.id,
        },
      });
      
      customerId = customer.id;
      
      // DB에 stripeCustomerId 저장
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
      
      console.log('[Stripe Checkout] Stripe Customer 생성 완료:', {
        userId: user.id,
        customerId: customerId,
      });
    } else {
      console.log('[Stripe Checkout] 기존 Stripe Customer 사용:', {
        userId: user.id,
        customerId: customerId,
      });
    }

    // 기존 활성 구독 확인 (중복 구독 방지)
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: 'active',
      },
    });

    if (existingSubscription) {
      console.log('[Stripe Checkout] 중복 구독 시도 차단:', {
        userId: user.id,
        email: userEmail,
        existingSubscriptionId: existingSubscription.stripeSubscriptionId,
      });
      return NextResponse.json(
        {
          error: '이미 활성화된 구독이 있습니다.',
        },
        { status: 400 }
      );
    }

    // 2️⃣ Price ID 선택 로직 확인 로그
    console.log('[Stripe Checkout] STRIPE_MONTHLY_PRICE_ID:', process.env.STRIPE_MONTHLY_PRICE_ID);
    console.log('[Stripe Checkout] STRIPE_YEARLY_PRICE_ID:', process.env.STRIPE_YEARLY_PRICE_ID);
    
    // Stripe Price ID 설정
    const priceId = planType === 'monthly' 
      ? process.env.STRIPE_MONTHLY_PRICE_ID
      : process.env.STRIPE_YEARLY_PRICE_ID;
    
    // 3️⃣ 선택된 Price ID 확인 로그
    console.log('[Stripe Checkout] 선택된 priceId:', priceId);
    console.log('[Stripe Checkout] Price ID 선택 조건:', planType === 'monthly' ? 'monthly → STRIPE_MONTHLY_PRICE_ID' : 'yearly → STRIPE_YEARLY_PRICE_ID');

    // Price ID 유효성 검사
    if (!priceId) {
      const missingEnvVar = planType === 'monthly' ? 'STRIPE_MONTHLY_PRICE_ID' : 'STRIPE_YEARLY_PRICE_ID';
      console.error(`[Stripe Checkout] ${missingEnvVar}가 설정되지 않았습니다.`);
      return NextResponse.json(
        { error: `Stripe Price ID가 설정되지 않았습니다. (${missingEnvVar})` },
        { status: 500 }
      );
    }

    // Stripe Checkout 세션 생성
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer: customerId, // customer_email 대신 customer 사용
      metadata: {
        userId: userId,
        email: userEmail, // 요구사항: email 필드 포함
        userEmail: userEmail,
        planType: planType === 'monthly' ? 'pro' : 'yearly', // Stripe metadata는 소문자 유지 (webhook에서 변환)
      },
      subscription_data: {
        metadata: {
          userId: userId,
          email: userEmail, // 요구사항: email 필드 포함
          userEmail: userEmail,
          planType: planType === 'monthly' ? 'pro' : 'yearly', // Stripe metadata는 소문자 유지 (webhook에서 변환)
        },
      },
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/payment/cancel`,
    });

    return NextResponse.json({
      success: true,
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
    });
  } catch (error) {
    console.error('[Stripe Checkout API] 에러:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : '결제 세션 생성 실패',
        details: error instanceof Stripe.errors.StripeError ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
