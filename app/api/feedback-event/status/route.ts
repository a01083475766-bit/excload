import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import {
  getCachedAnonymousStatus,
  setCachedAnonymousStatus,
} from '@/app/lib/feedback-event/anonymous-status-cache';
import { formatFeedbackEventEndLabel, getFeedbackEventConfig } from '@/app/lib/feedback-event/config';
import {
  expireFeedbackTrialIfNeeded,
  isFeedbackTrialActive,
} from '@/app/lib/feedback-event/entitlement';
import { createFeedbackPerfLogger } from '@/app/lib/feedback-event/perf-log';
import { isPaidDbPlan } from '@/app/lib/subscription/plan-change';

const ANON_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
};

export async function GET() {
  const perf = createFeedbackPerfLogger('status');
  try {
    const [config, session] = await Promise.all([
      getFeedbackEventConfig(),
      getServerSession(authOptions),
    ]);
    perf.mark('config+session');

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

    if (!session?.user?.email && !session?.user?.id) {
      const cached = getCachedAnonymousStatus();
      if (cached) {
        perf.mark('anon-cache-hit');
        perf.flush({ cached: true });
        return NextResponse.json(cached, { headers: ANON_CACHE_HEADERS });
      }

      const body = {
        success: true,
        event: eventPayload,
        user: defaultUserState,
      };
      setCachedAnonymousStatus(body);
      perf.mark('anon-cache-miss');
      perf.flush({ cached: false, loggedIn: false });
      return NextResponse.json(body, { headers: ANON_CACHE_HEADERS });
    }

    let userState: UserState = { ...defaultUserState };

    const userId = session.user?.id;
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          plan: true,
          feedbackTrialUsed: true,
          feedbackTrialEndsAt: true,
          feedbackPopupSeenAt: true,
        },
      });
      perf.mark('user-by-id');

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
    } else if (session.user?.email) {
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
      perf.mark('user-by-email');

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
