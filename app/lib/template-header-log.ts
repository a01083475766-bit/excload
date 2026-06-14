/**
 * 업로드 양식·주문파일 1행 헤더 수집 — 헤더명만, 주문·PII 미저장
 */

import type { MappingResult } from '@/app/pipeline/template/map-template-to-base';
import type { TemplateBridgeFile } from '@/app/pipeline/template/types';

export const TEMPLATE_HEADER_LOG_PAGES = [
  'order-convert',
  'logistics-convert',
  'invoice-file-convert',
] as const;

export type TemplateHeaderLogPage = (typeof TEMPLATE_HEADER_LOG_PAGES)[number];

export const TEMPLATE_HEADER_LOG_SOURCES = ['template_upload', 'order_upload'] as const;

export type TemplateHeaderLogSource = (typeof TEMPLATE_HEADER_LOG_SOURCES)[number];

export const TEMPLATE_HEADER_LOG_MAX_HEADERS = 200;
export const TEMPLATE_HEADER_LOG_MAX_HEADER_LEN = 100;

export type TemplateHeaderLogMappedEntry = {
  header: string;
  baseHeader: string | null;
};

export type TemplateHeaderLogPayload = {
  page: TemplateHeaderLogPage;
  fileSessionId?: string;
  templateId?: string;
  templateName?: string;
  courierName?: string;
  headers: string[];
  mappedHeaders: TemplateHeaderLogMappedEntry[];
  unknownHeaders: string[];
  headerCount: number;
  mappingSuccessRate: number;
  source: TemplateHeaderLogSource;
};

export function sanitizeHeaderLabel(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  return s.length > TEMPLATE_HEADER_LOG_MAX_HEADER_LEN
    ? s.slice(0, TEMPLATE_HEADER_LOG_MAX_HEADER_LEN)
    : s;
}

export function sanitizeHeaderArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const label = sanitizeHeaderLabel(item);
    if (!label) continue;
    out.push(label);
    if (out.length >= TEMPLATE_HEADER_LOG_MAX_HEADERS) break;
  }
  return out;
}

export function buildMappedHeadersFromMapping(
  headers: string[],
  mapping: Pick<MappingResult, 'mappedBaseHeaders'>,
): TemplateHeaderLogMappedEntry[] {
  const sanitized = sanitizeHeaderArray(headers);
  return sanitized.map((header, index) => {
    const baseRaw = mapping.mappedBaseHeaders[index];
    const baseHeader =
      baseRaw != null && String(baseRaw).trim() !== '' ? sanitizeHeaderLabel(baseRaw) : null;
    return { header, baseHeader };
  });
}

/** 0~1 범위 매핑 성공률 (헤더명만 기준) */
export function computeMappingSuccessRate(
  headers: string[],
  mapping: Pick<MappingResult, 'mappedBaseHeaders'>,
): number {
  const sanitized = sanitizeHeaderArray(headers);
  if (sanitized.length === 0) return 1;

  let mapped = 0;
  for (let i = 0; i < sanitized.length; i++) {
    const baseRaw = mapping.mappedBaseHeaders[i];
    if (baseRaw != null && String(baseRaw).trim() !== '') {
      mapped++;
    }
  }

  return Math.round((mapped / sanitized.length) * 1000) / 1000;
}

export function buildOrderFileHeaderLogPayload(
  headers: string[],
  mapping: MappingResult,
  options: {
    page: TemplateHeaderLogPage;
    fileSessionId?: string;
    templateId?: string | null;
    templateName?: string | null;
    courierName?: string | null;
  },
): TemplateHeaderLogPayload {
  const sanitizedHeaders = sanitizeHeaderArray(headers);
  const mappedHeaders = buildMappedHeadersFromMapping(sanitizedHeaders, mapping);
  const unknownHeaders = sanitizeHeaderArray(mapping.unknownHeaders ?? []);

  const templateName = options.templateName?.trim()
    ? sanitizeHeaderLabel(options.templateName)
    : undefined;
  const courierName = options.courierName?.trim()
    ? sanitizeHeaderLabel(options.courierName)
    : undefined;

  return {
    page: options.page,
    fileSessionId: options.fileSessionId,
    templateId: options.templateId ?? undefined,
    templateName: templateName || undefined,
    courierName: courierName || undefined,
    headers: sanitizedHeaders,
    mappedHeaders,
    unknownHeaders,
    headerCount: sanitizedHeaders.length,
    mappingSuccessRate: computeMappingSuccessRate(sanitizedHeaders, mapping),
    source: 'order_upload',
  };
}

