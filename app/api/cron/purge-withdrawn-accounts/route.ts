/**
 * 탈퇴 유예 만료 계정 영구 삭제
 *
 * Vercel Cron: GET + Authorization: Bearer {CRON_SECRET}
 * 스케줄: vercel.json — 매일 1회
 */
import { NextRequest, NextResponse } from 'next/server';
import { purgeExpiredWithdrawnAccounts } from '@/app/lib/account-withdrawal';
import { authorizeCron } from '@/app/api/cron/toss-subscription-renew/route';

export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await purgeExpiredWithdrawnAccounts();
    return NextResponse.json({
      success: true,
      purged: result.purged,
      errors: result.errors,
    });
  } catch (error) {
    console.error('[cron/purge-withdrawn-accounts]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'purge failed' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
