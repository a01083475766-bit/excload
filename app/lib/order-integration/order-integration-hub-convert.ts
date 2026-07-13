/**
 * 쇼핑몰주문연동 허브 — 택배변환과 동일 파이프라인으로 엑셀/텍스트 → 미리보기.
 * (order-convert page 로직의 최소 재사용)
 */

import { ExcelPreprocessPipeline } from '@/app/pipeline/preprocess/excel-preprocess-pipeline';
import { runMergePipeline } from '@/app/pipeline/merge/merge-pipeline';
import type { PreviewRow } from '@/app/pipeline/merge/types';
import type { TemplateBridgeFile } from '@/app/pipeline/template/types';
import { fetchOrderPipelineStage2 } from '@/app/lib/fetch-order-pipeline-stage2';
import { runTextToCleanInputAdapter } from '@/app/unified-input/adapters/TextToCleanInputAdapter';
import {
  alignRowsFromHeader,
  detectHeaderRowIndex,
  filterNonEmptyRows,
  readFirstSheetMatrixFromArrayBuffer,
} from '@/app/lib/excel/sheet-header';
import {
  ORDER_CONVERT_KEYS,
  readLocalStorageWithLegacyMigrate,
} from '@/app/lib/scoped-local-storage';
import {
  buildDefaultCjCourierSeed,
  isDefaultCjAutoSeedOptOut,
  ORDER_DEFAULT_CJ_OPT_OUT_KEY,
} from '@/app/lib/default-cj-courier-template';
import type { PreviewRowWithId } from '@/app/order-convert/OrderConvertPreviewTableRow';
import type { OrderStandardFile, StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import { BASE_HEADERS } from '@/app/pipeline/base/base-headers';
import {
  HUB_SALES_CHANNEL_TEXT,
  ensureHubSalesChannelPreviewColumn,
  fillEmptySalesChannelRows,
  salesChannelLabelFromFileName,
} from '@/app/lib/order-integration/hub-sales-channel';

export type HubConvertResult = {
  previewRows: PreviewRowWithId[];
  courierHeaders: string[];
};

function isValidBridge(value: unknown): value is TemplateBridgeFile {
  if (!value || typeof value !== 'object') return false;
  const bridge = value as TemplateBridgeFile;
  return (
    Array.isArray(bridge.courierHeaders) &&
    bridge.courierHeaders.length > 0 &&
    Array.isArray(bridge.mappedBaseHeaders)
  );
}

/** 택배변환과 동일 키에서 브릿지 로드. 없으면 기본 CJ 시드(opt-out 제외). */
export function loadHubTemplateBridge(userId: string | null): TemplateBridgeFile {
  const saved = readLocalStorageWithLegacyMigrate(ORDER_CONVERT_KEYS.bridge, userId);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as unknown;
      if (isValidBridge(parsed)) return parsed;
    } catch {
      /* fall through */
    }
  }

  if (!isDefaultCjAutoSeedOptOut(userId, ORDER_DEFAULT_CJ_OPT_OUT_KEY)) {
    return buildDefaultCjCourierSeed().bridgeFile;
  }

  throw new Error(
    '등록된 택배 업로드 양식이 없습니다. 하단 「택배 업로드 양식 등록」또는 택배주문변환에서 양식을 등록해 주세요.',
  );
}