export function buildTemplateHeaderLogPayload(
  bridgeFile: TemplateBridgeFile,
  options: {
    page: TemplateHeaderLogPage;
    fileSessionId?: string;
    templateId?: string | null;
    templateName?: string | null;
    courierName?: string | null;
  },
): TemplateHeaderLogPayload {
  const courierHeaders = sanitizeHeaderArray(bridgeFile.courierHeaders ?? []);
  const mapped = bridgeFile.mappedBaseHeaders ?? [];
  const mappedHeaders: TemplateHeaderLogMappedEntry[] = courierHeaders.map((header, index) => ({
    header,
    baseHeader:
      mapped[index] != null && String(mapped[index]).trim() !== ''
        ? sanitizeHeaderLabel(mapped[index])
        : null,
  }));

  const unknownSet = new Set(sanitizeHeaderArray(bridgeFile.unknownHeaders ?? []));
  const unknownHeaders = [...unknownSet];

  const templateName = options.templateName?.trim()
    ? sanitizeHeaderLabel(options.templateName)
    : undefined;
  const courierName = options.courierName?.trim()
    ? sanitizeHeaderLabel(options.courierName)
    : undefined;

  const mapping: MappingResult = {
    mappedBaseHeaders: mappedHeaders.map((entry) => entry.baseHeader),
    unknownHeaders,
  };

  return {
    page: options.page,
    fileSessionId: options.fileSessionId,
    templateId: options.templateId ?? undefined,
    templateName: templateName || undefined,
    courierName: courierName || undefined,
    headers: courierHeaders,
    mappedHeaders,
    unknownHeaders,
    headerCount: courierHeaders.length,
    mappingSuccessRate: computeMappingSuccessRate(courierHeaders, mapping),
    source: 'template_upload',
  };
}

/** 헤더 수집 — 실패해도 업로드 UX에 영향 없음 */
export function logTemplateHeaderUpload(payload: TemplateHeaderLogPayload): void {
  void fetch('/api/template-header-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    /* 수집 실패는 무시 */
  });
}

export function maskEmailForAdmin(email: string | null | undefined): string {
  if (!email || !email.includes('@')) return '—';
  const [local, domain] = email.split('@');
  if (!local || !domain) return '—';
  if (local.length <= 1) return `*@${domain}`;
  if (local.length === 2) return `${local[0]}*@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

export function isTemplateHeaderLogPage(value: string): value is TemplateHeaderLogPage {
  return (TEMPLATE_HEADER_LOG_PAGES as readonly string[]).includes(value);
}

export function isTemplateHeaderLogSource(value: string): value is TemplateHeaderLogSource {
  return (TEMPLATE_HEADER_LOG_SOURCES as readonly string[]).includes(value);
}

export type UnknownHeaderTopEntry = {
  header: string;
  count: number;
};

/** unknownHeaders JSON 배열을 헤더별 등장 횟수로 집계 */
export function aggregateUnknownHeaderCounts(
  rows: { unknownHeaders: unknown }[],
): UnknownHeaderTopEntry[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (!Array.isArray(row.unknownHeaders)) continue;
    const seenInRow = new Set<string>();
    for (const item of row.unknownHeaders) {
      const label = sanitizeHeaderLabel(item);
      if (!label || seenInRow.has(label)) continue;
      seenInRow.add(label);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([header, count]) => ({ header, count }))
    .sort((a, b) => b.count - a.count || a.header.localeCompare(b.header, 'ko'));
}
