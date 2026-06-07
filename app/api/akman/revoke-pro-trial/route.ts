/**
 * 관리자 PRO 혜택(기간형) 즉시 취소 API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { revokeAdminProTrial } from '@/app/lib/admin-pro-trial';

interface RevokeProTrialRequest {
  userId: string;
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

    const body: RevokeProTrialRequest = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId가 필요합니다.' }, { status: 400 });
    }

    await revokeAdminProTrial(userId);

    return NextResponse.json({
      success: true,
      message: '관리자 PRO 혜택이 취소되었습니다.',
    });
  } catch (error) {
    console.error('[Admin Revoke Pro Trial API] 에러:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'PRO 혜택 취소 실패',
      },
      { status: 500 },
    );
  }
}
