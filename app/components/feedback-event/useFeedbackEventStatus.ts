'use client';

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_FEEDBACK_EVENT_ENDS_AT } from '@/app/lib/feedback-event/constants';

export type FeedbackEventStatusPayload = {
  event: {
    isActive: boolean;
    endsAtLabel: string;
    endsAt: string;
  };
  user: {
    loggedIn: boolean;
    canSubmitForTrial: boolean;
    feedbackTrialActive: boolean;
    feedbackTrialEndsAt: string | null;
    feedbackPopupSeen: boolean;
    hasProEntitlement: boolean;
    isPaid: boolean;
    feedbackTrialUsed: boolean;
  };
};

export function useFeedbackEventStatus(enabled = true) {
  const [data, setData] = useState<FeedbackEventStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/feedback-event/status', { credentials: 'include' });
      if (!res.ok) {
        // DB 마이그레이션 전 등 API 실패 시에도 기본 마감일까지 메뉴·안내 유지
        const fallbackActive = Date.now() < DEFAULT_FEEDBACK_EVENT_ENDS_AT.getTime();
        setData({
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
        });
        return;
      }
      const json = await res.json();
      if (json.success) {
        setData({ event: json.event, user: json.user });
      }
    } catch {
      const fallbackActive = Date.now() < DEFAULT_FEEDBACK_EVENT_ENDS_AT.getTime();
      if (fallbackActive) {
        setData({
          event: {
            isActive: true,
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
        });
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
