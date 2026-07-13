/** 주문조회 body.days 파싱 — 몰 클라이언트 공통(1~30일, 기본 7) */
export function parseFetchOrderDays(body: unknown): number {
  if (!body || typeof body !== 'object') return 7;
  const raw = (body as { days?: unknown }).days;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return 7;
  return Math.min(30, Math.max(1, Math.floor(n)));
}

export async function readFetchOrderDays(request: Request): Promise<number> {
  try {
    const body = await request.json();
    return parseFetchOrderDays(body);
  } catch {
    return 7;
  }
}
