import { DEFAULT_FEEDBACK_EVENT_ENDS_AT } from '@/app/lib/feedback-event/constants';
import type { FeedbackEventStatusPayload } from '@/app/lib/feedback-event/types';

function buildFallbackStatus(): FeedbackEventStatusPayload {
  const fallbackActive = Date.now() < DEFAULT_FEEDBACK_EVENT_ENDS_AT.getTime();
  return {
    event: {
      isActive: fallbackActive,
      endsAt: DEFAULT_FEEDBACK_EVENT_ENDS_AT.toISOString(),
      endsAtLabel: DEFAULT_FEEDBACK_EVENT_ENDS_AT.toLocaleDateString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    },
    user: {
      loggedIn: false,
      canSubmitForTrial: false,
      feedbackTrialActive: false,
      feedbackTrialEndsAt: null,
      feedbackPopupSeen: false,
      hasProEntitlement: false,
      isPaid: false,
      feedbackTrialUsed: false,
    },
  };
}

let statusFetchInFlight: Promise<FeedbackEventStatusPayload | null> | null = null;

/**
 * 베타 피드백 status API — in-flight dedupe.
 * MainNav·피드백 페이지 등 여러 훅이 동시에 호출해도 네트워크 1회만 사용합니다.
 */
export async function fetchFeedbackEventStatus(): Promise<FeedbackEventStatusPayload | null> {
  if (statusFetchInFlight) {
    return statusFetchInFlight;
  }

  const run = async (): Promise<FeedbackEventStatusPayload | null> => {
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      const res = await fetch('/api/feedback-event/status', {
        credentials: 'include',
        signal: controller.signal,
      });
      window.clearTimeout(timeout);

      if (!res.ok) {
        return buildFallbackStatus();
      }

      const json = await res.json();
      if (json.success) {
        return { event: json.event, user: json.user } as FeedbackEventStatusPayload;
      }
      return null;
    } catch {
      const fallback = buildFallbackStatus();
      if (fallback.event.isActive) {
        return fallback;
      }
      return null;
    }
  };

  statusFetchInFlight = run().finally(() => {
    statusFetchInFlight = null;
  });
  return statusFetchInFlight;
}
