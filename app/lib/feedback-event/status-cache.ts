import type { FeedbackEventStatusPayload } from '@/app/lib/feedback-event/types';

const CACHE_KEY = 'excload_feedback_event_status_v1';
const TTL_MS = 60_000;

type Cached = { at: number; data: FeedbackEventStatusPayload };

export function readFeedbackStatusCache(): FeedbackEventStatusPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (Date.now() - parsed.at > TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeFeedbackStatusCache(data: FeedbackEventStatusPayload): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* ignore quota */
  }
}

export function clearFeedbackStatusCache(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
