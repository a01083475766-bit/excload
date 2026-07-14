'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchFeedbackEventStatus } from '@/app/lib/feedback-event/fetch-status-client';
import type { FeedbackEventStatusPayload } from '@/app/lib/feedback-event/types';

export type { FeedbackEventStatusPayload } from '@/app/lib/feedback-event/types';

export function useFeedbackEventStatus(enabled = true) {
  const [data, setData] = useState<FeedbackEventStatusPayload | null>(null);
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(
    async () => {
      if (!enabled) {
        setData(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const payload = await fetchFeedbackEventStatus();
      setData(payload);
      setLoading(false);
    },
    [enabled],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data,
    loading,
    refresh: () => refresh(),
    isEventActive: data?.event.isActive ?? false,
  };
}
