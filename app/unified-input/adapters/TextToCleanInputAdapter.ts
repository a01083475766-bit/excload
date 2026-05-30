import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import { isExcloudPipelineDebugClient } from '@/app/lib/excloud-pipeline-debug';
import {
  Normalize29Error,
  type Normalize29ErrorCode,
} from '@/app/lib/normalize-29/normalize29-error';
import type { InternalOrderFormat } from '@/app/lib/export/internalOrderFormat';

export type TextNormalizeMeta = {
  usedFallback: boolean;
  fallbackReason?: string;
  /** normalize-29 프롬프트 경로: core(단순·빠름) | full(복잡·전체필드) */
  promptRoute?: 'core' | 'full';
};

export type TextToCleanInputAdapterOptions = {
  /** true: 휴리스틱 폴백 없이 실패 시 에러 (택배 텍스트 변환) */
  strict?: boolean;
};

/** 텍스트 → CleanInputFile + normalize-29 메타(폴백 여부). Stage2 전달 시 normalizeMeta는 제거하세요. */
export type TextToCleanInputAdapterResult = {
  headers: readonly string[];
  rows: string[][];
  sourceType: 'text';
  normalizeMeta: TextNormalizeMeta;
};

function parseNormalize29ErrorCode(value: unknown): Normalize29ErrorCode {
  if (value === 'AI_TIMEOUT') return 'AI_TIMEOUT';
  if (value === 'AI_PARSE_FAILED') return 'AI_PARSE_FAILED';
  if (value === 'AI_EMPTY_ORDERS') return 'AI_EMPTY_ORDERS';
  if (value === 'AI_UNAVAILABLE') return 'AI_UNAVAILABLE';
  return 'AI_API_ERROR';
}

export async function runTextToCleanInputAdapter(
  text: string,
  options?: TextToCleanInputAdapterOptions,
): Promise<TextToCleanInputAdapterResult> {
  if (!text || text.trim() === '') {
    throw new Error('텍스트가 비어있습니다.');
  }

  const strict = options?.strict === true;

  const response = await fetch('/api/ai-gateway', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'normalize-29',
      text,
      strict,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorCode = parseNormalize29ErrorCode(data?.errorCode);
    throw new Normalize29Error(
      errorCode,
      typeof data?.error === 'string' ? data.error : 'normalize-29 호출 실패',
    );
  }

  const dbg = isExcloudPipelineDebugClient();
  if (dbg) {
    console.log('[API RESPONSE RAW]', data);
  }

  if (!data?.orders || !Array.isArray(data.orders)) {
    throw new Normalize29Error('AI_API_ERROR', 'normalize-29 응답 형식 오류');
  }

  if (strict && data.orders.length === 0) {
    throw new Normalize29Error('AI_EMPTY_ORDERS', '주문 정보를 추출하지 못했습니다.');
  }

  if (data?.meta?.usedFallback && dbg) {
    console.warn('[normalize-29] 서버 fallback 주문 사용', data.meta);
  }

  const rawOrders = data.orders as Record<string, unknown>[];
  const orders = rawOrders;

  if (dbg) {
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
    promptRoute:
      data?.meta?.promptRoute === 'core' || data?.meta?.promptRoute === 'full'
        ? data.meta.promptRoute
        : undefined,
  };

  return {
    headers: BASE_HEADERS,
    rows,
    sourceType: 'text' as const,
    normalizeMeta,
  };
}

/** 확인 모달용: normalize-29 첫 행 → InternalOrderFormat */
export async function convertTextToInternalOrder(
  text: string
): Promise<{ internalOrder: InternalOrderFormat }> {
  const { rows } = await runTextToCleanInputAdapter(text);
  const row = rows[0];
  if (!row) {
    throw new Error('변환된 주문 행이 없습니다.');
  }
  const internalOrder = {} as InternalOrderFormat;
  BASE_HEADERS.forEach((h, i) => {
    internalOrder[h] = row[i] ?? '';
  });
  return { internalOrder };
}

export { Normalize29Error };
