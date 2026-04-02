import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import { enrichOrdersWithHeuristicLine } from '@/app/lib/heuristic-korean-order-line';
import { isExcloudPipelineDebugClient } from '@/app/lib/excloud-pipeline-debug';

export type TextNormalizeMeta = {
  usedFallback: boolean;
  fallbackReason?: string;
};

/** 텍스트 → CleanInputFile + normalize-29 메타(폴백 여부). Stage2 전달 시 normalizeMeta는 제거하세요. */
export type TextToCleanInputAdapterResult = {
  headers: readonly string[];
  rows: string[][];
  sourceType: 'text';
  normalizeMeta: TextNormalizeMeta;
};

export async function runTextToCleanInputAdapter(text: string): Promise<TextToCleanInputAdapterResult> {
  if (!text || text.trim() === '') {
    throw new Error('텍스트가 비어있습니다.');
  }

  const response = await fetch('/api/ai-gateway', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'normalize-29',
      text,
    }),
  });

  if (!response.ok) {
    throw new Error('normalize-29 호출 실패');
  }

  const data = await response.json();
  const dbg = isExcloudPipelineDebugClient();
  if (dbg) {
    console.log('[API RESPONSE RAW]', data);
  }

  if (!data?.orders || !Array.isArray(data.orders)) {
    throw new Error('normalize-29 응답 형식 오류');
  }

  // 서버는 파싱 실패·빈 orders 시 1건 fallback 주문을 채워 반환하고 meta.usedFallback을 씁니다.
  // 여기서 에러를 던지면 복구된 행을 쓰지 못해 텍스트 변환이 항상 실패한 것처럼 보입니다.
  if (data?.meta?.usedFallback && dbg) {
    console.warn('[normalize-29] 서버 fallback 주문 사용', data.meta);
  }

  const rawOrders = data.orders as Record<string, unknown>[];
  const orders = enrichOrdersWithHeuristicLine(rawOrders, text.trim());
  if (
    dbg &&
    rawOrders[0] &&
    orders[0] &&
    JSON.stringify(rawOrders[0]) !== JSON.stringify(orders[0])
  ) {
    console.log('[heuristic-korean-line] 한 줄 패턴 감지 → 받는사람·주소·전화·상품명 보정');
  }

  if (dbg) {
    // 브라우저 콘솔에서 AI(또는 fallback)가 넣은 기준헤더 칸을 표로 확인 (디버그 시에만)
    orders.forEach((order: any, idx: number) => {
      const row: Record<string, string> = {};
      for (const h of BASE_HEADERS) {
        row[h] = order[h] == null ? '' : String(order[h]);
      }
      console.log(
        `[normalize-29] 주문 ${idx + 1}/${orders.length} 기준헤더 — 받는사람·받는사람전화1·받는사람주소1·상품명 등 아래 표에서 확인 (빈 칸은 미추출)`
      );
      console.table(row);
    });
  }

  const rows = orders.map((order: any) =>
    BASE_HEADERS.map((header) => order[header] ?? '')
  );
  if (dbg) {
    console.log('[ROWS BEFORE RETURN]', rows);
    console.log('[ROWS COUNT]', rows.length);
    console.log('[TEXT → ROWS 변환]', {
      ordersCount: orders.length,
      rowsCount: rows.length,
      sampleRow: rows[0],
    });
  }

  const normalizeMeta: TextNormalizeMeta = {
    usedFallback: Boolean(data?.meta?.usedFallback),
    fallbackReason:
      typeof data?.meta?.fallbackReason === 'string'
        ? data.meta.fallbackReason
        : undefined,
  };

  return {
    headers: BASE_HEADERS,
    rows,
    sourceType: 'text' as const,
    normalizeMeta,
  };
}
