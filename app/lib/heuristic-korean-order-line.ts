/**
 * normalize-29 보조: AI 비활성·오류·fallback 시 한 줄 한국어 주문 패턴을
 * 기준헤더 일부로 나눔 (OpenAI 없이 1차 분리)
 *
 * 예: 김철수 서울시 강남구 테헤란로 123 010-1234-5678 사과1kg
 */

import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';

export type HeuristicReceiverFields = {
  받는사람: string;
  받는사람전화1: string;
  받는사람주소1: string;
  품명: string;
};

/** 레거시/외부에서 붙은 안내 문구 제거 */
function stripDebugPrefixes(s: string): string {
  return s
    .replace(/^\[분리필요[^\]]*\]\s*/u, '')
    .replace(/^\[분리실패[^\]]*\]\s*/u, '')
    .replace(/^분리실패\s*[·|]?\s*/u, '')
    .trim();
}

function normalizeMobile(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('010')) {
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10 && d.startsWith('010')) {
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return raw.trim();
}

function findPhoneSpan(text: string): { start: number; end: number; raw: string } | null {
  const re = /01[016789](?:[-\s]?\d{3,4}[-\s]?\d{4}|\d{8})/g;
  let m: RegExpExecArray | null;
  let best: RegExpExecArray | null = null;
  while ((m = re.exec(text)) !== null) {
    best = m;
  }
  if (!best) return null;
  return { start: best.index, end: best.index + best[0].length, raw: best[0] };
}

export function tryHeuristicSplitOneLineKoreanOrder(text: string): HeuristicReceiverFields | null {
  const cleaned = stripDebugPrefixes(text);
  if (!cleaned || cleaned.length < 8) return null;

  const phoneSpan = findPhoneSpan(cleaned);
  if (!phoneSpan) return null;

  const before = cleaned.slice(0, phoneSpan.start).trim();
  const after = cleaned.slice(phoneSpan.end).trim();
  if (!before || !after) return null;

  const phone = normalizeMobile(phoneSpan.raw);
  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 10 || phoneDigits.length > 11 || !phoneDigits.startsWith('01')) {
    return null;
  }

  const nameAddr = before.match(/^([\uac00-\ud7a3]{2,5})\s+(.+)$/u);
  if (!nameAddr) return null;

  const 받는사람 = nameAddr[1].trim();
  const 받는사람주소1 = nameAddr[2].trim();
  const 품명 = after.trim();

  if (받는사람주소1.length < 4 || 품명.length < 1) return null;

  return {
    받는사람,
    받는사람전화1: phone,
    받는사람주소1,
    품명,
  };
}

/** BASE_HEADERS 길이만큼 빈 행 + 수량 기본값 */
function emptyNormalize29Row(): Record<string, string> {
  const row: Record<string, string> = {};
  for (const h of BASE_HEADERS) {
    row[h] = '';
  }
  row['수량'] = '1';
  return row;
}

/**
 * 서버 normalize-29 fallback 전용: 휴리스틱 성공 시 분리, 실패 시 원문은 내부메모만(상품명 비움)
 */
export function buildNormalize29HeuristicFallbackRow(raw: string): Record<string, string> {
  const base = emptyNormalize29Row();
  const h = tryHeuristicSplitOneLineKoreanOrder(raw);
  if (h) {
    base['받는사람'] = h.받는사람;
    base['받는사람전화1'] = h.받는사람전화1;
    base['받는사람주소1'] = h.받는사람주소1;
    base['상품명'] = h.품명;
    return base;
  }
  const t = raw.trim();
  if (t) {
    base['내부메모'] = `자동분리 미적용 원문: ${t}`;
  }
  return base;
}

/** handleNormalize29의 normalizeOrderObject와 동일 역할 */
export function sanitizeNormalize29Order(order: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const header of BASE_HEADERS) {
    const value = order?.[header];
    normalized[header] = value == null ? '' : String(value).trim();
  }
  if (!normalized['수량']) {
    normalized['수량'] = '1';
  }
  return normalized;
}

/** AI가 수취인 비우고 긴 상품명만 준 덩어리일 때 1차 보정 */
export function orderLooksLikeNormalizeFallbackBlob(order: Record<string, unknown>): boolean {
  const 상품명 = String(order?.상품명 ?? '');
  if (/분리실패|\[원문/.test(상품명)) return true;
  const hasReceiver =
    String(order?.받는사람 ?? '').trim() ||
    String(order?.받는사람전화1 ?? '').trim() ||
    String(order?.받는사람주소1 ?? '').trim();
  return !hasReceiver && 상품명.length > 25;
}

export function enrichNormalizedOrderWithHeuristicLine(
  order: Record<string, string>,
  fullText: string
): Record<string, string> {
  const o = order as Record<string, unknown>;
  if (!orderLooksLikeNormalizeFallbackBlob(o)) return order;
  const h = tryHeuristicSplitOneLineKoreanOrder(fullText.trim());
  if (!h) return order;
  return {
    ...order,
    받는사람: h.받는사람,
    받는사람전화1: h.받는사람전화1,
    받는사람주소1: h.받는사람주소1,
    상품명: h.품명,
  };
}

export function enrichOrdersWithHeuristicLine(
  orders: Record<string, unknown>[],
  originalUserText: string
): Record<string, unknown>[] {
  const trimmed = originalUserText.trim();
  return orders.map((order) => {
    if (!orderLooksLikeNormalizeFallbackBlob(order)) return order;
    const h = tryHeuristicSplitOneLineKoreanOrder(trimmed);
    if (!h) return order;
    return {
      ...order,
      받는사람: h.받는사람,
      받는사람전화1: h.받는사람전화1,
      받는사람주소1: h.받는사람주소1,
      상품명: h.품명,
    };
  });
}
