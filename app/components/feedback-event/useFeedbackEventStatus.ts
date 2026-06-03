'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchFeedbackEventStatus } from '@/app/lib/feedback-event/fetch-status-client';
import { readFeedbackStatusCache } from '@/app/lib/feedback-event/status-cache';
import type { FeedbackEventStatusPayload } from '@/app/lib/feedback-event/types';

export type { FeedbackEventStatusPayload } from '@/app/lib/feedback-event/types';

export function useFeedbackEventStatus(enabled = true) {
  const [data, setData] = useState<FeedbackEventStatusPayload | null>(() =>
    enabled ? readFeedbackStatusCache() : null,
  );
  const [loading, setLoading] = useState(() => enabled && !readFeedbackStatusCache());

  const refresh = useCallback(
    async (force = false) => {
      if (!enabled) {
        setData(null);
        setLoading(false);
        return;
      }

      const cached = !force ? readFeedbackStatusCache() : null;
      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }

      setLoading(true);
      const payload = await fetchFeedbackEventStatus({ force });
      setData(payload);
      setLoading(false);
    },
    [enabled],
  );

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  return {
    data,
    loading,
    refresh: () => refresh(true),
    isEventActive: data?.event.isActive ?? false,
  };
}
