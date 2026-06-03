import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { prisma } from '@/app/lib/prisma';
import { DEFAULT_FEEDBACK_EVENT_ENDS_AT } from '@/app/lib/feedback-event/constants';
import {
  formatFeedbackEventEndLabel,
  getFeedbackEventConfig,
} from '@/app/lib/feedback-event/config';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const config = await getFeedbackEventConfig();
    const recent = await prisma.feedbackSubmission.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: { select: { email: true, plan: true, feedbackTrialUsed: true } },
      },
    });

    return NextResponse.json({
      success: true,
      config: {
        isEnabled: config.isEnabled,
        isActive: config.isActive,
        endsAt: config.endsAt.toISOString(),
        endsAtLabel: formatFeedbackEventEndLabel(config.endsAt),
      },
      submissions: recent.map((s) => ({
        id: s.id,
        email: s.user.email,
        plan: s.user.plan,
        featureUsed: s.featureUsed,
        conversionResult: s.conversionResult,
        content: s.content.slice(0, 200),
        publicConsent: s.publicConsent,
        trialGranted: s.trialGranted,
        attachmentName: s.attachmentName,
        attachmentUrl: s.attachmentUrl,
        createdAt: s.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[AkmanFeedbackEventGET]', error);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await request.json();
    const data: { endsAt?: Date; isEnabled?: boolean } = {};

    if (typeof body.endsAt === 'string' && body.endsAt.trim()) {
      const parsed = new Date(body.endsAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: '유효하지 않은 종료일입니다.' }, { status: 400 });
      }
      data.endsAt = parsed;
    }

    if (typeof body.isEnabled === 'boolean') {
      data.isEnabled = body.isEnabled;
    }

    const updated = await prisma.feedbackEventSettings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        endsAt: data.endsAt ?? DEFAULT_FEEDBACK_EVENT_ENDS_AT,
        isEnabled: data.isEnabled ?? true,
      },
      update: data,
    });

    const config = await getFeedbackEventConfig();

    return NextResponse.json({
      success: true,
      config: {
        isEnabled: updated.isEnabled,
        isActive: config.isActive,
        endsAt: updated.endsAt.toISOString(),
        endsAtLabel: formatFeedbackEventEndLabel(updated.endsAt),
      },
    });
  } catch (error) {
    console.error('[AkmanFeedbackEventPATCH]', error);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
