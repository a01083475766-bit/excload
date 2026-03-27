/**
 * 토스 빌링키 발급 API
 * POST https://api.tosspayments.com/v1/billing/authorizations/issue
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';

function basicAuthHeader(secretKey: string) {
  const token = Buffer.from(`${secretKey}:`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

export async function POST(request: NextRequest) {
  try {
    const secretKey = process.env.TOSS_SECRET_KEY?.trim();
    if (!secretKey) {
      return NextResponse.json(
        { error: 'TOSS_SECRET_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const authKey = typeof body.authKey === 'string' ? body.authKey : '';
    const customerKey = typeof body.customerKey === 'string' ? body.customerKey : '';

    if (!authKey || !customerKey) {
      return NextResponse.json(
        { error: 'authKey와 customerKey가 필요합니다.' },
        { status: 400 }
      );
    }

    if (customerKey !== session.user.id) {
      return NextResponse.json(
        { error: 'customerKey가 현재 로그인 사용자와 일치하지 않습니다.' },
        { status: 403 }
      );
    }

    const res = await fetch(
      'https://api.tosspayments.com/v1/billing/authorizations/issue',
      {
        method: 'POST',
        headers: {
          Authorization: basicAuthHeader(secretKey),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ authKey, customerKey }),
      }
    );

    const data = (await res.json()) as {
      billingKey?: string;
      cardCompany?: string;
      cardNumber?: string;
      card?: { number?: string };
      message?: string;
      code?: string;
    };

    if (!res.ok) {
      console.error('[Toss Billing] issue failed:', res.status, data);
      return NextResponse.json(
        {
          error: data.message || '빌링키 발급에 실패했습니다.',
          code: data.code,
        },
        { status: res.status }
      );
    }

    const billingKey = data.billingKey;
    if (!billingKey) {
      return NextResponse.json(
        { error: '응답에 billingKey가 없습니다.' },
        { status: 502 }
      );
    }

    const { prisma } = await import('@/app/lib/prisma');
    const cardCompany = data.cardCompany ?? null;
    const maskedCardNumber = data.cardNumber ?? data.card?.number ?? null;
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        tossBillingKey: billingKey,
        tossCardCompany: cardCompany,
        tossCardNumberMask: maskedCardNumber,
      },
    });

    return NextResponse.json({
      ok: true,
      cardCompany,
      maskedCardNumber,
    });
  } catch (e) {
    console.error('[Toss Billing]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '서버 오류' },
      { status: 500 }
    );
  }
}
