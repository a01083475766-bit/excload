/** 공개·비로그인 상세글 JSON 캐시 (개인 필드·비공개 글 제외) */
const CACHE_MS = 60_000;

const cache = new Map<string, { at: number; payload: Record<string, unknown> }>();

export function getCachedPublicPostDetail(id: string): Record<string, unknown> | null {
  const entry = cache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.at >= CACHE_MS) {
    cache.delete(id);
    return null;
  }
  return entry.payload;
}

export function setCachedPublicPostDetail(id: string, payload: Record<string, unknown>): void {
  cache.set(id, { at: Date.now(), payload });
}

export function invalidatePublicPostDetailCache(postId?: string): void {
  if (postId) {
    cache.delete(postId);
    return;
  }
  cache.clear();
}
