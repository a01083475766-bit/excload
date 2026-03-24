/**
 * Stripe Webhook API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 결제 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { headers } from 'next/headers';

// Stripe 클라이언트 초기화
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-02-25.clover',
});

/**
 * POST /api/stripe/webhook
 * Stripe 이벤트 처리
 */
export async function POST(request: NextRequest) {
  try {
    // 환경 변수 확인
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      console.error('[Stripe Webhook] 환경 변수가 설정되지 않았습니다.');
      return NextResponse.json(
        { error: 'Webhook 설정 오류' },
        { status: 500 }
      );
    }

    // Raw body 처리 (중요: JSON.parse 하지 않고 text()로 처리)
    const body = await request.text();
    console.log('[Stripe Webhook] Raw body 길이:', body.length);
    console.log('[Stripe Webhook] Raw body 처음 200자:', body.substring(0, 200));
    
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');
    console.log('[Stripe Webhook] signature:', signature);

    if (!signature) {
      console.error('[Stripe Webhook] 400 에러: stripe-signature 헤더가 없습니다.');
      console.error('[Stripe Webhook] 요청 헤더:', {
        'stripe-signature': signature,
        'content-type': headersList.get('content-type'),
        'user-agent': headersList.get('user-agent'),
        'all-headers': Object.fromEntries(headersList.entries()),
      });
      return NextResponse.json(
        { error: 'Stripe 서명이 없습니다.' },
        { status: 400 }
      );
    }

    // Webhook 이벤트 검증
    console.log('[Stripe Webhook] ENV SECRET:', process.env.STRIPE_WEBHOOK_SECRET);
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('[Stripe Webhook] 400 에러: 서명 검증 실패');
      console.error('[Stripe Webhook] 서명 검증 실패 상세:', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        name: err instanceof Error ? err.name : undefined,
      });
      console.error('[Stripe Webhook] 검증 시도 정보:', {
        bodyLength: body.length,
        signature: signature ? `${signature.substring(0, 50)}...` : null,
        secretExists: !!process.env.STRIPE_WEBHOOK_SECRET,
        secretLength: process.env.STRIPE_WEBHOOK_SECRET?.length || 0,
      });
      return NextResponse.json(
        { error: 'Webhook 서명 검증 실패' },
        { status: 400 }
      );
    }

    console.log('[Stripe Webhook] event type:', event.type);
    console.log('[Stripe Webhook] event id:', event.id);

    // Stripe 이벤트 중복 방지
    const { prisma } = await import('@/app/lib/prisma');
    const existingEvent = await prisma.stripeEvent.findUnique({
      where: { eventId: event.id },
    });

    if (existingEvent) {
      console.log('[Stripe Webhook] 이미 처리된 Stripe 이벤트:', event.id);
      return NextResponse.json({ received: true });
    }

    // 이벤트 타입별 처리
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      
      // Checkout 세션 metadata에서 정보 가져오기
      const metadata = session.metadata || {};
      const userId = metadata.userId;
      const userEmail = metadata.email || metadata.userEmail || session.customer_email;
      // planType을 plan으로 변환하고 값 형식 통일
      const planTypeFromMetadata = metadata.planType || 'pro';
      const plan = planTypeFromMetadata === 'pro' ? 'PRO' : planTypeFromMetadata === 'yearly' ? 'YEARLY' : 'PRO';

      if (!userEmail) {
        console.error('[Stripe Webhook] 400 에러: 사용자 이메일을 찾을 수 없습니다.');
        console.error('[Stripe Webhook] 세션 정보:', {
          sessionId: session.id,
          metadata: session.metadata,
          customerEmail: session.customer_email,
          customer: session.customer,
        });
        return NextResponse.json(
          { error: '사용자 정보를 찾을 수 없습니다.' },
          { status: 400 }
        );
      }

      try {
        // 사용자 ID 조회
        const { prisma } = await import('@/app/lib/prisma');
        const user = await prisma.user.findUnique({
          where: { email: userEmail },
          select: { id: true },
        });

        if (!user) {
          console.error('[Stripe Webhook] 400 에러: 사용자를 찾을 수 없습니다.');
          console.error('[Stripe Webhook] 사용자 조회 실패 정보:', {
            userEmail,
            sessionId: session.id,
            metadata: session.metadata,
          });
          return NextResponse.json(
            { error: '사용자를 찾을 수 없습니다.' },
            { status: 400 }
          );
        }

        // 1. 결제 기록 생성
        const amount = plan === 'PRO' ? 4000 : 40000;
        await prisma.payment.create({
          data: {
            userId: user.id,
            email: userEmail,
            plan: plan,
            amount: amount,
            currency: 'KRW',
            stripeSessionId: session.id,
            stripeSubscriptionId: session.subscription as string | null,
            stripeInvoiceId: null,
          },
        });

        // 2. 사용자 플랜 변경 (PRO / YEARLY) - 직접 DB 업데이트
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              plan: plan,
              stripeCustomerId: session.customer as string | null,
            },
          });

          console.log('[Stripe Webhook] 플랜 업데이트 완료:', {
            userId: user.id,
            email: userEmail,
            plan: plan,
          });
        } catch (planError) {
          console.error('[Stripe Webhook] 플랜 업데이트 실패:', planError);
          throw planError; // 플랜 업데이트 실패 시 전체 트랜잭션 롤백
        }
      } catch (error) {
        console.error('[Stripe Webhook] 처리 중 오류 발생:', error);
        console.error('[Stripe Webhook] 오류 상세:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          userEmail,
          plan,
          sessionId: session.id,
        });
        // 오류 발생 시 500 반환하여 Stripe가 재시도할 수 있도록 함
        return NextResponse.json(
          { error: 'Webhook 처리 중 오류가 발생했습니다.' },
          { status: 500 }
        );
      }

      // Stripe 이벤트 처리 완료 기록
      await prisma.stripeEvent.create({
        data: {
          eventId: event.id,
        },
      });

      console.log('[Stripe Webhook] checkout.session.completed 처리 완료:', {
        userEmail,
        plan,
        sessionId: session.id,
        eventId: event.id,
      });
    } else if (
      event.type === 'invoice.payment_succeeded' ||
      event.type === 'invoice.payment.paid' ||
      event.type === 'invoice_payment.paid'
    ) {
      // Webhook payload 확인을 위한 로그
      console.log(`[Stripe Webhook] ${event.type} payload:`, JSON.stringify(event.data.object, null, 2));
      
      // invoice_payment.paid는 invoice_payment 객체를 전달함
      let invoice: Stripe.Invoice | null = null;
      let invoicePayment: any = null;
      let customerId: string | null = null;
      
      if (event.type === 'invoice_payment.paid') {
        // invoice_payment.paid는 invoice_payment 객체를 전달
        invoicePayment = event.data.object;
        console.log('[Stripe Webhook] invoice_payment.paid 이벤트 - invoice_payment 처리');
        
        // invoice_payment에서 invoice ID 추출
        const invoiceId = typeof invoicePayment.invoice === 'string' 
          ? invoicePayment.invoice 
          : (invoicePayment.invoice as any)?.id || null;
        
        if (!invoiceId) {
          console.error('[Stripe Webhook] invoice_payment에서 Invoice ID를 찾을 수 없습니다.');
          console.error('[Stripe Webhook] invoice_payment 정보:', {
            invoicePaymentId: invoicePayment.id,
            invoice: invoicePayment.invoice,
          });
          return NextResponse.json(
            { error: 'Invoice ID를 찾을 수 없습니다.' },
            { status: 400 }
          );
        }
        
        // invoice_payment의 status가 'paid'인지 확인
        if (invoicePayment.status !== 'paid') {
          console.log('[Stripe Webhook] invoice_payment status가 paid가 아님 → 포인트 지급 건너뜀', {
            invoicePaymentId: invoicePayment.id,
            status: invoicePayment.status,
          });
          return NextResponse.json({ received: true });
        }
        
        // Invoice 조회하여 customer ID 가져오기
        try {
          invoice = await stripe.invoices.retrieve(invoiceId);
          console.log('[Stripe Webhook] Invoice 조회 성공:', {
            invoiceId: invoice.id,
            customer: invoice.customer,
            status: invoice.status,
          });
        } catch (invoiceError) {
          console.error('[Stripe Webhook] Invoice 조회 실패:', invoiceError);
          return NextResponse.json(
            { error: 'Invoice 조회 실패' },
            { status: 400 }
          );
        }
        
        // Customer ID 추출 및 검증
        customerId = typeof invoice.customer === 'string' 
          ? invoice.customer 
          : (invoice.customer as any)?.id || null;
        
        if (!customerId) {
          console.error('[Stripe Webhook] Invoice에서 Customer ID를 찾을 수 없습니다.');
          console.error('[Stripe Webhook] Invoice 정보:', {
            invoiceId: invoice.id,
            customer: invoice.customer,
          });
          return NextResponse.json(
            { error: 'Customer ID를 찾을 수 없습니다.' },
            { status: 400 }
          );
        }
      } else {
        // invoice.payment_succeeded 또는 invoice.payment.paid는 Invoice 객체
        invoice = event.data.object as Stripe.Invoice;
        
        // 결제 성공 여부 검증 (invoice.paid 대신 invoice.status 사용)
        if (invoice.status !== 'paid') {
          console.log('[Stripe Webhook] invoice.status가 paid가 아님 → 포인트 지급 건너뜀', {
            invoiceId: invoice.id,
            status: invoice.status,
            paid: invoice.paid,
          });
          return NextResponse.json({ received: true });
        }
        
        // Customer ID 추출 및 검증
        customerId = typeof invoice.customer === 'string' 
          ? invoice.customer 
          : (invoice.customer as any)?.id || null;
        
        if (!customerId) {
          console.error('[Stripe Webhook] 400 에러: Customer ID를 찾을 수 없습니다.');
          console.error('[Stripe Webhook] Invoice 정보:', {
            invoiceId: invoice.id,
            customer: invoice.customer,
          });
          return NextResponse.json(
            { error: 'Customer ID를 찾을 수 없습니다.' },
            { status: 400 }
          );
        }
      }
      
      // 구독 정보 확인 (invoice가 있을 경우만)
      // invoice.subscription 또는 invoice.parent.subscription_details.subscription에서 추출
      let subscriptionId: string | undefined = undefined;
      if (invoice) {
        subscriptionId = (invoice as any).subscription as string | undefined;
        if (!subscriptionId && (invoice as any).parent?.subscription_details?.subscription) {
          subscriptionId = (invoice as any).parent.subscription_details.subscription as string;
        }
      }
      
      if (!subscriptionId) {
        console.log('[Stripe Webhook] subscriptionId 없음 - invoice 이벤트 처리 계속 진행');
      }

      // catch 블록에서 사용할 변수들을 try 블록 밖에서 선언
      let userEmail: string | null = null;
      let plan: string = 'PRO';
      let subscription: Stripe.Subscription | null = null;
      
      try {
        // Subscription 조회 (있을 경우만)
        if (subscriptionId) {
          subscription = await stripe.subscriptions.retrieve(subscriptionId);

          // subscription 객체 null 체크
          if (!subscription || !subscription.id) {
            console.error('[Stripe Webhook] Subscription을 찾을 수 없거나 ID가 없습니다.');
            console.error('[Stripe Webhook] Subscription 조회 실패 정보:', {
              subscriptionId,
              invoiceId: invoice?.id,
            });
            // Subscription 조회 실패해도 계속 진행 (일회성 결제일 수 있음)
          } else {
            // subscription metadata에서 정보 가져오기
            const metadata = subscription.metadata || {};
            // planType을 plan으로 변환하고 값 형식 통일
            const planTypeFromMetadata = metadata.planType || 'pro';
            plan = planTypeFromMetadata === 'pro' ? 'PRO' : planTypeFromMetadata === 'yearly' ? 'YEARLY' : 'PRO';
            
            console.log('[Stripe Webhook] Subscription metadata에서 plan 추출:', {
              planTypeFromMetadata,
              plan,
              metadata: metadata,
            });
          }
        }

        // plan 값 undefined 체크 (기본값 'PRO'가 있지만 안전을 위해 확인)
        if (!plan || plan === undefined) {
          plan = 'PRO'; // 기본값 설정
        }
        
        // customerId는 이미 위에서 추출했으므로 재확인만 수행
        if (!customerId) {
          console.error('[Stripe Webhook] 400 에러: Customer ID를 찾을 수 없습니다.');
          console.error('[Stripe Webhook] 정보:', {
            invoiceId: invoice?.id,
            subscriptionId,
            customer: invoice?.customer,
          });
          return NextResponse.json(
            { error: 'Customer ID를 찾을 수 없습니다.' },
            { status: 400 }
          );
        }

        // 사용자 조회 - customerId 기반
        const { prisma } = await import('@/app/lib/prisma');
        console.log('[Stripe Webhook] 사용자 조회 시작 (customerId 기반):', {
          customerId,
          plan,
        });
        
        let user = await prisma.user.findUnique({
          where: { stripeCustomerId: customerId },
          select: {
            id: true,
            email: true,
            points: true,
          },
        });

        // stripeCustomerId로 찾지 못한 경우, invoice의 customer_email로 조회 시도
        if (!user && invoice?.customer_email) {
          console.log('[Stripe Webhook] stripeCustomerId로 사용자를 찾지 못함, email로 재조회 시도:', {
            customerId,
            email: invoice.customer_email,
          });
          
          user = await prisma.user.findUnique({
            where: { email: invoice.customer_email },
            select: {
              id: true,
              email: true,
              points: true,
            },
          });
          
          // email로 찾은 경우 stripeCustomerId 업데이트
          if (user) {
            console.log('[Stripe Webhook] email로 사용자 찾음, stripeCustomerId 업데이트:', {
              userId: user.id,
              email: user.email,
              customerId,
            });
            
            await prisma.user.update({
              where: { id: user.id },
              data: { stripeCustomerId: customerId },
            });
          }
        }

        console.log('[Stripe Webhook] 사용자 조회 결과:', {
          customerId,
          userFound: !!user,
          userId: user?.id,
          userEmail: user?.email,
          currentPoints: user?.points,
        });

        // 4️⃣ prisma.user.update 실행 전에 user 존재 여부 확인
        if (!user || !user.id) {
          console.error('[Stripe Webhook] 사용자를 찾을 수 없습니다:', {
            customerId,
            invoiceEmail: invoice?.customer_email,
            userExists: !!user,
            userId: user?.id,
          });
          return NextResponse.json(
            { error: '사용자를 찾을 수 없습니다. stripeCustomerId 및 email로 조회 실패.' },
            { status: 400 }
          );
        }

        // userEmail 변수 설정 (로깅 및 Payment 기록용)
        userEmail = user.email;

        // Invoice ID 추출 (중복 체크용)
        const invoiceId = invoice?.id || null;
        
        // 중복 지급 방지: 같은 invoice ID로 이미 Payment가 생성되었는지 확인
        if (invoiceId) {
          const existingPayment = await prisma.payment.findFirst({
            where: {
              stripeInvoiceId: invoiceId,
              userId: user.id,
            },
            select: {
              id: true,
              createdAt: true,
            },
          });
          
          if (existingPayment) {
            console.log('[Stripe Webhook] 이미 처리된 Invoice - 포인트 지급 건너뜀:', {
              invoiceId,
              userId: user.id,
              existingPaymentId: existingPayment.id,
              existingPaymentCreatedAt: existingPayment.createdAt,
              eventType: event.type,
            });
            return NextResponse.json({ 
              received: true,
              message: '이미 처리된 Invoice입니다.',
            });
          }
        }

        // 포인트 지급 및 플랜 업데이트 (400000 포인트) - 조건 없이 항상 실행
        try {
          // user 존재 여부 재확인 (안전을 위해)
          if (!user || !user.id) {
            throw new Error('사용자 정보가 없습니다.');
          }
          
          console.log('[Stripe Webhook] 포인트 지급 시작 (리셋):', {
            userId: user.id,
            email: userEmail,
            plan: plan,
            currentPoints: user.points,
            pointsToSet: 400000,
          });
          
          const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: {
              plan: plan,
              points: 400000, // 매달 고정 포인트로 리셋 (누적 아님)
            },
            select: {
              id: true,
              points: true,
              plan: true,
            },
          });

          console.log('[Stripe Webhook] Points granted', updatedUser);
          
          // 포인트 지급 로그 기록 (리셋)
          const pointsChange = 400000 - user.points; // 실제 변경량 계산
          await prisma.pointHistory.create({
            data: {
              userId: user.id,
              change: pointsChange,
              reason: 'STRIPE_PAYMENT_RESET',
            },
          });

          // 결제 정보 저장 (invoice.payment_succeeded/invoice.payment.paid/invoice_payment.paid는 session.id가 없으므로 null)
          const amount = plan === 'PRO' ? 4000 : 40000;
          
          // invoiceId 추출
          const invoiceId = invoice?.id || null;
          
          // 5️⃣ prisma.payment.create 실행 시 unique 제약 충돌 여부 확인
          // stripeSessionId는 unique이지만 null이므로 문제 없음
          // stripeInvoiceId는 unique가 아니지만 중복 방지를 위해 확인
          try {
            await prisma.payment.create({
              data: {
                userId: user.id,
                email: userEmail,
                plan: plan,
                amount: amount,
                currency: 'KRW',
                stripeSessionId: null,
                stripeSubscriptionId: subscription?.id || null,
                stripeInvoiceId: invoiceId,
              },
            });
          } catch (paymentError: any) {
            // Unique 제약 충돌 체크 (P2002는 Prisma unique 제약 오류 코드)
            if (paymentError?.code === 'P2002') {
              console.error('[Stripe Webhook] Payment 중복 생성 시도:', {
                userId: user.id,
                email: userEmail,
                invoiceId: invoiceId,
                subscriptionId: subscription?.id || null,
                error: paymentError.message,
              });
              // 중복이어도 이미 결제가 처리된 것으로 간주하고 계속 진행
            } else {
              throw paymentError; // 다른 오류는 다시 throw
            }
          }

          console.log('[Stripe Webhook] 포인트 지급 및 플랜 업데이트 완료:', {
            userId: user.id,
            email: userEmail,
            plan: updatedUser.plan,
            pointsReset: 400000,
            newPoints: updatedUser.points,
          });
        } catch (updateError) {
          console.error('[Stripe Webhook] 포인트 지급 및 플랜 업데이트 실패:', updateError);
          console.error('[Stripe Webhook] Webhook update error:', {
            error: updateError instanceof Error ? updateError.message : String(updateError),
            stack: updateError instanceof Error ? updateError.stack : undefined,
            name: updateError instanceof Error ? updateError.name : undefined,
            userId: user?.id,
            userEmail,
            plan,
          });
          throw updateError; // 업데이트 실패 시 전체 트랜잭션 롤백
        }

          // Subscription 정보 저장/업데이트 (subscription이 있을 경우만)
          if (subscription && subscription.id) {
            try {
              const customerId = typeof subscription.customer === 'string' 
                ? subscription.customer 
                : subscription.customer?.id || '';

              await prisma.subscription.upsert({
                where: {
                  stripeSubscriptionId: subscription.id,
                },
                update: {
                  status: subscription.status,
                  cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
                  currentPeriodStart: subscription.current_period_start 
                    ? new Date(subscription.current_period_start * 1000)
                    : null,
                  currentPeriodEnd: subscription.current_period_end
                    ? new Date(subscription.current_period_end * 1000)
                    : null,
                },
                create: {
                  userId: user.id,
                  stripeCustomerId: customerId,
                  stripeSubscriptionId: subscription.id,
                  status: subscription.status,
                  cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
                  currentPeriodStart: subscription.current_period_start
                    ? new Date(subscription.current_period_start * 1000)
                    : null,
                  currentPeriodEnd: subscription.current_period_end
                    ? new Date(subscription.current_period_end * 1000)
                    : null,
                },
              });

              console.log('[Stripe Webhook] Subscription 저장/업데이트 완료:', {
                userId: user.id,
                subscriptionId: subscription.id,
                status: subscription.status,
                cancelAtPeriodEnd: subscription.cancel_at_period_end,
              });
            } catch (subscriptionError) {
              console.error('[Stripe Webhook] Subscription 저장/업데이트 실패:', subscriptionError);
              // Subscription 저장 실패는 전체 트랜잭션을 롤백하지 않음 (로깅만)
            }
          } else {
            console.log('[Stripe Webhook] Subscription 없음 - Subscription 저장 건너뜀');
          }

          // Stripe 이벤트 처리 완료 기록
          await prisma.stripeEvent.create({
            data: {
              eventId: event.id,
            },
          });

          console.log(`[Stripe Webhook] ${event.type} 처리 완료:`, {
            userEmail,
            plan,
            invoiceId: invoice?.id || null,
            eventId: event.id,
          });
        } catch (error: any) {
          console.error(`[Stripe Webhook] ${event.type} 처리 중 오류 발생:`, error);
          console.error('[Stripe Webhook] 오류 상세:', {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            name: error instanceof Error ? error.name : undefined,
            userEmail,
            plan,
            invoiceId: invoice?.id || null,
            subscriptionId: subscriptionId,
            errorCode: (error as any)?.code,
            errorMeta: (error as any)?.meta,
          });
          // 오류 발생 시 500 반환하여 Stripe가 재시도할 수 있도록 함
          return NextResponse.json(
            { 
              error: 'Webhook 처리 중 오류가 발생했습니다.',
              details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
          );
        }
    } else if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string | null;

      if (!subscriptionId) {
        console.log('[Stripe Webhook] invoice.payment_failed: subscription ID가 없습니다.');
        return NextResponse.json({ received: true });
      }

      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const customerId = subscription.customer as string;

        if (!customerId) {
          console.error('[Stripe Webhook] invoice.payment_failed: customer ID가 없습니다.');
          return NextResponse.json({ received: true });
        }

        const { prisma } = await import('@/app/lib/prisma');
        const user = await prisma.user.findUnique({
          where: {
            stripeCustomerId: customerId,
          },
          select: {
            id: true,
            email: true,
            plan: true,
          },
        });

        if (!user) {
          console.log('[Stripe Webhook] invoice.payment_failed: 사용자를 찾을 수 없습니다.', {
            customerId,
          });
          return NextResponse.json({ received: true });
        }

        // Stripe 재시도 대기 - 플랜 변경 없음
        console.log('[Stripe Webhook] 결제 실패 - Stripe 재시도 대기', {
          subscriptionId,
          userId: user.id,
          email: user.email,
          invoiceId: invoice.id,
          eventId: event.id,
        });

        // Stripe 이벤트 처리 완료 기록
        await prisma.stripeEvent.create({
          data: {
            eventId: event.id,
          },
        });
      } catch (error) {
        console.error('[Stripe Webhook] invoice.payment_failed 처리 중 오류 발생:', error);
        console.error('[Stripe Webhook] 오류 상세:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          subscriptionId,
        });
        // 오류 발생 시 500 반환하여 Stripe가 재시도할 수 있도록 함
        return NextResponse.json(
          { error: 'Webhook 처리 중 오류가 발생했습니다.' },
          { status: 500 }
        );
      }
    } else if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      if (!customerId) {
        console.error('[Stripe Webhook] customer.subscription.updated: customer ID가 없습니다.');
        return NextResponse.json(
          { error: 'Customer ID를 찾을 수 없습니다.' },
          { status: 400 }
        );
      }

      try {
        const { prisma } = await import('@/app/lib/prisma');
        const user = await prisma.user.findUnique({
          where: {
            stripeCustomerId: customerId,
          },
          select: {
            id: true,
            email: true,
          },
        });

        if (!user) {
          console.log('[Stripe Webhook] customer.subscription.updated: 사용자를 찾을 수 없습니다.', {
            customerId,
          });
          return NextResponse.json({ received: true });
        }

        // Subscription 테이블의 cancelAtPeriodEnd 및 상태 업데이트
        await prisma.subscription.updateMany({
          where: {
            stripeSubscriptionId: subscription.id,
          },
          data: {
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
            status: subscription.status,
            currentPeriodStart: subscription.current_period_start
              ? new Date(subscription.current_period_start * 1000)
              : null,
            currentPeriodEnd: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000)
              : null,
          },
        });

        // 취소 예약 처리: cancel_at_period_end = true일 때 cancelAtPeriodEnd 설정, plan 유지
        if (subscription.cancel_at_period_end) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              cancelAtPeriodEnd: true,
            },
          });
          
          console.log('[Stripe Webhook] 구독 취소 예약 (cancelAtPeriodEnd 설정, plan 유지):', {
            userId: user.id,
            email: user.email,
            subscriptionId: subscription.id,
            status: subscription.status,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          });
        } else {
          // cancel_at_period_end가 false로 변경된 경우 (취소 취소)
          await prisma.user.update({
            where: { id: user.id },
            data: {
              cancelAtPeriodEnd: false,
            },
          });
          
          console.log('[Stripe Webhook] 구독 취소 취소 (cancelAtPeriodEnd 해제):', {
            userId: user.id,
            email: user.email,
            subscriptionId: subscription.id,
            status: subscription.status,
          });
        }

        // Stripe 이벤트 처리 완료 기록
        await prisma.stripeEvent.create({
          data: {
            eventId: event.id,
          },
        });

        console.log('[Stripe Webhook] 구독 상태 업데이트:', {
          userId: user.id,
          email: user.email,
          subscriptionId: subscription.id,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          status: subscription.status,
          eventId: event.id,
        });
      } catch (error) {
        console.error('[Stripe Webhook] customer.subscription.updated 처리 중 오류 발생:', error);
        console.error('[Stripe Webhook] 오류 상세:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          customerId,
        });
        // 오류 발생 시 500 반환하여 Stripe가 재시도할 수 있도록 함
        return NextResponse.json(
          { error: 'Webhook 처리 중 오류가 발생했습니다.' },
          { status: 500 }
        );
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      if (!customerId) {
        console.error('[Stripe Webhook] customer.subscription.deleted: customer ID가 없습니다.');
        return NextResponse.json(
          { error: 'Customer ID를 찾을 수 없습니다.' },
          { status: 400 }
        );
      }

      try {
        // stripeCustomerId로 사용자 찾기
        const user = await prisma.user.findUnique({
          where: {
            stripeCustomerId: customerId,
          },
          select: {
            id: true,
            email: true,
            plan: true,
            points: true,
          },
        });

        if (!user) {
          console.error('[Stripe Webhook] customer.subscription.deleted: 사용자를 찾을 수 없습니다.', {
            customerId,
          });
          // 사용자를 찾을 수 없어도 성공 응답 (이미 취소된 경우 등)
          return NextResponse.json({ received: true });
        }

        // 구독 종료 시 plan = FREE로 전환 (customer.subscription.deleted는 실제 구독 종료 시 발생)
        await prisma.user.update({
          where: { id: user.id },
          data: {
            plan: 'FREE',
            cancelAtPeriodEnd: false, // 종료 후 플래그 초기화
          },
        });

        // Subscription 상태 cancelled 업데이트
        await prisma.subscription.updateMany({
          where: {
            stripeSubscriptionId: subscription.id,
          },
          data: {
            status: 'cancelled',
          },
        });

        // Stripe 이벤트 처리 완료 기록
        await prisma.stripeEvent.create({
          data: {
            eventId: event.id,
          },
        });

        console.log('[Stripe Webhook] 구독 취소 처리 완료 (cancelAtPeriodEnd 설정):', {
          userId: user.id,
          email: user.email,
          customerId: customerId,
          currentPlan: user.plan,
          currentPoints: user.points,
          eventId: event.id,
        });
      } catch (error) {
        console.error('[Stripe Webhook] customer.subscription.deleted 처리 중 오류 발생:', error);
        console.error('[Stripe Webhook] 오류 상세:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          customerId,
        });
        // 오류 발생 시 500 반환하여 Stripe가 재시도할 수 있도록 함
        return NextResponse.json(
          { error: 'Webhook 처리 중 오류가 발생했습니다.' },
          { status: 500 }
        );
      }
    } else if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      const customerId = charge.customer as string;

      if (!customerId) {
        console.log('[Stripe Webhook] charge.refunded: customer ID가 없습니다.');
        return NextResponse.json({ received: true });
      }

      try {
        const { prisma } = await import('@/app/lib/prisma');
        const user = await prisma.user.findUnique({
          where: {
            stripeCustomerId: customerId,
          },
          select: {
            id: true,
            email: true,
            plan: true,
          },
        });

        if (!user) {
          console.log('[Stripe Webhook] 환불 이벤트 - 사용자 없음:', {
            customerId,
          });
          return NextResponse.json({ received: true });
        }

        // 사용자 플랜 FREE 전환
        await prisma.user.update({
          where: { id: user.id },
          data: {
            plan: 'FREE',
          },
        });

        // Invoice에서 Subscription 찾기
        let subscriptionId: string | null = null;
        if (charge.invoice) {
          try {
            const invoice = await stripe.invoices.retrieve(charge.invoice as string);
            subscriptionId = invoice.subscription as string | null;
          } catch (invoiceError) {
            console.error('[Stripe Webhook] Invoice 조회 실패:', invoiceError);
          }
        }

        // Subscription 상태 cancelled 처리
        if (subscriptionId) {
          await prisma.subscription.updateMany({
            where: {
              stripeSubscriptionId: subscriptionId,
            },
            data: {
              status: 'cancelled',
            },
          });
        }

        // 환불 기록 (Payment 테이블에 음수 amount로 기록)
        try {
          const refundAmount = charge.amount_refunded || 0;
          if (refundAmount > 0) {
            await prisma.payment.create({
              data: {
                userId: user.id,
                email: user.email,
                plan: user.plan, // 환불 전 플랜 기록
                amount: -Math.floor(refundAmount / 100), // Stripe는 센트 단위이므로 원 단위로 변환하고 음수로
                currency: (charge.currency || 'krw').toUpperCase(),
                stripeSessionId: null,
                stripeSubscriptionId: subscriptionId,
                stripeInvoiceId: charge.invoice as string | null,
              },
            });
          }
        } catch (paymentError) {
          console.error('[Stripe Webhook] 환불 기록 저장 실패:', paymentError);
          // 환불 기록 실패는 전체 트랜잭션을 롤백하지 않음 (로깅만)
        }

        // Stripe 이벤트 처리 완료 기록
        await prisma.stripeEvent.create({
          data: {
            eventId: event.id,
          },
        });

        console.log('[Stripe Webhook] 환불 처리 완료:', {
          userId: user.id,
          email: user.email,
          previousPlan: user.plan,
          refundAmount: charge.amount_refunded,
          subscriptionId: subscriptionId,
          invoiceId: charge.invoice,
          eventId: event.id,
        });
      } catch (error) {
        console.error('[Stripe Webhook] charge.refunded 처리 중 오류 발생:', error);
        console.error('[Stripe Webhook] 오류 상세:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          customerId,
        });
        // 오류 발생 시 500 반환하여 Stripe가 재시도할 수 있도록 함
        return NextResponse.json(
          { error: 'Webhook 처리 중 오류가 발생했습니다.' },
          { status: 500 }
        );
      }
    }

    // 다른 이벤트 타입은 로그만 남기고 성공 응답
    console.log('[Stripe Webhook] 처리된 이벤트 (기타):', event.type);

    // Stripe 이벤트 처리 완료 기록 (기타 이벤트도 기록)
    // upsert 사용: 이미 존재하면 아무 작업 안함, 없으면 새로 저장
    await prisma.stripeEvent.upsert({
      where: {
        eventId: event.id,
      },
      update: {},
      create: {
        eventId: event.id,
      },
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook API] 에러:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Webhook 처리 실패',
      },
      { status: 500 }
    );
  }
}
