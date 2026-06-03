'use client';

import { useCallback, useEffect, useState } from 'react';

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
        setData(null);
        return;
      }
      const json = await res.json();
      if (json.success) {
        setData({ event: json.event, user: json.user });
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, refresh, isEventActive: data?.event.isActive ?? false };
}
