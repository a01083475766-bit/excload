'use client';

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_FEEDBACK_EVENT_ENDS_AT } from '@/app/lib/feedback-event/constants';
import {
  readFeedbackStatusCache,
  writeFeedbackStatusCache,
} from '@/app/lib/feedback-event/status-cache';
import type { FeedbackEventStatusPayload } from '@/app/lib/feedback-event/types';

export type { FeedbackEventStatusPayload } from '@/app/lib/feedback-event/types';

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

export function useFeedbackEventStatus(enabled = true) {
  const [data, setData] = useState<FeedbackEventStatusPayload | null>(() =>
    enabled ? readFeedbackStatusCache() : null,
  );
  const [loading, setLoading] = useState(() => !readFeedbackStatusCache());

  const refresh = useCallback(async () => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      return;
    }
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
        setData(fallback);
        writeFeedbackStatusCache(fallback);
        return;
      }
      const json = await res.json();
      if (json.success) {
        const payload = { event: json.event, user: json.user } as FeedbackEventStatusPayload;
        setData(payload);
        writeFeedbackStatusCache(payload);
      }
    } catch {
      const fallback = buildFallbackStatus();
      if (fallback.event.isActive) {
        setData(fallback);
        writeFeedbackStatusCache(fallback);
      } else {
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, refresh, isEventActive: data?.event.isActive ?? false };
}
