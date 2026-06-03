import { DEFAULT_FEEDBACK_EVENT_ENDS_AT } from '@/app/lib/feedback-event/constants';
import {
  readFeedbackStatusCache,
  writeFeedbackStatusCache,
} from '@/app/lib/feedback-event/status-cache';
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
 * 피드백 이벤트 status API — sessionStorage TTL(60s) + in-flight dedupe.
 * MainNav·피드백 페이지 등 여러 훅이 동시에 호출해도 네트워크 1회만 사용합니다.
 */
export async function fetchFeedbackEventStatus(
  options?: { force?: boolean },
): Promise<FeedbackEventStatusPayload | null> {
  if (!options?.force) {
    const cached = readFeedbackStatusCache();
    if (cached) return cached;
  }

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
        const fallback = buildFallbackStatus();
        writeFeedbackStatusCache(fallback);
        return fallback;
      }

      const json = await res.json();
      if (json.success) {
        const payload = { event: json.event, user: json.user } as FeedbackEventStatusPayload;
        writeFeedbackStatusCache(payload);
        return payload;
      }
      return null;
    } catch {
      const fallback = buildFallbackStatus();
      if (fallback.event.isActive) {
        writeFeedbackStatusCache(fallback);
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
