/**
 * 업로드 양식·주문파일 1행 헤더 수집 — 헤더명만, 주문·PII 미저장
 */

import type { MappingResult } from '@/app/pipeline/template/map-template-to-base';
import type { TemplateBridgeFile } from '@/app/pipeline/template/types';

export const TEMPLATE_HEADER_LOG_PAGES = [
  'order-convert',
  'logistics-convert',
  'invoice-file-convert',
  'order-integration-hub',
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

/** 통계·사전 sync용 — 빈 헤더 열 제거, 순서·중복 헤더명은 유지 */
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

/** 레이아웃 보존: trim·길이 제한만, 빈 열·중복 헤더명 유지 */
export function sanitizeHeaderArrayForLayout(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    out.push(sanitizeHeaderLabel(item));
    if (out.length >= TEMPLATE_HEADER_LOG_MAX_HEADERS) break;
  }
  return out;
}

export function countNonEmptyLayoutHeaders(headers: string[]): number {
  return headers.filter((header) => header.trim() !== '').length;
}

export function buildMappedHeadersFromMapping(
  headers: string[],
  mapping: Pick<MappingResult, 'mappedBaseHeaders'>,
): TemplateHeaderLogMappedEntry[] {
  const layoutHeaders = sanitizeHeaderArrayForLayout(headers);
  return layoutHeaders.map((header, index) => {
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
  const layoutHeaders = sanitizeHeaderArrayForLayout(headers);
  const nonEmpty = layoutHeaders.filter((header) => header.trim() !== '');
  if (nonEmpty.length === 0) return 1;

  let mapped = 0;
  for (let i = 0; i < layoutHeaders.length; i++) {
    if (!layoutHeaders[i]?.trim()) continue;
    const baseRaw = mapping.mappedBaseHeaders[i];
    if (baseRaw != null && String(baseRaw).trim() !== '') {
      mapped++;
    }
  }

  return Math.round((mapped / nonEmpty.length) * 1000) / 1000;
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
  const layoutHeaders = sanitizeHeaderArrayForLayout(headers);
  const mappedHeaders = buildMappedHeadersFromMapping(layoutHeaders, mapping);
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
    headers: layoutHeaders,
    mappedHeaders,
    unknownHeaders,
    headerCount: countNonEmptyLayoutHeaders(layoutHeaders),
    mappingSuccessRate: computeMappingSuccessRate(layoutHeaders, mapping),
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
  const layoutHeaders = sanitizeHeaderArrayForLayout(bridgeFile.courierHeaders ?? []);
  const mapped = bridgeFile.mappedBaseHeaders ?? [];
  const mappedHeaders: TemplateHeaderLogMappedEntry[] = layoutHeaders.map((header, index) => ({
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
    headers: layoutHeaders,
    mappedHeaders,
    unknownHeaders,
    headerCount: countNonEmptyLayoutHeaders(layoutHeaders),
    mappingSuccessRate: computeMappingSuccessRate(layoutHeaders, mapping),
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

export type HeaderUsageTopEntry = {
  header: string;
  count: number;
  exampleBaseHeader: string | null;
  isUnmapped: boolean;
  lastSeenAt: string;
  pages: string[];
  /** HeaderUsageCount 누적 (사전 sync 성공 시) */
  lifetimeCount: number | null;
};

function mappedHeadersToMap(raw: unknown): Map<string, string | null> {
  const map = new Map<string, string | null>();
  if (!Array.isArray(raw)) return map;
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const header = sanitizeHeaderLabel((item as { header?: unknown }).header);
    if (!header) continue;
    const baseRaw = (item as { baseHeader?: unknown }).baseHeader;
    const baseHeader =
      baseRaw != null && String(baseRaw).trim() !== ''
        ? sanitizeHeaderLabel(baseRaw)
        : null;
    map.set(header, baseHeader);
  }
  return map;
}

/** 업로드 로그 rows → 헤더명별 등장 횟수·매핑·페이지 집계 */
export function aggregateHeaderUsageFromLogs(
  rows: {
    headers: unknown;
    mappedHeaders: unknown;
    unknownHeaders: unknown;
    page: string;
    createdAt: Date;
  }[],
): Omit<HeaderUsageTopEntry, 'lifetimeCount'>[] {
  const map = new Map<
    string,
    {
      count: number;
      lastSeenAt: Date;
      pages: Set<string>;
      baseHeader: string | null;
      seenUnmapped: boolean;
    }
  >();

  for (const row of rows) {
    if (!Array.isArray(row.headers)) continue;
    const mapped = mappedHeadersToMap(row.mappedHeaders);
    const unknownSet = new Set(
      Array.isArray(row.unknownHeaders)
        ? row.unknownHeaders
            .map((item) => sanitizeHeaderLabel(item))
            .filter(Boolean)
        : [],
    );
    const seenInRow = new Set<string>();

    for (const item of row.headers) {
      const label = sanitizeHeaderLabel(item);
      if (!label || seenInRow.has(label)) continue;
      seenInRow.add(label);

      const baseFromMap = mapped.get(label) ?? null;
      const existing = map.get(label) ?? {
        count: 0,
        lastSeenAt: row.createdAt,
        pages: new Set<string>(),
        baseHeader: baseFromMap,
        seenUnmapped: false,
      };

      existing.count += 1;
      existing.pages.add(row.page);
      if (row.createdAt >= existing.lastSeenAt) {
        existing.lastSeenAt = row.createdAt;
        if (baseFromMap != null) {
          existing.baseHeader = baseFromMap;
        }
      }
      if (unknownSet.has(label) || baseFromMap == null) {
        existing.seenUnmapped = true;
      }

      map.set(label, existing);
    }
  }

  return [...map.entries()]
    .map(([header, entry]) => ({
      header,
      count: entry.count,
      exampleBaseHeader: entry.baseHeader,
      isUnmapped: entry.seenUnmapped,
      lastSeenAt: entry.lastSeenAt.toISOString(),
      pages: [...entry.pages],
    }))
    .sort((a, b) => b.count - a.count || a.header.localeCompare(b.header, 'ko'));
}

/** 동일 헤더 구성 업로드 그룹핑용 fingerprint */
export function buildHeaderSetFingerprint(headers: unknown): string {
  if (!Array.isArray(headers)) return '';
  const sorted = headers
    .map((item) => sanitizeHeaderLabel(item))
    .filter(Boolean)
    .sort();
  return sorted.join('\u001f');
}

