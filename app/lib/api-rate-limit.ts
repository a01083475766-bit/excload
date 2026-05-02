import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function getRequestClientKey(request: NextRequest, userEmail: string | undefined): string {
  if (userEmail) {
    return `user:${userEmail}`;
  }
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  return `ip:${ip}`;
}

type Bucket = { count: number; time: number };

/**
 * 고부하 API용 단순 고정 윈도 카운터 (프로세스 메모리).
 * 서버리스 다중 인스턴스에서는 인스턴스별로 적용됩니다.
 */
export function checkSlidingWindowRateLimit(
  store: Map<string, Bucket>,
  key: string,
  opts: { windowMs: number; max: number },
): NextResponse | null {
  const now = Date.now();
  const { windowMs, max } = opts;
  const record = store.get(key);

  if (record && now - record.time < windowMs) {
    if (record.count >= max) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 },
      );
    }
    record.count += 1;
  } else {
    store.set(key, { count: 1, time: now });
  }

  return null;
}

const orderPipelineBuckets = new Map<string, Bucket>();

/** 동일 업로드의 2번째 청크 이후 — 메인 한도(14/48)를 소모하지 않도록 별도 한도 */
const orderPipelineChunkFollowBuckets = new Map<string, Bucket>();

export type OrderPipelineRateLimitMode = 'full' | 'chunkFollowUp';

/**
 * 로그인 사용자는 이메일 기준(동일 IP 사무실). 비로그인은 IP 기준.
 * `chunkFollowUp`: 한 파일의 Stage2 후속 청크만 해당(대량 1건 = 여러 호출에도 메인 한도 보호).
 */
export function checkOrderPipelineRateLimit(
  request: NextRequest,
  userEmail: string | undefined,
  mode: OrderPipelineRateLimitMode = 'full',
): NextResponse | null {
  const key = getRequestClientKey(request, userEmail);
  if (mode === 'chunkFollowUp') {
    return checkSlidingWindowRateLimit(orderPipelineChunkFollowBuckets, `${key}:chunk`, {
      windowMs: 60_000,
      max: userEmail ? 200 : 80,
    });
  }
  const max = userEmail ? 48 : 14;
  return checkSlidingWindowRateLimit(orderPipelineBuckets, key, {
    windowMs: 60_000,
    max,
  });
}