export function loadHubFixedHeaderValues(userId: string | null): Record<string, string> {
  const saved = readLocalStorageWithLegacyMigrate(ORDER_CONVERT_KEYS.fixedHeaders, userId);
  if (!saved) return {};
  try {
    const parsed = JSON.parse(saved) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function toPreviewRowsWithIds(rows: PreviewRow[]): PreviewRowWithId[] {
  return rows.map((data) => ({
    rowId: crypto.randomUUID(),
    data,
  }));
}

function toHubConvertResult(
  previewRows: PreviewRow[],
  courierHeaders: string[],
  template: TemplateBridgeFile,
  standardRows: StandardOrderRow[],
): HubConvertResult {
  const ensured = ensureHubSalesChannelPreviewColumn({
    previewRows,
    courierHeaders,
    mappedBaseHeaders: template.mappedBaseHeaders,
    standardRows,
  });
  return {
    previewRows: toPreviewRowsWithIds(ensured.previewRows),
    courierHeaders: ensured.courierHeaders,
  };
}

export async function convertExcelBufferToHubPreview(input: {
  buffer: ArrayBuffer;
  templateBridgeFile: TemplateBridgeFile;
  fixedHeaderValues: Record<string, string>;
  /** 판매처가 비어 있을 때 채울 파일명(확장자 포함 가능) */
  sourceFileName?: string;
  onStage2ChunkProgress?: (completed: number, total: number) => void;
}): Promise<HubConvertResult> {
  const rawData = readFirstSheetMatrixFromArrayBuffer(input.buffer);
  const filteredRows = filterNonEmptyRows(rawData);
  const headerIndex = detectHeaderRowIndex(filteredRows);
  const alignedRawData = alignRowsFromHeader(filteredRows, headerIndex);

  const preprocessPipeline = new ExcelPreprocessPipeline();
  const cleanInputFile = preprocessPipeline.run(alignedRawData);
  if (!cleanInputFile.rows?.length) {
    throw new Error('엑셀에서 주문 행을 찾지 못했습니다. 헤더와 데이터를 확인해 주세요.');
  }

  const fileSessionId = crypto.randomUUID();
  const { orderStandardFile } = await fetchOrderPipelineStage2(cleanInputFile, fileSessionId, {
    onChunkProgress: input.onStage2ChunkProgress,
  });

  const salesChannel = salesChannelLabelFromFileName(input.sourceFileName ?? '');
  const orderData: OrderStandardFile = {
    ...orderStandardFile,
    rows: fillEmptySalesChannelRows(orderStandardFile.rows, salesChannel),
  };

  const stage3Result = await runMergePipeline({
    template: input.templateBridgeFile,
    orderData,
    fixedInput: input.fixedHeaderValues,
  });

  if (!stage3Result?.previewRows?.length) {
    throw new Error('엑셀 주문 변환에 실패했습니다. 양식·데이터 구성을 확인해 주세요.');
  }

  return toHubConvertResult(
    stage3Result.previewRows,
    stage3Result.courierHeaders,
    input.templateBridgeFile,
    orderData.rows,
  );
}

export async function convertTextToHubPreview(input: {
  text: string;
  templateBridgeFile: TemplateBridgeFile;
  fixedHeaderValues: Record<string, string>;
  /** 판매처가 비어 있을 때 채울 값 (기본: 텍스트주문, 이미지 OCR은 이미지주문) */
  salesChannelFallback?: string;
  onStage2ChunkProgress?: (completed: number, total: number) => void;
}): Promise<HubConvertResult> {
  const trimmed = input.text.trim();
  if (!trimmed) {
    throw new Error('변환할 텍스트를 입력해 주세요.');
  }

  const adapterResult = await runTextToCleanInputAdapter(trimmed);
  const { normalizeMeta: _normalizeMeta, ...cleanInputFile } = adapterResult;
  if (!cleanInputFile.rows.length) {
    throw new Error('텍스트에서 주문 정보를 추출하지 못했습니다. 내용을 확인해 주세요.');
  }

  const { orderStandardFile } = await fetchOrderPipelineStage2(
    {
      ...cleanInputFile,
      headers: [...cleanInputFile.headers],
      rows: cleanInputFile.rows.map((row) => [...row]),
    },
    crypto.randomUUID(),
    { onChunkProgress: input.onStage2ChunkProgress },
  );

  const salesChannel = (input.salesChannelFallback ?? HUB_SALES_CHANNEL_TEXT).trim();
  const orderData: OrderStandardFile = {
    ...orderStandardFile,
    rows: fillEmptySalesChannelRows(orderStandardFile.rows, salesChannel),
  };

  const stage3Result = await runMergePipeline({
    template: input.templateBridgeFile,
    orderData,
    fixedInput: input.fixedHeaderValues,
  });

  if (!stage3Result?.previewRows?.length) {
    throw new Error('텍스트 주문 변환에 실패했습니다. 다시 시도해 주세요.');
  }

  return toHubConvertResult(
    stage3Result.previewRows,
    stage3Result.courierHeaders,
    input.templateBridgeFile,
    orderData.rows,
  );
}

/** 주문조회(API) orderStandardFile.rows → 택배 양식 미리보기 */
export async function convertOrderStandardRowsToHubPreview(input: {
  rows: StandardOrderRow[];
  templateBridgeFile: TemplateBridgeFile;
  fixedHeaderValues: Record<string, string>;
}): Promise<HubConvertResult> {
  if (!input.rows.length) {
    throw new Error('미리보기에 담을 주문 행이 없습니다.');
  }

  const orderData: OrderStandardFile = {
    baseHeaders: BASE_HEADERS,
    rows: input.rows.map((row) => ({ ...row })),
    unknownHeaders: [],
  };

  const stage3Result = await runMergePipeline({
    template: input.templateBridgeFile,
    orderData,
    fixedInput: input.fixedHeaderValues,
  });

  if (!stage3Result?.previewRows?.length) {
    throw new Error('주문조회 결과를 택배 양식으로 변환하지 못했습니다. 등록 양식을 확인해 주세요.');
  }

  return toHubConvertResult(
    stage3Result.previewRows,
    stage3Result.courierHeaders,
    input.templateBridgeFile,
    orderData.rows,
  );
}

export async function deductHubConvertPoints(amount: number, type: 'text' | 'download'): Promise<boolean> {
  const response = await fetch('/api/user/use-points', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, type }),
  });
  if (!response.ok) return false;
  const data = (await response.json().catch(() => null)) as { success?: boolean } | null;
  return Boolean(data?.success);
}
