/**
 * 헤더 레이아웃 전용 — 열 순서·중복 열 보존, 통계용 dedupe와 분리
 */

import {
  sanitizeHeaderArrayForLayout,
  type TemplateHeaderLogSource,
} from '@/app/lib/template-header-log';

export function safeHeaderLayoutFileNamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').slice(0, 40);
}

/** DB·API 응답의 headers Json → 레이아웃 배열 (순서·중복 유지) */
export function parseLayoutHeadersFromLog(raw: unknown): string[] {
  return sanitizeHeaderArrayForLayout(raw);
}

/** 헤더명만으로 형식 힌트 더미 셀 (PII 없음) */
export function buildDummySampleCellFromHeader(header: string): string {
  const trimmed = header.trim();
  if (!trimmed) return '';

  const h = trimmed.replace(/\s/g, '').toLowerCase();

  if (/전화|연락처|휴대폰|핸드폰|phone|tel|mobile/.test(h)) {
    return '010-****-1234';
  }
  if (/주소|배송지|수령지|address|우편/.test(h)) {
    return '서울 강남구 [주소]';
  }
  if (/이름|성명|수취인|주문자|받는|구매자|sender|receiver|name/.test(h)) {
    return '[이름]';
  }
  if (/메시지|메세지|요청|배송요청|전하는말|memo|message/.test(h)) {
    return '[배송메시지]';
  }
  if (/금액|가격|판매가|결제|운임|배송비|amount|price|money/.test(h)) {
    return '10,000';
  }
  if (/일자|날짜|일시|마감|배송일|희망|date|time/.test(h)) {
    return '2026-01-01';
  }
  if (/수량|qty|quantity|ea/.test(h)) {
    return '1';
  }
  if (/번호|코드|id|no|order/.test(h)) {
    return 'ORD-****';
  }
  if (/상품|품명|옵션|item|product|sku/.test(h)) {
    return '[상품정보]';
  }
  if (/상태|status|진행/.test(h)) {
    return '배송준비중';
  }

  return '[예시]';
}

export type BuildHeaderLayoutSheetRowsOptions = {
  /** false면 헤더 1행만 (기본: 더미 1행 포함) */
  includeDummyRow?: boolean;
};

/** SheetJS aoa_to_sheet용 2차원 배열 */
export function buildHeaderLayoutSheetRows(
  headers: string[],
  options: BuildHeaderLayoutSheetRowsOptions = {},
): string[][] {
  const layout = sanitizeHeaderArrayForLayout(headers);
  const includeDummyRow = options.includeDummyRow !== false;
  const rows: string[][] = [layout.map((header) => header)];
  if (includeDummyRow) {
    rows.push(layout.map((header) => buildDummySampleCellFromHeader(header)));
  }
  return rows;
}

export function buildHeaderLayoutDownloadFileName(options: {
  createdAt: string | Date;
  source: TemplateHeaderLogSource | string;
  courierName?: string | null;
  templateName?: string | null;
}): string {
  const date = new Date(options.createdAt);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const datePart = `${y}${m}${d}`;

  let label: string;
  if (options.source === 'template_upload') {
    const courier = options.courierName?.trim();
    label = courier
      ? `${safeHeaderLayoutFileNamePart(courier)}_택배양식`
      : '택배양식';
  } else if (options.source === 'order_upload') {
    label = '주문파일';
  } else {
    label = safeHeaderLayoutFileNamePart(String(options.source)) || 'headers';
  }

  return `${datePart}_${label}_headers.xlsx`;
}
