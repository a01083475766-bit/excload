/**
 * 관리자 회원 목록 엑셀 다운로드 API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';
import * as XLSX from 'xlsx';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
    if (!isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const searchTerm = (searchParams.get('search') || '').trim();
    const planFilter = searchParams.get('plan') || '';
    const dateFilter = searchParams.get('date') || '';

    let dateCondition: { gte: Date; lt: Date } | undefined;
    if (dateFilter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      dateCondition = { gte: today, lt: tomorrow };
    } else if (dateFilter === 'thisMonth') {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstDayOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      dateCondition = { gte: firstDayOfMonth, lt: firstDayOfNextMonth };
    }

    const whereCondition: Record<string, unknown> = {};
    if (searchTerm) {
      const normalizedSearchPhone = searchTerm.replace(/[^0-9]/g, '');
      whereCondition.OR = [
        { email: { contains: searchTerm } },
        { phone: { contains: normalizedSearchPhone || searchTerm } },
      ];
    }
    if (planFilter && ['FREE', 'PRO', 'YEARLY'].includes(planFilter)) {
      whereCondition.plan = planFilter;
    }
    if (dateCondition) {
      whereCondition.createdAt = dateCondition;
    }

    const users = await prisma.user.findMany({
      where: Object.keys(whereCondition).length > 0 ? whereCondition : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        phone: true,
        plan: true,
        points: true,
        createdAt: true,
        emailVerified: true,
        lastIp: true,
        deviceId: true,
        name: true,
      },
    });

    const userIds = users.map((u) => u.id);
    if (userIds.length === 0) {
      const emptyWs = XLSX.utils.json_to_sheet([
        { 안내: '조건에 맞는 회원이 없습니다.' },
      ]);
      const wb0 = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb0, emptyWs, '회원목록');
      const buffer0 = XLSX.write(wb0, { type: 'buffer', bookType: 'xlsx' });
      const fileName0 = `excload-users-${new Date().toISOString().slice(0, 10)}.xlsx`;
      return new NextResponse(buffer0, {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${fileName0}"`,
        },
      });
    }

    const [paymentRows, subscriptionRows] = await Promise.all([
      prisma.payment.findMany({
        where: { userId: { in: userIds } },
        orderBy: { createdAt: 'desc' },
        select: {
          userId: true,
          amount: true,
          createdAt: true,
          plan: true,
          currency: true,
          paymentProvider: true,
        },
      }),
      prisma.subscription.findMany({
        where: { userId: { in: userIds } },
        orderBy: { updatedAt: 'desc' },
        select: {
          userId: true,
          status: true,
          currentPeriodEnd: true,
          paymentProvider: true,
        },
      }),
    ]);

    const lastPaymentByUser = new Map<
      string,
      (typeof paymentRows)[number]
    >();
    for (const p of paymentRows) {
      if (!lastPaymentByUser.has(p.userId)) {
        lastPaymentByUser.set(p.userId, p);
      }
    }

    const lastSubByUser = new Map<
      string,
      (typeof subscriptionRows)[number]
    >();
    for (const s of subscriptionRows) {
      if (!lastSubByUser.has(s.userId)) {
        lastSubByUser.set(s.userId, s);
      }
    }

    const rows = users.map((u, index) => {
      const pay = lastPaymentByUser.get(u.id);
      const sub = lastSubByUser.get(u.id);
      return {
        No: index + 1,
        사용자ID: u.id,
        이메일: u.email,
        이름: u.name ?? '',
        전화번호: u.phone ?? '',
        '플랜(현재)': u.plan,
        사용량: u.points,
        이메일인증: u.emailVerified ? '인증완료' : '미인증',
        가입일시: u.createdAt.toISOString(),
        마지막IP: u.lastIp ?? '',
        가입경로: '',
        최근결제일시: pay ? pay.createdAt.toISOString() : '',
        '최근결제금액(원)': pay ? pay.amount : '',
        최근결제플랜: pay ? pay.plan : '',
        '최근결제통화': pay ? pay.currency : '',
        '최근결제채널(STRIPE/TOSS)': pay?.paymentProvider ?? '',
        구독상태: sub ? sub.status : '',
        구독만료일: sub?.currentPeriodEnd
          ? sub.currentPeriodEnd.toISOString()
          : '',
        '구독채널(STRIPE/TOSS)': sub?.paymentProvider ?? '',
        deviceId: u.deviceId ?? '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '회원목록');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const fileName = `excload-users-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('[Admin Users Export API] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '엑셀 다운로드 실패' },
      { status: 500 }
    );
  }
}
