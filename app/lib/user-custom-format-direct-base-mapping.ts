import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import { ALIAS_DICTIONARY } from '@/app/pipeline/base/alias-dictionary';
import type { PreviewRow } from '@/app/pipeline/merge/types';
import type { TemplateBridgeFile } from '@/app/pipeline/template/types';
import type { MappingResult } from '@/app/pipeline/template/map-template-to-base';
import {
  fetchOrderPipelineStage2,
  type OrderPipelineStage2Input,
} from '@/app/lib/fetch-order-pipeline-stage2';
import {
  isTrackingNumberUploadHeader,
  sanitizeTrackingNumberForUpload,
} from '@/app/lib/sanitize-tracking-number-for-upload';

export type DirectBaseHeaderMapping = Record<string, string | null>;

function normalizeHeaderLabel(header: string): string {
  return header
    .replace(/\s/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[.·]/g, '')
    .replace(/[^가-힣0-9]/g, '')
    .trim()
    .toLowerCase();
}

function buildSourceHeaderToBaseMap(
  headers: readonly string[],
  headerMapping: MappingResult | null,
): Map<string, string | null> {
  const map = new Map<string, string | null>();
  if (!headerMapping) return map;

  if (
    Array.isArray(headerMapping.mappingDetails) &&
    headerMapping.mappingDetails.length > 0
  ) {
    for (const detail of headerMapping.mappingDetails) {
      map.set(detail.originalHeader, detail.baseHeader);
      map.set(detail.originalHeader.trim(), detail.baseHeader);
    }
    return map;
  }

  headerMapping.mappedBaseHeaders.forEach((baseHeader, index) => {
    const sourceHeader = headers[index];
    if (!sourceHeader) return;
    map.set(sourceHeader, baseHeader);
    map.set(sourceHeader.trim(), baseHeader);
  });

  return map;
}

function resolveBaseHeaderFromLabel(label: string): string | null {
  const normalized = normalizeHeaderLabel(label);
  if (!normalized) return null;

  for (const baseHeader of BASE_HEADERS) {
    if (normalizeHeaderLabel(baseHeader) === normalized) {
      return baseHeader;
    }
  }

  for (const [alias, baseHeader] of Object.entries(ALIAS_DICTIONARY)) {
    if (normalizeHeaderLabel(alias) === normalized) {
      return baseHeader;
    }
  }

  return null;
}

export function inferDirectBaseHeaderMappings(
  outputHeaders: readonly string[],
  directHeaderMappings: Record<string, string | null> = {},
): DirectBaseHeaderMapping {
  const result: DirectBaseHeaderMapping = {};

  for (const outputHeader of outputHeaders) {
    const sourceHeader = directHeaderMappings[outputHeader];
    if (!sourceHeader) {
      result[outputHeader] = null;
      continue;
    }

    result[outputHeader] =
      resolveBaseHeaderFromLabel(sourceHeader) ??
      resolveBaseHeaderFromLabel(outputHeader);
  }

  return result;
}

export async function buildDirectBaseHeaderMappingsForUserCustomFormat(params: {
  outputHeaders: readonly string[];
  directHeaderMappings: Record<string, string | null>;
  cleanInputFile: OrderPipelineStage2Input;
  fileSessionId: string;
  trialHeader?: boolean;
}): Promise<DirectBaseHeaderMapping> {
  const { headerMapping } = await fetchOrderPipelineStage2(
    params.cleanInputFile,
    params.fileSessionId,
    { trialHeader: params.trialHeader },
  );

  const sourceToBase = buildSourceHeaderToBaseMap(
    params.cleanInputFile.headers,
    headerMapping,
  );

  const result: DirectBaseHeaderMapping = {};
  for (const outputHeader of params.outputHeaders) {
    const sourceHeader = params.directHeaderMappings[outputHeader];
    if (!sourceHeader) {
      result[outputHeader] = null;
      continue;
    }

    const mapped =
      sourceToBase.get(sourceHeader) ??
      sourceToBase.get(sourceHeader.trim()) ??
      resolveBaseHeaderFromLabel(sourceHeader) ??
      resolveBaseHeaderFromLabel(outputHeader);

    result[outputHeader] = mapped;
  }

  return result;
}

