const CACHE_MS = 60_000;

let cache: { at: number; body: Record<string, unknown> } | null = null;

export function getCachedAnonymousStatus(): Record<string, unknown> | null {
  if (!cache) return null;
  if (Date.now() - cache.at >= CACHE_MS) {
    cache = null;
    return null;
  }
  return cache.body;
}

export function setCachedAnonymousStatus(body: Record<string, unknown>): void {
  cache = { at: Date.now(), body };
}

export function invalidateAnonymousStatusCache(): void {
  cache = null;
}
