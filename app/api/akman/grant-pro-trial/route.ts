/**
 * 관리자 PRO 혜택(기간형) 부여 API
 *
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * plan=FREE 유지, adminTrialEndsAt 연장. 포인트는 변경하지 않습니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import {
  ADMIN_PRO_TRIAL_MAX_MONTHS,
  ADMIN_PRO_TRIAL_MIN_MONTHS,
  grantAdminProTrialMonths,
} from '@/app/lib/admin-pro-trial';

interface GrantProTrialRequest {
  userId: string;
  months: number;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    if (!isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body: GrantProTrialRequest = await request.json();
    const { userId, months } = body;

    if (!userId || months == null) {
      return NextResponse.json(
        { error: 'userId와 months가 필요합니다.' },
        { status: 400 },
      );
    }

    const parsedMonths = Number(months);
    if (
      !Number.isInteger(parsedMonths) ||
      parsedMonths < ADMIN_PRO_TRIAL_MIN_MONTHS ||
      parsedMonths > ADMIN_PRO_TRIAL_MAX_MONTHS
    ) {
      return NextResponse.json(
        {
          error: `개월 수는 ${ADMIN_PRO_TRIAL_MIN_MONTHS}~${ADMIN_PRO_TRIAL_MAX_MONTHS} 사이의 정수여야 합니다.`,
        },
        { status: 400 },
      );
    }

    const { endsAt } = await grantAdminProTrialMonths(userId, parsedMonths);

    const label = endsAt.toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return NextResponse.json({
      success: true,
      adminTrialEndsAt: endsAt.toISOString(),
      message: `PRO 혜택 ${parsedMonths}개월이 적용되었습니다. (${label}까지)`,
    });
  } catch (error) {
    console.error('[Admin Grant Pro Trial API] 에러:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'PRO 혜택 부여 실패',
      },
      { status: 500 },
    );
  }
}
