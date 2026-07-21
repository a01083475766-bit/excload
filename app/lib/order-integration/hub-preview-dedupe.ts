/**
 * 허브 미리보기 재담기 중복 판별.
 * 택배 양식 표시·다운로드와 별개로, 표준 주문행의 내부 식별값만 사용한다.
 */

import type { PreviewRowWithId } from '@/app/order-convert/OrderConvertPreviewTableRow';
import type { StandardOrderRow } from '@/app/pipeline/order/order-pipeline';

function cell(row: StandardOrderRow, key: string): string {
  return String(row[key] ?? '').trim();
}

/**
 * 몰(판매처) + 주문번호 + 상품주문번호(없으면 라인 보조키).
 * 키가 약하면 null — 이 경우 중복 스킵하지 않는다(오삭제 방지).
 */
export function buildHubPreviewSourceDedupeKey(row: StandardOrderRow): string | null {
  const mall = cell(row, '판매처') || cell(row, '쇼핑몰');
  const orderNo = cell(row, '주문번호');
  if (!orderNo) return null;

  const productOrderNo = cell(row, '상품주문번호');
  const lineId =
    productOrderNo ||
    [cell(row, '묶음배송번호'), cell(row, '옵션ID')].filter(Boolean).join(':') ||
    [cell(row, '상품명'), cell(row, '상품옵션') || cell(row, '등록옵션명') || cell(row, '옵션')]
      .filter(Boolean)
      .join('|');

  if (!lineId) return null;

  return [mall || '_', orderNo, lineId].join('\u001f');
}

export function filterHubPreviewRowsBySourceDedupe(
  incoming: PreviewRowWithId[],
  existing: PreviewRowWithId[],
): { toAdd: PreviewRowWithId[]; skipped: number } {
  const seen = new Set(
    existing
      .map((row) => row.sourceDedupeKey)
      .filter((key): key is string => typeof key === 'string' && key.length > 0),
  );

  const toAdd: PreviewRowWithId[] = [];
  let skipped = 0;

  for (const row of incoming) {
    const key = row.sourceDedupeKey;
    if (key) {
      if (seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key);
    }
    toAdd.push(row);
  }

  return { toAdd, skipped };
}
