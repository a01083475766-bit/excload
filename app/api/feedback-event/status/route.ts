import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { formatFeedbackEventEndLabel, getFeedbackEventConfig } from '@/app/lib/feedback-event/config';
import {
  expireFeedbackTrialIfNeeded,
  isFeedbackTrialActive,
} from '@/app/lib/feedback-event/entitlement';
import { createFeedbackPerfLogger } from '@/app/lib/feedback-event/perf-log';
import { getFeedbackViewerFromRequest } from '@/app/lib/feedback-event/viewer';
import { isPaidDbPlan } from '@/app/lib/subscription/plan-change';

export async function GET(request: NextRequest) {
  const perf = createFeedbackPerfLogger('status');
  try {
    const [config, viewer] = await Promise.all([
      getFeedbackEventConfig(),
      getFeedbackViewerFromRequest(request),
    ]);
    perf.mark('config+viewer');

    const eventPayload = {
      isActive: config.isActive,
      isEnabled: config.isEnabled,
      endsAt: config.endsAt.toISOString(),
      endsAtLabel: formatFeedbackEventEndLabel(config.endsAt),
    };

    type UserState = {
      loggedIn: boolean;
      plan: string | null;
      feedbackTrialUsed: boolean;
      feedbackTrialActive: boolean;
      feedbackTrialEndsAt: string | null;
      feedbackPopupSeen: boolean;
      hasProEntitlement: boolean;
      canSubmitForTrial: boolean;
      isPaid: boolean;
    };

    const defaultUserState: UserState = {
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

    if (!viewer.email && !viewer.userId) {
      perf.flush({ loggedIn: false });
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    let userState: UserState = { ...defaultUserState };

    const user = viewer.userId
      ? await prisma.user.findUnique({
          where: { id: viewer.userId },
          select: {
            id: true,
            plan: true,
            feedbackTrialUsed: true,
            feedbackTrialEndsAt: true,
            feedbackPopupSeenAt: true,
          },
        })
      : await prisma.user.findUnique({
          where: { email: viewer.email! },
          select: {
            id: true,
            plan: true,
            feedbackTrialUsed: true,
            feedbackTrialEndsAt: true,
            feedbackPopupSeenAt: true,
          },
        });
    perf.mark(viewer.userId ? 'user-by-id' : 'user-by-email');

    if (user) {
      let trialEndsAt = user.feedbackTrialEndsAt;
      if (trialEndsAt && !isFeedbackTrialActive(trialEndsAt)) {
        void expireFeedbackTrialIfNeeded(user.id);
        trialEndsAt = null;
      }

      const isPaid = isPaidDbPlan(user.plan);
      const trialActive = isFeedbackTrialActive(trialEndsAt);
      userState = {
        loggedIn: true,
        plan: user.plan,
        feedbackTrialUsed: user.feedbackTrialUsed,
        feedbackTrialActive: trialActive,
        feedbackTrialEndsAt: trialEndsAt?.toISOString() ?? null,
        feedbackPopupSeen: !!user.feedbackPopupSeenAt,
        hasProEntitlement: isPaid || trialActive,
        isPaid,
        canSubmitForTrial: config.isActive && !isPaid && !user.feedbackTrialUsed,
      };
    }

    perf.flush({ loggedIn: true });
    return NextResponse.json({
      success: true,
      event: eventPayload,
      user: userState,
    });
  } catch (error) {
    console.error('[FeedbackEventStatus]', error);
    perf.flush({ error: true });
    return NextResponse.json({ error: '이벤트 정보를 불러오지 못했습니다.' }, { status: 500 });
  }
}
