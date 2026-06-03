import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { getFeedbackEventConfig } from '@/app/lib/feedback-event/config';

export async function POST() {
  try {
    const config = await getFeedbackEventConfig();
    if (!config.isActive) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    await prisma.user.update({
      where: { email: session.user.email },
      data: { feedbackPopupSeenAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[FeedbackEventMarkPopupSeen]', error);
    return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
