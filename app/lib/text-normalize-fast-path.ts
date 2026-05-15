/**
 * 단순 한 줄 한국어 주문은 OpenAI normalize-29 없이 즉시 기준헤더 행으로 변환합니다.
 * (복수 전화번호·복잡한 쇼핑몰 붙여넣기는 기존 AI 경로 유지)
 */

import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import {
  sanitizeNormalize29Order,
  tryHeuristicSplitOneLineKoreanOrder,
} from '@/app/lib/heuristic-korean-order-line';
import type { TextToCleanInputAdapterResult } from '@/app/unified-input/adapters/TextToCleanInputAdapter';

function countKoreanMobilePhones(text: string): number {
  const re = /01[016789](?:[-\s]?\d{3,4}[-\s]?\d{4}|\d{8})/g;
  return [...text.matchAll(re)].length;
}

/** 여러 건 주문으로 보이는 패턴이면 AI 경로 유지 */
function looksLikeMultiOrder(text: string): boolean {
  if (countKoreanMobilePhones(text) > 1) return true;
  const orderMarkers = (text.match(/주문\s*(?:번호|ID|#)|제휴주문|상품주문번호/gi) ?? []).length;
  if (orderMarkers >= 2) return true;
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim().length > 0);
  if (blocks.length >= 3) return true;
  return false;
}

/**
 * 단순 패턴이면 AI 호출 없이 결과 반환. 해당 없으면 null.
 */
export function tryTextNormalizeWithoutAi(text: string): TextToCleanInputAdapterResult | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 600) return null;
  if (looksLikeMultiOrder(trimmed)) return null;

  const collapsed = trimmed.replace(/\s+/g, ' ');
  const h = tryHeuristicSplitOneLineKoreanOrder(collapsed);
  if (!h) return null;

  const order = sanitizeNormalize29Order({
    받는사람: h.받는사람,
    받는사람전화1: h.받는사람전화1,
    받는사람주소1: h.받는사람주소1,
    상품명: h.품명,
    수량: '1',
  });

  const rows = [BASE_HEADERS.map((header) => order[header] ?? '')];

  return {
    headers: BASE_HEADERS,
    rows,
    sourceType: 'text',
    normalizeMeta: {
      usedFallback: false,
    },
  };
}