export function resolveDirectBaseHeaderMappings(
  bridgeFile: TemplateBridgeFile,
): DirectBaseHeaderMapping {
  if (
    bridgeFile.directBaseHeaderMappings &&
    Object.keys(bridgeFile.directBaseHeaderMappings).length > 0
  ) {
    return bridgeFile.directBaseHeaderMappings;
  }

  return inferDirectBaseHeaderMappings(
    bridgeFile.courierHeaders ?? [],
    bridgeFile.directHeaderMappings ?? {},
  );
}

export function buildEffectiveMappedBaseHeaders(
  bridgeFile: TemplateBridgeFile | null | undefined,
): (string | null)[] | undefined {
  if (!bridgeFile?.courierHeaders?.length) return undefined;

  const directBase = bridgeFile.directBaseHeaderMappings;
  const hasDirectBase =
    directBase && Object.keys(directBase).length > 0;

  if (hasDirectBase) {
    return bridgeFile.courierHeaders.map(
      (header) => directBase[header] ?? null,
    );
  }

  if (
    bridgeFile.directHeaderMappings &&
    Object.keys(bridgeFile.directHeaderMappings).length > 0
  ) {
    const inferred = inferDirectBaseHeaderMappings(
      bridgeFile.courierHeaders,
      bridgeFile.directHeaderMappings,
    );
    return bridgeFile.courierHeaders.map((header) => inferred[header] ?? null);
  }

  return bridgeFile.mappedBaseHeaders;
}

function resolveStandardValue(
  standardRow: Record<string, string>,
  baseHeader: string | null | undefined,
): string {
  if (!baseHeader) return '';

  if (baseHeader === '상품주문번호') {
    for (const header of ['상품주문번호', '주문번호']) {
      const value = String(standardRow[header] ?? '').trim();
      if (value) return value;
    }
    return '';
  }

  if (baseHeader === '주문번호') {
    for (const header of ['주문번호', '상품주문번호']) {
      const value = String(standardRow[header] ?? '').trim();
      if (value) return value;
    }
    return '';
  }

  return String(standardRow[baseHeader] ?? '').trim();
}

export function buildDirectPreviewRowsFromStandardRows(
  standardRows: Record<string, string>[],
  bridgeFile: TemplateBridgeFile,
  fixedInput: Record<string, string>,
  baseHeaderMappings: DirectBaseHeaderMapping = resolveDirectBaseHeaderMappings(bridgeFile),
): PreviewRow[] {
  const courierHeaders = bridgeFile.courierHeaders ?? [];

  return standardRows.map((standardRow) => {
    const previewRow: PreviewRow = {};

    for (const courierHeader of courierHeaders) {
      const baseHeader = baseHeaderMappings[courierHeader] ?? null;
      const orderValue = resolveStandardValue(standardRow, baseHeader);
      const fixedValue = String(fixedInput[courierHeader] ?? '').trim();
      let cellValue = orderValue || fixedValue;

      if (isTrackingNumberUploadHeader(courierHeader)) {
        cellValue = sanitizeTrackingNumberForUpload(cellValue);
      }

      previewRow[courierHeader] = cellValue;
    }

    return previewRow;
  });
}

export function buildStandardRowsFromBaseHeaderMatrix(
  headers: readonly string[],
  rows: string[][],
): Record<string, string>[] {
  return rows.map((row) => {
    const standardRow: Record<string, string> = {};
    headers.forEach((header, index) => {
      standardRow[header] = String(row[index] ?? '').trim();
    });
    return standardRow;
  });
}
