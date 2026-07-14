import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getFeedbackEventConfig } from '@/app/lib/feedback-event/config';
import { getFeedbackViewerFromRequest } from '@/app/lib/feedback-event/viewer';

export async function POST(request: NextRequest) {
  try {
    const config = await getFeedbackEventConfig();
    if (!config.isActive) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const viewer = await getFeedbackViewerFromRequest(request);
    if (!viewer.email && !viewer.userId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    await prisma.user.update({
      where: viewer.userId ? { id: viewer.userId } : { email: viewer.email! },
      data: { feedbackPopupSeenAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[FeedbackEventMarkPopupSeen]', error);
    return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
