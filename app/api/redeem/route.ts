import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { getClientIp } from '@/app/lib/client-ip';
import { prisma } from '@/app/lib/prisma';
import { redeemVoucherCode } from '@/app/lib/voucher/redeem';
import { REDEEM_GENERIC_ERROR, REDEEM_RATE_LIMIT_ERROR } from '@/app/lib/voucher/constants';

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_IP = 20;
const RATE_MAX_PER_USER = 10;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId || !session.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = (await request.json()) as { code?: string; campaignSlug?: string };
    const code = typeof body.code === 'string' ? body.code : '';
    const campaignSlug =
      typeof body.campaignSlug === 'string' && body.campaignSlug.trim()
        ? body.campaignSlug.trim()
        : null;

    const ip = getClientIp(request);
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS);

    const [ipCount, userCount] = await Promise.all([
      ip !== 'unknown'
        ? prisma.voucherAuditLog.count({
            where: {
              action: 'REDEEM',
              createdAt: { gte: windowStart },
              ip,
            },
          })
        : Promise.resolve(0),
      prisma.voucherAuditLog.count({
        where: {
          action: 'REDEEM',
          userId,
          createdAt: { gte: windowStart },
        },
      }),
    ]);

    if ((ip !== 'unknown' && ipCount >= RATE_MAX_PER_IP) || userCount >= RATE_MAX_PER_USER) {
      return NextResponse.json({ error: REDEEM_RATE_LIMIT_ERROR }, { status: 429 });
    }

    const result = await redeemVoucherCode({
      userId,
      codePlaintext: code,
      campaignSlug,
      ip: ip !== 'unknown' ? ip : null,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || REDEEM_GENERIC_ERROR },
        { status: result.status },
      );
    }

    return NextResponse.json({
      success: true,
      entitlement: result.entitlement,
      campaignSlug: result.campaignSlug,
    });
  } catch (e) {
    console.error('[api/redeem]', e);
    return NextResponse.json({ error: '등록 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
