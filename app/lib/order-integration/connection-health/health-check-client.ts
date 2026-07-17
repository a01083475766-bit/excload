/**
 * 주문조회 화면의 연결 상태 자동 확인 오케스트레이션 헬퍼(클라이언트 전용, 순수 로직).
 * 화면 렌더를 막지 않도록 비동기로 호출되며, 여기서는 순서 정렬·동시성 제한만 담당한다.
 */

/** 검사 대상 계정을 선택된 몰 우선으로 정렬한다(원래 순서 유지). */
export function orderAccountIdsForCheck(all: string[], selected: ReadonlySet<string>): string[] {
  const first: string[] = [];
  const rest: string[] = [];
  for (const id of all) {
    if (selected.has(id)) first.push(id);
    else rest.push(id);
  }
  return [...first, ...rest];
}

/**
 * items를 최대 limit개까지 동시에 처리한다.
 * worker에서 던진 예외는 전체를 중단시키지 않도록 무시한다(개별 배지에서 처리).
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const max = Math.max(1, Math.floor(limit) || 1);
  let cursor = 0;

  async function runOne(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        await worker(items[index]);
      } catch {
        // 개별 실패는 무시하고 다음 항목을 계속 처리한다.
      }
    }
  }

  const runners = Array.from({ length: Math.min(max, items.length) }, () => runOne());
  await Promise.all(runners);
}

export const DEFAULT_HEALTH_CHECK_CONCURRENCY = 3;
/** 사용자가 「다시 확인」을 연타하지 못하게 하는 클라이언트 최소 간격. */
export const MANUAL_RECHECK_MIN_INTERVAL_MS = 15_000;
