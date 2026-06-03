import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { formatFeedbackEventEndLabel, getFeedbackEventConfig } from '@/app/lib/feedback-event/config';
import {
  expireFeedbackTrialIfNeeded,
  hasProEntitlement,
  isFeedbackTrialActive,
} from '@/app/lib/feedback-event/entitlement';
import { isPaidDbPlan } from '@/app/lib/subscription/plan-change';

export async function GET() {
  try {
    const config = await getFeedbackEventConfig();
    const session = await getServerSession(authOptions);

    let userState: {
      loggedIn: boolean;
      plan: string | null;
      feedbackTrialUsed: boolean;
      feedbackTrialActive: boolean;
      feedbackTrialEndsAt: string | null;
      feedbackPopupSeen: boolean;
      hasProEntitlement: boolean;
      canSubmitForTrial: boolean;
      isPaid: boolean;
    } = {
      loggedIn: false,
      plan: null,
      feedbackTrialUsed: false,
      feedbackTrialActive: false,
      feedbackTrialEndsAt: null,
      feedbackPopupSeen: false,
      hasProEntitlement: false,
      canSubmitForTrial: false,
      isPaid: false,
    };

    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
          id: true,
          plan: true,
          feedbackTrialUsed: true,
          feedbackTrialEndsAt: true,
          feedbackPopupSeenAt: true,
        },
      });

      if (user) {
        await expireFeedbackTrialIfNeeded(user.id);
        const fresh = await prisma.user.findUnique({
          where: { id: user.id },
          select: {
            plan: true,
            feedbackTrialUsed: true,
            feedbackTrialEndsAt: true,
            feedbackPopupSeenAt: true,
          },
        });

        if (fresh) {
          const isPaid = isPaidDbPlan(fresh.plan);
          const trialActive = isFeedbackTrialActive(fresh.feedbackTrialEndsAt);
          const entitled = hasProEntitlement(fresh);
          userState = {
            loggedIn: true,
            plan: fresh.plan,
            feedbackTrialUsed: fresh.feedbackTrialUsed,
            feedbackTrialActive: trialActive,
            feedbackTrialEndsAt: fresh.feedbackTrialEndsAt?.toISOString() ?? null,
            feedbackPopupSeen: !!fresh.feedbackPopupSeenAt,
            hasProEntitlement: entitled,
            isPaid,
            canSubmitForTrial:
              config.isActive && !isPaid && !fresh.feedbackTrialUsed,
          };
        }
      }
    }

    return NextResponse.json({
      success: true,
      event: {
        isActive: config.isActive,
        isEnabled: config.isEnabled,
        endsAt: config.endsAt.toISOString(),
        endsAtLabel: formatFeedbackEventEndLabel(config.endsAt),
      },
      user: userState,
    });
  } catch (error) {
    console.error('[FeedbackEventStatus]', error);
    return NextResponse.json({ error: '이벤트 정보를 불러오지 못했습니다.' }, { status: 500 });
  }
}
