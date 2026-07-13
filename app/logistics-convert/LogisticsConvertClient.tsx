/**
 * ⚠️ EXCLOAD CONSTITUTION v4.3 적용 파일 (물류 주문 변환 — order-convert와 독립)
 * 모든 수정 전 CONSTITUTION.md 필독
 * 3단계 분리 파이프라인 유지 필수
 * 기준헤더 내부 전용, UI 노출 금지
 */

'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  type ChangeEvent,
  type UIEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  Truck,
  Search,
  ArrowDown,
  Image,
  X,
  Check,
  Upload,
  Loader2,
  ArrowRightLeft,
  Maximize2,
  Minimize2,
  RotateCcw,
  Trash2,
  Package,
  Coins,
} from 'lucide-react';
import { ExcloudConfirmDialog } from '@/app/components/ExcloudConfirmDialog';
import {
  EXCLOAD_PREVIEW_EMPTY_SHELL,
  EXCLOAD_PREVIEW_HEADER_ACTION_SPACER,
  EXCLOAD_PREVIEW_HEADER_ROW,
  EXCLOAD_PREVIEW_HEADER_TITLE_GROUP,
  EXCLOAD_PREVIEW_HEIGHT_DEFAULT,
  EXCLOAD_PREVIEW_HEIGHT_EXPANDED,
  EXCLOAD_PREVIEW_TABLE_SHELL,
  EXCLOAD_PREVIEW_TOOL_BTN,
  EXCLOAD_PREVIEW_TOOLBAR_SHELL,
} from '@/app/lib/ui/excload-preview-ui';
import { runTemplatePipeline } from '@/app/pipeline/template/template-pipeline';
import {
  buildTemplateHeaderLogPayload,
  buildOrderFileHeaderLogPayload,
  logTemplateHeaderUpload,
} from '@/app/lib/template-header-log';
import type { TemplateBridgeFile } from '@/app/pipeline/template/types';
import { ExcelPreprocessPipeline } from '@/app/pipeline/preprocess/excel-preprocess-pipeline';
import type { CleanInputFile } from '@/app/pipeline/preprocess/types';
import { runMergePipeline } from '@/app/pipeline/merge/merge-pipeline';
import type { PreviewRow } from '@/app/pipeline/merge/types';
import * as XLSX from 'xlsx';
import {
  alignRowsFromHeader,
  detectHeaderRowIndex,
  filterNonEmptyRows,
  readFirstSheetMatrixFromArrayBuffer,
} from '@/app/lib/excel/sheet-header';
import type { UnifiedInputPipelineResult } from '@/app/unified-input/adapters/runUnifiedInputOrderPipelines';
import { extractTextFromImage } from '@/app/unified-input/adapters/ImageToTextAdapter';
import { runTextToCleanInputAdapter } from '@/app/unified-input/adapters/TextToCleanInputAdapter';
import { runUnifiedInputOrderPipelines } from '@/app/unified-input/adapters/runUnifiedInputOrderPipelines';
import { formatPhoneDisplay } from '@/app/utils/format-phone';
import { useWorkerSortedRows } from '@/app/hooks/useWorkerSortedRows';
import { fetchOrderPipelineStage2 } from '@/app/lib/fetch-order-pipeline-stage2';
import { useHistoryStore } from '@/app/store/historyStore';
import type { SourceType, FileMetadata, SenderInfo } from '@/app/store/historyStore';
import {
  emptyInputSourceCounts,
  incrementInputSource,
  normalizeInputSourcesForSession,
  primarySourceTypeFromCounts,
  type InputSourceCounts,
} from '@/app/lib/history-input-sources';
import { useUserStore } from '@/app/store/userStore';
import { shouldChargeDownloadPoints, hasProEntitlementClient } from '@/app/lib/feedback-event/client';
import { useAuthAssetsReady } from '@/app/hooks/useAuthAssetsReady';
import { isExcloudPipelineDebugClient } from '@/app/lib/excloud-pipeline-debug';
import { FREE_TEXT_INPUT_MAX_CHARS } from '@/app/lib/plan-limits';
import {
  buildPreviewDownloadAoA,
  buildPreviewDownloadFileName,
  createPreviewDownloadWorkbook,
} from '@/app/lib/excel/preview-download-xlsx';
import {
  isTrackingNumberUploadHeader,
  sanitizeTrackingNumberForUpload,
} from '@/app/lib/sanitize-tracking-number-for-upload';
import { WorkspaceBlockingModalOverlay } from '@/app/components/WorkspaceBlockingModalOverlay';
import { landingContentCardClass } from '@/app/components/landing/landingLayout';
import { WorkspaceFormStatusBanner } from '@/app/components/WorkspaceFormStatusBanner';
import { DefaultCjTemplateNotice } from '@/app/components/DefaultCjTemplateNotice';
import { WorkspaceSettingsCheckingOverlay } from '@/app/components/WorkspaceSettingsCheckingOverlay';
import { UploadTemplateChangeReuploadModal } from '@/app/components/UploadTemplateChangeReuploadModal';
import { DirectMappingSampleFileModal } from '@/app/components/DirectMappingSampleFileModal';
import { DirectMappingEditorModal } from '@/app/components/DirectMappingEditorModal';
import { DirectMappingConfirmModal } from '@/app/components/DirectMappingConfirmModal';
import { UnknownHeadersWarningBanner } from '@/app/components/UnknownHeadersWarningBanner';
import { TrialFirstPreviewFormatNoticeModal } from '@/app/components/TrialFirstPreviewFormatNoticeModal';
import { parseOrderFileHeadersFromArrayBuffer } from '@/app/lib/parse-order-file-headers';
import {
  USER_CUSTOM_FORMAT_NAME,
  createEmptyTemplateBridgeShell,
  resolveUserCustomFormatDisplayName,
} from '@/app/lib/user-custom-format';
import {
  buildDirectBaseHeaderMappingsForUserCustomFormat,
  buildDirectPreviewRowsFromStandardRows,
  buildEffectiveMappedBaseHeaders,
  buildStandardRowsFromBaseHeaderMatrix,
  inferDirectBaseHeaderMappings,
} from '@/app/lib/user-custom-format-direct-base-mapping';
import type { OrderPipelineStage2Input } from '@/app/lib/fetch-order-pipeline-stage2';
import { usePreviewWorkspaceSession } from '@/app/hooks/usePreviewWorkspaceSession';
import { useClearPreviewOnBridgeChange } from '@/app/hooks/useClearPreviewOnBridgeChange';
import { useTrialFirstPreviewFormatNotice } from '@/app/hooks/useTrialFirstPreviewFormatNotice';
import {
  clearAllPreviewWorkspacesForScope,
  clearPreviewWorkspace,
  migratePreviewWorkspaceGuestToUser,
} from '@/app/lib/preview-workspace-session';
import {
  clearWorkspaceFiles,
  loadWorkspaceFiles,
  putWorkspaceFiles,
} from '@/app/lib/workspace-order-files-idb';
import {
  NormalizeQualityNoticeModal,
  isLikelyClientNetworkError,
  type NormalizeQualityNoticeVariant,
} from '@/app/components/NormalizeQualityNoticeModal';
import { resolveNormalizeQualityNotice } from '@/app/lib/normalize-29/normalize29-error';
import {
  TextConvertResultReviewModal,
  buildTextConvertReviewRows,
  type TextConvertReviewRow,
} from '@/app/components/TextConvertResultReviewModal';
import { RequiresAccountOrderModal } from '@/app/components/RequiresAccountOrderInput';
import { useExcelFileUnlock } from '@/app/hooks/useExcelFileUnlock';
import { ExcelUnlockCancelledError } from '@/app/lib/excel/protected-file-types';
import {
  applyProductCodeProjection,
  parseProductCodeMapFromMatrix,
  resolveLogisticsProductNameColumn,
  resolveLogisticsProductOptionColumn,
  resolveProductCodeColumnHeader,
  resolveProductCodeFromMap,
  type ProductCodeMap,
} from '@/app/logistics-convert/product-code-projection';
import {
  applyLogisticsStagedColumnMappings,
  classifyLogisticsMappingMatrix,
  type LogisticsStagedColumnMapping,
} from '@/app/logistics-convert/logistics-column-code-mapping';
import {
  LOGISTICS_MAIN_KEYS,
  readLocalStorageWithLegacyMigrate,
  writeLocalStorageForUser,
  removeLocalStorageForUser,
} from '@/app/lib/scoped-local-storage';
import {
  deleteFixedHeaderEntry,
  patchFixedHeaderEntry,
  pruneFixedInputToCourierKeys,
} from '@/app/lib/fixed-header-values';
import {
  registerOrderSnapshotsForPreviewChunk,
  pruneOrderSnapshotsForRowIds,
} from '@/app/lib/order-standard-row-snapshot';
import { reapplyFixedInputToPreviewRows } from '@/app/lib/reapply-fixed-input-preview';
import {
  buildDefaultCjCourierSeed,
  DEFAULT_CJ_FORMAT_ID,
  DEFAULT_CJ_INTRO_COPY,
  isActiveDefaultCjTemplate,
  isDefaultCjAutoSeedOptOutForUserIds,
  isDefaultCjIntroAcknowledged,
  isDefaultCjSeedFormat,
  isDefaultCjSeedFormatId,
  LOGISTICS_DEFAULT_CJ_INTRO_ACKNOWLEDGED_KEY,
  LOGISTICS_DEFAULT_CJ_INTRO_SUPPRESS_KEY,
  LOGISTICS_DEFAULT_CJ_OPT_OUT_KEY,
  setDefaultCjAutoSeedOptOutForUserIds,
  setDefaultCjIntroAcknowledged,
} from '@/app/lib/default-cj-courier-template';
import {
  TRIAL_DEFAULT_FORMAT_DISPLAY_NAME,
  TRIAL_EXTRA_SAMPLE_FORMATS,
  TRIAL_SEED_FORMAT_IDS,
  buildCourierTemplateFromHeaders,
  buildTrialBridgeFile,
  isTrialSeedFormatId,
  repairTrialBridgeFileIfNeeded,
  trialBridgeNeedsAliasRefresh,
} from '@/app/logistics-convert/trial-sample-formats';
import {
  BundleShippingModal,
  type BundleShippingApplyPayload,
  type BundleShippingApplySummary,
} from '@/app/order-convert/BundleShippingModal';
import {
  countBundleShippingDuplicateRows,
  detectBundleShippingGroups,
} from '@/app/order-convert/bundle-shipping-utils';

/** 상품코드 매핑 실패 시 안내 배너용 */
type ProductCodeMappingNotice = {
  targetHeader: string;
  failCount: number;
  successCount: number;
};

type PreviewRowWithId = {
  rowId: string;
  data: PreviewRow;
};

type ParsedExcelPreviewChunk = {
  file: File;
  rowIds: string[];
  previewRows: PreviewRowWithId[];
  standardRows: Record<string, string>[];
  courierHeaders: string[];
  unknownHeaders: string[];
  unknownHeaderSamples: UnknownHeaderSamples;
};

type UnknownHeaderSamples = Record<string, string[]>;
type UnknownHeaderSampleInput = {
  headers: readonly string[];
  rows: ReadonlyArray<ReadonlyArray<unknown>>;
};
type DirectHeaderMapping = Record<string, string | null>;
type DirectMappingFinalColumn = {
  sourceHeader: string;
  outputHeader: string;
};

function maskUnknownHeaderSampleValue(rawValue: unknown): string {
  const value = String(rawValue ?? '').trim();
  if (!value) return '';

  return value
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part;

      const chars = Array.from(part);
      if (chars.length <= 2) return part;

      let masked = '';
      for (let i = 0; i < chars.length; i += 4) {
        const chunk = chars.slice(i, i + 4);
        if (chunk.length === 1) {
          masked += chunk[0];
        } else if (chunk.length === 2 && i > 0) {
          masked += `${chunk[0]}*`;
        } else {
          masked += chunk
            .map((char, index) => (index < 2 ? char : '*'))
            .join('');
        }
      }

      return masked;
    })
    .join('');
}

function buildUnknownHeaderSamples(
  unknownHeaders: string[],
  inputFile: UnknownHeaderSampleInput | null | undefined,
): UnknownHeaderSamples {
  if (!inputFile || unknownHeaders.length === 0) return {};

  const exactHeaderIndex = new Map<string, number>();
  const trimmedHeaderIndex = new Map<string, number>();
  inputFile.headers.forEach((header, index) => {
    exactHeaderIndex.set(header, index);
    trimmedHeaderIndex.set(header.trim(), index);
  });

  return unknownHeaders.reduce<UnknownHeaderSamples>((acc, header) => {
    const columnIndex = exactHeaderIndex.get(header) ?? trimmedHeaderIndex.get(header.trim());
    const samples: string[] = [];
    const seen = new Set<string>();

    if (typeof columnIndex === 'number') {
      for (const row of inputFile.rows) {
        const masked = maskUnknownHeaderSampleValue(row[columnIndex]);
        if (!masked || seen.has(masked)) continue;

        seen.add(masked);
        samples.push(masked);
        if (samples.length >= 3) break;
      }
    }

    acc[header] = samples;
    return acc;
  }, {});
}

function buildHeaderSamples(inputFile: UnknownHeaderSampleInput): UnknownHeaderSamples {
  return buildUnknownHeaderSamples([...inputFile.headers], inputFile);
}

function hasDirectHeaderMappings(
  bridgeFile: TemplateBridgeFile | null | undefined,
): bridgeFile is TemplateBridgeFile & { directHeaderMappings: DirectHeaderMapping } {
  return Boolean(
    bridgeFile &&
      bridgeFile.directHeaderMappings &&
      Object.keys(bridgeFile.directHeaderMappings).length > 0,
  );
}

function buildDirectPreviewRowsFromCleanInput(
  inputFile: CleanInputFile,
  bridgeFile: TemplateBridgeFile & { directHeaderMappings: DirectHeaderMapping },
  fixedInput: Record<string, string>,
): PreviewRow[] {
  const exactHeaderIndex = new Map<string, number>();
  const trimmedHeaderIndex = new Map<string, number>();

  inputFile.headers.forEach((header, index) => {
    exactHeaderIndex.set(header, index);
    trimmedHeaderIndex.set(header.trim(), index);
  });

  return inputFile.rows.map((row) => {
    const previewRow: PreviewRow = {};

    for (const courierHeader of bridgeFile.courierHeaders) {
      const sourceHeader = bridgeFile.directHeaderMappings[courierHeader];
      const sourceIndex = sourceHeader
        ? exactHeaderIndex.get(sourceHeader) ?? trimmedHeaderIndex.get(sourceHeader.trim())
        : undefined;
      const orderValue =
        typeof sourceIndex === 'number' ? String(row[sourceIndex] ?? '').trim() : '';
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

function mergeUnknownHeaders(previous: string[], next: string[]): string[] {
  return [...previous, ...next].filter((header, index, headers) => headers.indexOf(header) === index);
}

function mergeUnknownHeaderSamples(
  previous: UnknownHeaderSamples,
  next: UnknownHeaderSamples,
): UnknownHeaderSamples {
  const merged: UnknownHeaderSamples = { ...previous };

  for (const [header, samples] of Object.entries(next)) {
    const previousSamples = merged[header] ?? [];
    merged[header] = [...previousSamples, ...samples].filter(
      (sample, index, allSamples) => allSamples.indexOf(sample) === index,
    ).slice(0, 3);
  }

  return merged;
}

interface CourierUploadHeader {
  name: string;
  index: number;
  isEmpty: boolean;
  isFixed?: boolean;
  fixedType?: 'sender_name' | 'sender_phone' | 'sender_address';
}

interface CourierUploadTemplate {
  courierType: string | null;
  headers: CourierUploadHeader[];
  requiresSender?: boolean;
}

interface RecentExcelFormat {
  id: string;
  createdAt: string;
  columnOrder: string[];
  displayName?: string;
  bridgeFile?: TemplateBridgeFile;
  /** 체험판 기본 제공 양식 등 삭제 불가 */
  protectedFromDeletion?: boolean;
}

function isTrialDefaultProtectedFormat(f: RecentExcelFormat | undefined): boolean {
  if (!f) return false;
  if (f.protectedFromDeletion) return true;
  if (isTrialSeedFormatId(f.id)) return true;
  return f.displayName === TRIAL_DEFAULT_FORMAT_DISPLAY_NAME;
}

function isProtectedFormat(f: RecentExcelFormat | undefined, trialMode: boolean): boolean {
  return trialMode && isTrialDefaultProtectedFormat(f);
}

/** 물류 상품코드 매핑 파일(3PL과 동일 구조) */
type LogisticsMappingFileFormat = {
  id: string;
  displayName?: string;
  createdAt: string;
  rows: string[][];
};

const LOGISTICS_MAPPING_STORAGE_KEY = 'logistics_recent_mapping_formats_v1';
const LOGISTICS_MAPPING_SELECTED_KEY = 'logistics_selected_mapping_id_v1';
/** simple 코드매핑(열 헤더명 → 원본→변환 맵) — productCodeMap과 별도 */
const LOGISTICS_SIMPLE_COLUMN_MAPS_KEY = 'logistics_simple_column_code_maps_v1';
/** product 코드매핑(열 헤더명 → 상품명|옵션 → 코드 맵) — 자동 적용용 */
const LOGISTICS_PRODUCT_COLUMN_MAPS_KEY = 'logistics_product_column_code_maps_v1';
/** 열 헤더별 업로드 시 자동 코드매핑 여부 */
const LOGISTICS_COLUMN_AUTO_APPLY_KEY = 'logistics_column_auto_apply_v1';

type ColumnAutoApplyEntry = {
  enabled: boolean;
  kind: 'simple' | 'product';
};

function loadSimpleColumnMapsByUser(
  userId: string | null | undefined,
): Record<string, Record<string, string>> {
  if (typeof window === 'undefined') return {};
  try {
    const key = getLogisticsScopedKey(LOGISTICS_SIMPLE_COLUMN_MAPS_KEY, userId);
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return {};
    return parsed as Record<string, Record<string, string>>;
  } catch {
    return {};
  }
}

function saveSimpleColumnMapForHeader(
  userId: string | null | undefined,
  header: string,
  map: Record<string, string>,
): void {
  const all = loadSimpleColumnMapsByUser(userId);
  all[header] = map;
  const key = getLogisticsScopedKey(LOGISTICS_SIMPLE_COLUMN_MAPS_KEY, userId);
  localStorage.setItem(key, JSON.stringify(all));
}

function buildSimpleMapFromEditorRows(
  rows: Array<{ key: string; value: string }>,
): Record<string, string> {
  const m: Record<string, string> = {};
  for (const r of rows) {
    const v = String(r.value ?? '').trim();
    if (!v) continue;
    m[r.key] = v;
  }
  return m;
}

function loadProductColumnMapsByUser(
  userId: string | null | undefined,
): Record<string, ProductCodeMap> {
  if (typeof window === 'undefined') return {};
  try {
    const key = getLogisticsScopedKey(LOGISTICS_PRODUCT_COLUMN_MAPS_KEY, userId);
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return {};
    return parsed as Record<string, ProductCodeMap>;
  } catch {
    return {};
  }
}

function saveProductColumnMapForHeader(
  userId: string | null | undefined,
  header: string,
  map: ProductCodeMap,
): void {
  const all = loadProductColumnMapsByUser(userId);
  all[header] = map;
  const key = getLogisticsScopedKey(LOGISTICS_PRODUCT_COLUMN_MAPS_KEY, userId);
  localStorage.setItem(key, JSON.stringify(all));
}

function loadColumnAutoApplyByUser(
  userId: string | null | undefined,
): Record<string, ColumnAutoApplyEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const key = getLogisticsScopedKey(LOGISTICS_COLUMN_AUTO_APPLY_KEY, userId);
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return {};
    return parsed as Record<string, ColumnAutoApplyEntry>;
  } catch {
    return {};
  }
}

function saveColumnAutoApplyForHeader(
  userId: string | null | undefined,
  header: string,
  entry: ColumnAutoApplyEntry | null,
): void {
  const all = loadColumnAutoApplyByUser(userId);
  if (entry === null) {
    delete all[header];
  } else {
    all[header] = entry;
  }
  const key = getLogisticsScopedKey(LOGISTICS_COLUMN_AUTO_APPLY_KEY, userId);
  localStorage.setItem(key, JSON.stringify(all));
}

function computeAutoColumnMappingApply(
  rows: PreviewRowWithId[],
  headers: string[],
  userId: string | null | undefined,
): {
  rows: PreviewRowWithId[];
  newSnapshots: Record<string, Record<string, string>>;
} {
  const autoAll = loadColumnAutoApplyByUser(userId);
  const simpleMaps = loadSimpleColumnMapsByUser(userId);
  const productMaps = loadProductColumnMapsByUser(userId);
  const staged: LogisticsStagedColumnMapping[] = [];

  for (const [header, cfg] of Object.entries(autoAll)) {
    if (!cfg?.enabled) continue;
    if (!headers.includes(header)) continue;
    if (cfg.kind === 'simple') {
      const sm = simpleMaps[header];
      if (sm && Object.keys(sm).length > 0) {
        staged.push({
          targetHeader: header,
          kind: 'simple',
          fileName: '자동적용',
          simpleMap: sm,
        });
      }
    } else {
      const pm = productMaps[header];
      if (pm && Object.keys(pm).length > 0) {
        staged.push({
          targetHeader: header,
          kind: 'product',
          fileName: '자동적용',
          productMap: pm,
        });
      }
    }
  }

  if (!staged.length) {
    return { rows, newSnapshots: {} };
  }

  const baseline = rows.map((r) => r.data);
  const merged = applyLogisticsStagedColumnMappings(baseline, headers, staged);
  const newSnapshots: Record<string, Record<string, string>> = {};

  for (const spec of staged) {
    const h = spec.targetHeader;
    const rowSnap: Record<string, string> = {};
    for (let i = 0; i < rows.length; i++) {
      rowSnap[rows[i]!.rowId] = String(baseline[i]?.[h] ?? '');
    }
    newSnapshots[h] = rowSnap;
  }

  return {
    rows: merged.map((data, i) => ({
      rowId: rows[i]!.rowId,
      data,
    })),
    newSnapshots,
  };
}

/** 매핑 엑셀 안내 화면 예시 (과일) */
const MAPPING_EXCEL_SIMPLE_FRUIT_EXAMPLES: Array<{
  original: string;
  converted: string;
}> = [
  { original: '사과', converted: '124546' },
  { original: '빨간사과', converted: '245465' },
  { original: '파란사과', converted: '454344' },
  { original: '배', converted: '456455' },
  { original: '포도', converted: 'aa11245' },
];

const MAPPING_EXCEL_PRODUCT_FRUIT_EXAMPLES: Array<{
  name: string;
  option: string;
  code: string;
}> = [
  { name: '사과', option: '', code: '124546' },
  { name: '사과', option: '빨간', code: '245465' },
  { name: '배', option: '', code: '456455' },
  { name: '포도', option: '', code: 'aa11245' },
];

function getLogisticsScopedKey(baseKey: string, userId: string | null | undefined): string {
  const suffix = userId && userId.trim() !== '' ? userId : 'guest';
  return `${baseKey}_${suffix}`;
}

/**
 * 물류 전용 매핑(localStorage) 복원 중 과거 포맷/깨진 JSON이 섞이면 콘솔에만 에러가 남을 수 있음.
 * 기능엔 영향이 없는 “잔재”로 보고 자동 정리(키 삭제)하도록 처리한다.
 */
function clearLogisticsMappingLocalStorage(userId: string | null | undefined): void {
  if (typeof window === 'undefined') return;

  const mappingKey = getLogisticsScopedKey(LOGISTICS_MAPPING_STORAGE_KEY, userId);
  const mappingSelectedKey = getLogisticsScopedKey(LOGISTICS_MAPPING_SELECTED_KEY, userId);

  // 현재 스코프 키
  localStorage.removeItem(mappingKey);
  localStorage.removeItem(mappingSelectedKey);

  // 레거시(스코프 미적용) 키도 함께 정리
  localStorage.removeItem(LOGISTICS_MAPPING_STORAGE_KEY);
  localStorage.removeItem(LOGISTICS_MAPPING_SELECTED_KEY);

  // 관련 단순 매핑 레거시도 함께 정리
  localStorage.removeItem(LOGISTICS_SIMPLE_COLUMN_MAPS_KEY);
  localStorage.removeItem(LOGISTICS_PRODUCT_COLUMN_MAPS_KEY);
  localStorage.removeItem(LOGISTICS_COLUMN_AUTO_APPLY_KEY);
  const productMapsKey = getLogisticsScopedKey(
    LOGISTICS_PRODUCT_COLUMN_MAPS_KEY,
    userId,
  );
  const autoApplyKey = getLogisticsScopedKey(LOGISTICS_COLUMN_AUTO_APPLY_KEY, userId);
  localStorage.removeItem(productMapsKey);
  localStorage.removeItem(autoApplyKey);
}

function parseExcelRowsForMapping(file: File): Promise<string[][]> {
  return file.arrayBuffer().then((buffer) => {
    const rawData = readFirstSheetMatrixFromArrayBuffer(buffer);
    const filtered = filterNonEmptyRows(rawData);
    const headerIndex = detectHeaderRowIndex(filtered);
    return alignRowsFromHeader(filtered, headerIndex);
  });
}

type ColumnCodeMapDuplicateNotice = {
  key: string; // 내부 key: name|option (option 없으면 name|)
  count: number;
  lastValue: string;
};

type ParseTwoColumnCodeMapResult = {
  map: ProductCodeMap;
  duplicates: ColumnCodeMapDuplicateNotice[];
};

function normalizeInternalCompositeKey(rawKey: string): string {
  let s = String(rawKey ?? '').trim();
  if (!s) return '|';

  // 사용자가 습관적으로 쓰는 "///" 또는 슬래시 구분자를 내부 "|"(name|option)로 통일
  s = s.replace(/\s*\/\/\/\s*/g, '|');

  // " / " 형태(예: 사과 / 대)도 내부 "|"로 환산 (문구가 아니라 데이터일 가능성이 높을 때만)
  if (!s.includes('|') && s.includes(' / ')) {
    const parts = s.split(' / ').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) s = `${parts[0]}|${parts[1]}`;
  }

  // "name/option" (공백 없는 슬래시)도 2파트일 때만 변환
  if (!s.includes('|') && s.includes('/') && !s.includes('http')) {
    const parts = s.split('/').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2) s = `${parts[0]}|${parts[1]}`;
  }

  // 내부 포맷은 항상 name|option 구조로 유지
  if (!s.includes('|')) s = `${s}|`;

  return s;
}

/** 엑셀 매핑 맵 → 모달 편집 행 변환값 (미리보기 적용과 동일한 조회 규칙) */
function lookupProductCodeForEditorRow(
  row: { key: string; displayKey: string },
  map: ProductCodeMap,
): string {
  const tryResolve = (name: string, option: string): string => {
    const code = resolveProductCodeFromMap(map, name, option);
    return code !== undefined && String(code).trim() !== ''
      ? String(code).trim()
      : '';
  };

  const idx = row.key.indexOf('|');
  let v = tryResolve(
    idx >= 0 ? row.key.slice(0, idx) : row.key,
    idx >= 0 ? row.key.slice(idx + 1) : '',
  );
  if (v) return v;

  const displayTrimmed = String(row.displayKey ?? '').trim();
  if (displayTrimmed.includes(' / ')) {
    const parts = displayTrimmed.split(' / ').map((p) => p.trim());
    v = tryResolve(parts[0] ?? '', parts[1] ?? '');
    if (v) return v;
    v = tryResolve(parts[0] ?? '', '');
    if (v) return v;
  }

  const strippedName = displayTrimmed.replace(/\s*\/\s*-\s*$/i, '').trim();
  if (strippedName && strippedName !== displayTrimmed) {
    v = tryResolve(strippedName, '');
    if (v) return v;
  }

  const nk = normalizeInternalCompositeKey(displayTrimmed);
  if (map[nk] !== undefined && String(map[nk]).trim() !== '') {
    return String(map[nk]).trim();
  }
  if (map[row.key] !== undefined && String(map[row.key]).trim() !== '') {
    return String(map[row.key]).trim();
  }

  return tryResolve(strippedName || displayTrimmed, '');
}

function lookupSimpleCodeForEditorRow(
  row: { key: string; displayKey: string },
  map: Record<string, string>,
): string {
  const rawKey = String(row.key ?? '').trim();
  if (map[rawKey] !== undefined && String(map[rawKey]).trim() !== '') {
    return String(map[rawKey]).trim();
  }
  const display = String(row.displayKey ?? '').trim();
  if (map[display] !== undefined && String(map[display]).trim() !== '') {
    return String(map[display]).trim();
  }
  const normalized = display.replace(/\s+/g, ' ');
  if (map[normalized] !== undefined && String(map[normalized]).trim() !== '') {
    return String(map[normalized]).trim();
  }
  return '';
}

async function parseTwoColumnKeyValueMapFromFile(
  file: File,
): Promise<ParseTwoColumnCodeMapResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstName];
  if (!sheet) return { map: {}, duplicates: [] };

  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  const rows = (matrix ?? []).map((r) =>
    (r ?? []).map((c) => String(c ?? '').trim()),
  );

  if (!rows.length) return { map: {}, duplicates: [] };

  // 첫 행이 템플릿 헤더(원본값/변환값)처럼 보이면 스킵
  let startIdx = 0;
  const k0 = String(rows[0]?.[0] ?? '').trim();
  const v0 = String(rows[0]?.[1] ?? '').trim();
  const looksLikeHeader =
    (/(원본|찾을|키|매핑키|상품명)/i.test(k0) && /(변환|바꿀|코드|매핑값|value)/i.test(v0)) ||
    ((k0.includes('원본') || k0 === '원본값') && (v0.includes('변환') || v0 === '변환값'));
  if (looksLikeHeader) startIdx = 1;

  const map: ProductCodeMap = {};
  const counts = new Map<string, { count: number; lastValue: string }>();

  for (let i = startIdx; i < rows.length; i++) {
    const keyRaw = String(rows[i]?.[0] ?? '').trim();
    const valRaw = String(rows[i]?.[1] ?? '').trim();
    if (!keyRaw) continue;

    const internalKey = normalizeInternalCompositeKey(keyRaw);
    map[internalKey] = valRaw; // last wins

    const prev = counts.get(internalKey);
    if (prev) counts.set(internalKey, { count: prev.count + 1, lastValue: valRaw });
    else counts.set(internalKey, { count: 1, lastValue: valRaw });
  }

  const duplicates: ColumnCodeMapDuplicateNotice[] = [];
  for (const [key, v] of counts.entries()) {
    if (v.count > 1) duplicates.push({ key, count: v.count, lastValue: v.lastValue });
  }
  // 안정적인 UI를 위해 키 기준 정렬(입력 순서는 필요하면 확장 가능)
  duplicates.sort((a, b) => a.key.localeCompare(b.key));

  return { map, duplicates };
}

type ParseSimpleKeyValueMapResult = {
  map: Record<string, string>;
  duplicates: Array<{
    key: string;
    count: number;
    lastValue: string;
  }>;
};

function normalizeSimpleKey(rawKey: string): string {
  return String(rawKey ?? '').trim();
}

/**
 * (고정 2열) 1열=원본값, 2열=변환값 을 simple 변환용 맵으로 파싱
 * - 헤더명은 무시(1행이 안내/헤더처럼 보이면 스킵)
 * - 중복 원본값은 마지막 값 우선
 */
async function parseTwoColumnSimpleKeyValueMapFromFile(
  file: File,
): Promise<ParseSimpleKeyValueMapResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstName];
  if (!sheet) return { map: {}, duplicates: [] };

  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
  }) as unknown[][];

  const rows = (matrix ?? []).map((r) =>
    (r ?? []).map((c) => String(c ?? '').trim()),
  );
  if (!rows.length) return { map: {}, duplicates: [] };

  let startIdx = 0;
  const k0 = String(rows[0]?.[0] ?? '').trim();
  const v0 = String(rows[0]?.[1] ?? '').trim();
  const looksLikeHeader =
    (/(원본|찾을|키|매핑키)/i.test(k0) && /(변환|바꿀|코드|매핑값|value)/i.test(v0)) ||
    ((k0.includes('원본') || k0 === '원본값') &&
      (v0.includes('변환') || v0.includes('변환값')));
  if (looksLikeHeader) startIdx = 1;

  const map: Record<string, string> = {};
  const counts = new Map<string, { count: number; lastValue: string }>();

  for (let i = startIdx; i < rows.length; i++) {
    const keyRaw = String(rows[i]?.[0] ?? '').trim();
    const valRaw = String(rows[i]?.[1] ?? '').trim();
    const val = String(valRaw ?? '').trim();
    if (!val) continue;
    // 원본 칸이 비어 있고 변환값만 있는 행: 미리보기 빈 셀에 적용
    if (keyRaw === '') {
      const key = '';
      map[key] = val; // last wins
      const prev = counts.get(key);
      if (prev)
        counts.set(key, { count: prev.count + 1, lastValue: val });
      else counts.set(key, { count: 1, lastValue: val });
      continue;
    }
    if (!keyRaw) continue;
    const key = normalizeSimpleKey(keyRaw);
    if (!key) continue;

    map[key] = val; // last wins

    const prev = counts.get(key);
    if (prev) counts.set(key, { count: prev.count + 1, lastValue: val });
    else counts.set(key, { count: 1, lastValue: val });
  }

  const duplicates = Array.from(counts.entries()).map(([key, v]) => ({
    key,
    count: v.count,
    lastValue: v.lastValue,
  }));
  duplicates.sort((a, b) => a.key.localeCompare(b.key));
  return { map, duplicates };
}

const isSenderColumn = (headerName: string): boolean => {
  const normalized = headerName.toLowerCase().trim();
  const senderKeywords = ['보내는사람', '송화인', '발송인', '출고자'];
  return senderKeywords.some((keyword) => normalized.includes(keyword));
};

function isDummyTemplateCell(cellValue: string | undefined): boolean {
  if (!cellValue || cellValue.trim() === '') {
    return false; // 빈 값은 더미가 아님
  }
  
  const value = cellValue.trim();
  const lowerValue = value.toLowerCase();
  
  // 문구 안내 패턴
  const examplePatterns = [
    /^예시[:\s]/i,           // "예시:", "예시 "
    /^예[:\s]/i,              // "예:", "예 "
    /^예\s*[:\-]/i,           // "예:", "예-"
    /^sample[:\s]/i,          // "Sample:", "Sample "
    /^example[:\s]/i,         // "Example:", "Example "
    /^\(예시\)/i,             // "(예시)"
    /^\(예\)/i,               // "(예)"
    /예시로\s/i,              // "예시로 "
    /예를\s*들면/i,           // "예를 들면"
  ];
  
  // 형식 예시 패턴
  const formatPatterns = [
    /^[0-9]{4}[-\/][0-9]{2}[-\/][0-9]{2}$/,  // YYYY-MM-DD, YYYY/MM/DD
    /^[0-9]{2,3}[-\s]?[0-9]{3,4}[-\s]?[0-9]{4}$/,  // 전화번호 형식 (010-1234-5678, 010 1234 5678)
    /^[0-9]{3}[-\s]?[0-9]{4}[-\s]?[0-9]{4}$/,      // 전화번호 형식 (010-0000-0000)
    /^[0-9]{2,3}-[0-9]{3,4}-[0-9]{4}$/,            // 전화번호 형식 (하이픈 포함)
    /^[가-힣]{2,4}시\s*[가-힣]{2,4}구/i,            // 주소 형식 예시
    /^[가-힣]+로\s*[0-9]+번지/i,                    // 주소 형식 예시
    /^[가-힣]+시\s*[가-힣]+구\s*[가-힣]+동/i,        // 주소 형식 예시
  ];
  
  // Placeholder 텍스트 패턴
  const placeholderPatterns = [
    /입력하세요/i,            // "입력하세요"
    /입력해주세요/i,          // "입력해주세요"
    /입력/i,                  // "입력"
    /여기에\s*입력/i,         // "여기에 입력"
    /이곳에\s*입력/i,         // "이곳에 입력"
    /^[-_]{2,}$/,             // "---", "___" 등
    /^\.{3,}$/,               // "..." 등
    /^\(.*\)$/,               // "( )" 형태의 안내 문구
    /^\[.*\]$/,               // "[ ]" 형태의 안내 문구
  ];
  
  // 일반적인 더미 텍스트 패턴
  const commonDummyPatterns = [
    /^홍길동/i,               // "홍길동", "홍길동님" 등
    /^김철수/i,               // "김철수" 등
    /^이영희/i,               // "이영희" 등
    /^010-0000-0000/i,        // 전화번호 더미
    /^010\s*0000\s*0000/i,     // 전화번호 더미 (공백 포함)
    /^상품명을\s*입력/i,      // "상품명을 입력"
    /^받는사람명을\s*입력/i,   // "받는사람명을 입력"
    /^주소를\s*입력/i,        // "주소를 입력"
    /^전화번호를\s*입력/i,     // "전화번호를 입력"
    /^수량을\s*입력/i,        // "수량을 입력"
    /^배송메시지를\s*입력/i,   // "배송메시지를 입력"
    /^요청사항을\s*입력/i,     // "요청사항을 입력"
  ];
  
  // 모든 패턴 확인
  const allPatterns = [
    ...examplePatterns,
    ...formatPatterns,
    ...placeholderPatterns,
    ...commonDummyPatterns,
  ];
  
  return allPatterns.some(pattern => pattern.test(value));
}

const isValidCourierTemplate = (template: CourierUploadTemplate | null): boolean => {
  if (template === null) return false;
  if (!Array.isArray(template.headers)) return false;
  if (template.headers.length === 0) return false;
  // name이 비어있지 않은 header가 1개 이상 있을 때만 true
  const nonEmptyHeaders = template.headers.filter(header => header.name && header.name.trim() !== '');
  return nonEmptyHeaders.length > 0;
};

/** 체험판(/trial): 기존 키 유지 · 본페이지: 로그인 시 계정별(logistics_*:userId) */
const TRIAL_LOGISTICS_TEMPLATE_KEY = 'trial_logistics_convert_onc_courier_template_v1';
const TRIAL_LOGISTICS_RECENT_KEY = 'trial_logistics_convert_recent_excel_formats_v1';
const TRIAL_LOGISTICS_BRIDGE_KEY = 'trial_logistics_activeCourierBridgeFile';
const TRIAL_LOGISTICS_FIXED_KEY = 'trial_logistics_convert_fixed_header_values_v1';
const DEFAULT_CJ_INTRO_SUPPRESS_KEY = LOGISTICS_DEFAULT_CJ_INTRO_SUPPRESS_KEY;

const loadCourierUploadTemplate = (
  trialMode: boolean,
  storageUserId: string | null,
): CourierUploadTemplate | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = trialMode
      ? localStorage.getItem(TRIAL_LOGISTICS_TEMPLATE_KEY)
      : readLocalStorageWithLegacyMigrate(LOGISTICS_MAIN_KEYS.template, storageUserId);
    if (stored) {
      const parsed = JSON.parse(stored) as CourierUploadTemplate;
      if (!isValidCourierTemplate(parsed)) {
        return null;
      }
      return parsed;
    }
  } catch (error) {
    console.error('localStorage에서 물류센터 양식 정보를 불러오는 중 오류 발생:', error);
  }
  return null;
};

const saveCourierUploadTemplate = (
  template: CourierUploadTemplate | null,
  trialMode: boolean,
  storageUserId: string | null,
) => {
  if (typeof window === 'undefined') return;
  try {
    if (trialMode) {
      if (template) {
        localStorage.setItem(TRIAL_LOGISTICS_TEMPLATE_KEY, JSON.stringify(template));
      } else {
        localStorage.removeItem(TRIAL_LOGISTICS_TEMPLATE_KEY);
      }
    } else if (template) {
      writeLocalStorageForUser(LOGISTICS_MAIN_KEYS.template, storageUserId, JSON.stringify(template));
    } else {
      removeLocalStorageForUser(LOGISTICS_MAIN_KEYS.template, storageUserId);
    }
  } catch (error) {
    console.error('localStorage에 물류센터 양식 정보를 저장하는 중 오류 발생:', error);
  }
};

const loadRecentExcelFormats = (trialMode: boolean, storageUserId: string | null): RecentExcelFormat[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = trialMode
      ? localStorage.getItem(TRIAL_LOGISTICS_RECENT_KEY)
      : readLocalStorageWithLegacyMigrate(LOGISTICS_MAIN_KEYS.recentFormats, storageUserId);
    if (stored) {
      const parsed = JSON.parse(stored) as RecentExcelFormat[];
      return parsed;
    }
  } catch (error) {
    console.error('localStorage에서 최근 사용 엑셀 양식을 불러오는 중 오류 발생:', error);
  }
  return [];
};

const persistLogisticsRecentFormats = (
  trialMode: boolean,
  storageUserId: string | null,
  formats: RecentExcelFormat[],
) => {
  if (trialMode) {
    localStorage.setItem(TRIAL_LOGISTICS_RECENT_KEY, JSON.stringify(formats));
  } else {
    writeLocalStorageForUser(LOGISTICS_MAIN_KEYS.recentFormats, storageUserId, JSON.stringify(formats));
  }
};

const saveRecentExcelFormat = (
  template: CourierUploadTemplate,
  setRecentExcelFormats: (formats: RecentExcelFormat[]) => void,
  trialMode: boolean,
  storageUserId: string | null,
  bridgeFile?: TemplateBridgeFile,
  displayName?: string,
  protectedFromDeletion?: boolean,
  formatId?: string,
) => {
  try {
    let formats = loadRecentExcelFormats(trialMode, trialMode ? null : storageUserId);
    const columnOrder = Array.isArray(template.headers) ? template.headers.map((header) => header.name) : [];

    if (formatId) {
      formats = formats.filter((format) => format.id !== formatId);
    }

    const newFormat: RecentExcelFormat = {
      id: formatId ?? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      columnOrder,
      bridgeFile,
      ...(displayName?.trim() ? { displayName: displayName.trim() } : {}),
      ...(protectedFromDeletion ? { protectedFromDeletion: true } : {}),
    };

    const updatedFormats = [newFormat, ...formats];
    persistLogisticsRecentFormats(trialMode, storageUserId, updatedFormats);
    setRecentExcelFormats(updatedFormats);
    return newFormat.id;
  } catch (error) {
    console.error('localStorage에 최근 사용 엑셀 양식을 저장하는 중 오류 발생:', error);
    return null;
  }
};

/** 체험판: 비로그인 사용자용 로컬 사용량 (sessionStorage, 탭 단위) */
const TRIAL_INITIAL_POINTS = 2000;
const TRIAL_POINTS_STORAGE_KEY = 'logistics_trial_points_v1';

/** 체험 텍스트 입력란 커서 추적 툴팁(줄바꿈은 globals `.ex-floating-tooltip` 의 pre-line) */
const TRIAL_TEXT_ORDER_TOOLTIP = [
  '카카오톡·문자·텍스트 주문을 복사한 뒤 붙여넣으면, 미리보기에서 항목별로 나뉘어 정리할 수 있습니다.',
  '',
  '〈복사 후 붙여넣기 예〉',
  '010-1234-5766  김철수  서울시 강남구 테헤란로123',
  '키보드 1개  문앞에 놓아주세요',
  '',
  '〈변환 후 예시〉',
  '받으시는분 : 김철수',
  '배송지 : 서울시 강남구 테헤란로123',
  '연락처 : 010-1234-5766',
  '상품 : 키보드',
  '수량 : 1개',
  '배송요청사항 : 문앞에 놓아주세요',
].join('\n');

function readTrialPointsFromStorage(): number {
  if (typeof window === 'undefined') return TRIAL_INITIAL_POINTS;
  try {
    const raw = sessionStorage.getItem(TRIAL_POINTS_STORAGE_KEY);
    if (raw === null) {
      sessionStorage.setItem(TRIAL_POINTS_STORAGE_KEY, String(TRIAL_INITIAL_POINTS));
      return TRIAL_INITIAL_POINTS;
    }
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) {
      sessionStorage.setItem(TRIAL_POINTS_STORAGE_KEY, String(TRIAL_INITIAL_POINTS));
      return TRIAL_INITIAL_POINTS;
    }
    return n;
  } catch {
    return TRIAL_INITIAL_POINTS;
  }
}

function writeTrialPointsToStorage(value: number): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(TRIAL_POINTS_STORAGE_KEY, String(Math.max(0, value)));
}

/** 체험 텍스트 변환 2,000(글자 수) 소진 후 안내 */
const TRIAL_TEXT_QUOTA_EXHAUSTED_MESSAGE =
  '무료체험 텍스트 변환 사용량(2,000)을 모두 사용했습니다. 이제 체험으로 텍스트 변환은 이용할 수 없습니다. 회원가입 후 계속 이용해 주세요.';

function formatTrialTextQuotaShortfall(remaining: number, textLength: number): string {
  if (remaining <= 0) return TRIAL_TEXT_QUOTA_EXHAUSTED_MESSAGE;
  return `무료체험 텍스트 변환 사용량이 부족합니다. (입력 ${textLength.toLocaleString('ko-KR')}자 · 잔여 ${remaining.toLocaleString('ko-KR')}자) 짧게 입력하거나 회원가입 후 이용해 주세요.`;
}

/** public 폴더의 체험용 기본 물류 업로드 양식 (등록 없이 미리보기 가능하도록) */
const TRIAL_DEFAULT_TEMPLATE_PUBLIC_PATH = '/trial-default-upload-template.xlsx';

export function LogisticsConvertClient({
  trialMode = false,
  landingEmbed = false,
}: {
  trialMode?: boolean;
  /** 홈 랜딩(/excload) 임베드 — 파란 테마·포털 모달 색상 통일 */
  landingEmbed?: boolean;
}) {
  const router = useRouter();
  const [isDesktopHoverDevice, setIsDesktopHoverDevice] = useState(false);
  const [floatingTooltip, setFloatingTooltip] = useState<{
    visible: boolean;
    text: string;
    x: number;
    y: number;
  }>({
    visible: false,
    text: '',
    x: 0,
    y: 0,
  });
  const user = useUserStore((state) => state.user);
  const isLoading = useUserStore((state) => state.isLoading);
  const userId = user?.userId ?? null;
  const { data: session, status: authStatus } = useSession();
  const templateStorageUserId =
    !trialMode && authStatus === 'authenticated' && session?.user?.id
      ? String(session.user.id)
      : userId;
  const templateScopeUserIds = useMemo(
    () => [templateStorageUserId, userId],
    [templateStorageUserId, userId],
  );
  const authAssetsReady = useAuthAssetsReady();
  const [workspaceStorageHydrated, setWorkspaceStorageHydrated] = useState(false);
  const [isPreviewSessionRestoring, setIsPreviewSessionRestoring] = useState(true);
  const previewSessionEnabled =
    !trialMode &&
    authAssetsReady &&
    workspaceStorageHydrated &&
    (authStatus === 'unauthenticated' || Boolean(userId));
  const isAccountScopedReady = trialMode
    ? workspaceStorageHydrated
    : authAssetsReady && workspaceStorageHydrated;
  const isFormStatusChecking = !workspaceStorageHydrated;
  const logisticsCourierHydratedRef = useRef(false);
  const defaultCjSeedAppliedRef = useRef(false);
  const prevLogisticsAccountBoundaryRef = useRef<string | undefined>(undefined);
  const fetchUser = useUserStore((state) => state.fetchUser);
  const updatePoints = useUserStore((state) => state.updatePoints);
  
  const [courierUploadTemplate, setCourierUploadTemplate] = useState<CourierUploadTemplate | null>(null);
  const [isCourierTemplateModalOpen, setIsCourierTemplateModalOpen] = useState(false);
  const [templateFileSessionId, setTemplateFileSessionId] = useState<string | null>(null);
  const [orderFileSessionId, setOrderFileSessionId] = useState<string | null>(null);

  const [recentExcelFormats, setRecentExcelFormats] = useState<RecentExcelFormat[]>([]);
  const [showRecentTemplate, setShowRecentTemplate] = useState(false);
  const [tempSelectedFormatId, setTempSelectedFormatId] = useState<string | null>(null);
  const [editingFormatId, setEditingFormatId] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState('');
  const [registrationSuccessMessage, setRegistrationSuccessMessage] = useState<string | null>(null);
  const [directMappingSampleFileModalOpen, setDirectMappingSampleFileModalOpen] = useState(false);
  const [isEmptyDataModalOpen, setIsEmptyDataModalOpen] = useState(false);
  const [isSenderModalOpen, setIsSenderModalOpen] = useState(false);
  const [settingsCheckOverlayOpen, setSettingsCheckOverlayOpen] = useState(false);
  const [isNoTemplateModalOpen, setIsNoTemplateModalOpen] = useState(false);
  const [noTemplateModalType, setNoTemplateModalType] = useState<'fixed-input' | 'convert'>('fixed-input');
  const [isTemplateOnboardingModalOpen, setIsTemplateOnboardingModalOpen] = useState(false);
  const [dontShowTemplateGuideForWeek, setDontShowTemplateGuideForWeek] = useState(false);
  const [dismissedTemplateGuideThisVisit, setDismissedTemplateGuideThisVisit] = useState(false);
  const [isTemplateChangeReuploadModalOpen, setIsTemplateChangeReuploadModalOpen] = useState(false);
  const templateModalBaselineFormatIdRef = useRef<string | null>(null);
  const hadOrderWorkBeforeTemplateModalRef = useRef(false);
  const [uploadedExcelFile, setUploadedExcelFile] = useState<File | null>(null);
  // 고정 입력 정보 설정 모달: 입력 모드 상태 (버튼 인덱스)
  const [editingHeaderIndex, setEditingHeaderIndex] = useState<number | null>(null);
  // 고정 입력 정보 설정 모달: 각 버튼의 입력값 (인덱스 -> 입력값)
  const [headerInputValues, setHeaderInputValues] = useState<Record<number, string>>({});
  // 고정 헤더 값: 물류센터 업로드 파일의 헤더명(key)에 고정값(value) 바인딩
  // ※ 데이터 적용 원칙: 주문 데이터에 보내는 사람 정보가 있으면 → 그 값 우선, 고정 입력 값은 fallback 용도, 주문 원본 데이터는 절대 수정하지 않음
  const [fixedHeaderValues, setFixedHeaderValues] = useState<Record<string, string>>({});
  const [currentFilePreviewData, setCurrentFilePreviewData] = useState<any[]>([]);
  const [orderStandardFile, setOrderStandardFile] = useState<any | null>(null);
  /** 미리보기 rowId → Stage2 표준 행 (고정입력 변경 시 Fill Only 재적용) */
  const [orderStandardRowsByRowId, setOrderStandardRowsByRowId] = useState<
    Record<string, Record<string, string>>
  >({});
  const fixedInputAtModalOpenRef = useRef<Record<string, string>>({});
  const [templateBridgeFile, setTemplateBridgeFile] = useState<TemplateBridgeFile | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRowWithId[]>([]);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPreviewResetModalOpen, setIsPreviewResetModalOpen] = useState(false);
  const [isBundleShippingModalOpen, setIsBundleShippingModalOpen] = useState(false);
  const [dismissedBundleGroupKeys, setDismissedBundleGroupKeys] = useState<string[]>([]);
  const [bundleShippingButtonAcked, setBundleShippingButtonAcked] = useState(false);
  type BundleShippingUndoSnapshot = {
    previewRows: PreviewRowWithId[];
    userOverrides: Record<string, Record<string, string>>;
    dismissedBundleGroupKeys: string[];
  };
  const [bundleApplyUndo, setBundleApplyUndo] = useState<{
    snapshot: BundleShippingUndoSnapshot;
    summary: BundleShippingApplySummary;
  } | null>(null);
  const [courierHeaders, setCourierHeaders] = useState<string[]>([]);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [sortConfig, setSortConfig] = useState<{
    header: string;
    direction: 'asc' | 'desc';
  } | null>(null);
  const [uploadedFileMeta, setUploadedFileMeta] = useState<
    { name: string; size: number }[]
  >([]);
  const [userOverrides, setUserOverrides] = useState<
    Record<string, Record<string, string>>
  >({});
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    header: string;
  } | null>(null);
  const [activeCell, setActiveCell] = useState<{
    rowId: string;
    header: string;
  } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [newRows, setNewRows] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  
  // 텍스트 물류 주문 변환용 상태
  const [textInput, setTextInput] = useState('');
  const [isProcessingTextImage, setIsProcessingTextImage] = useState(false);
  const [errorMessageTextImage, setErrorMessageTextImage] = useState<string | null>(null);
  const [qualityNoticeModal, setQualityNoticeModal] = useState<
    'hidden' | NormalizeQualityNoticeVariant
  >('hidden');
  const [textConvertReviewModal, setTextConvertReviewModal] = useState<{
    originalText: string;
    rows: TextConvertReviewRow[];
  } | null>(null);
  const [textConvertPointsPending, setTextConvertPointsPending] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showTextConvertModal, setShowTextConvertModal] = useState(false);
  const [dontShowToday, setDontShowToday] = useState(false);
  const [showScreenshotModal, setShowScreenshotModal] = useState(false);
  const [requiresAccountModalOpen, setRequiresAccountModalOpen] = useState(false);
  const [screenshotStage, setScreenshotStage] = useState<
    'idle' | 'processing' | 'completed'
  >('idle');

  /** 체험판 잔여 사용량 (클라이언트 마운트 후 sessionStorage와 동기화) */
  const [trialPoints, setTrialPoints] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(hover: hover) and (pointer: fine)');
    const syncDeviceType = () => setIsDesktopHoverDevice(media.matches);
    syncDeviceType();
    media.addEventListener('change', syncDeviceType);
    return () => {
      media.removeEventListener('change', syncDeviceType);
    };
  }, []);

  useEffect(() => {
    if (!trialMode || !isDesktopHoverDevice) {
      setFloatingTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest?.('[data-ex-tooltip]') as
        | HTMLElement
        | null;
      const tooltipRaw = target?.getAttribute('data-ex-tooltip') ?? '';
      const tooltipText = tooltipRaw.trim();

      if (!tooltipText) {
        setFloatingTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }

      const cursorGapX = 14;
      const cursorGapY = 18;
      const maxWidth = Math.min(420, Math.floor(window.innerWidth * 0.78));
      const viewportPadding = 12;
      const lineBreaks = tooltipRaw.includes('\n') ? tooltipRaw.split(/\n/).length : tooltipText.split(/\n/).length;
      const estimatedHeight = Math.min(360, Math.max(52, lineBreaks * 20 + 32));

      const nextX = Math.min(
        Math.max(viewportPadding, event.clientX + cursorGapX),
        window.innerWidth - maxWidth - viewportPadding,
      );
      const nextY = Math.min(
        Math.max(viewportPadding, event.clientY + cursorGapY),
        window.innerHeight - estimatedHeight - viewportPadding,
      );

      setFloatingTooltip({
        visible: true,
        text: tooltipText,
        x: nextX,
        y: nextY,
      });
    };

    const hideTooltip = () => {
      setFloatingTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('scroll', hideTooltip, { passive: true });
    window.addEventListener('blur', hideTooltip);
    window.addEventListener('mouseleave', hideTooltip as EventListener);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', hideTooltip);
      window.removeEventListener('blur', hideTooltip);
      window.removeEventListener('mouseleave', hideTooltip as EventListener);
    };
  }, [trialMode, isDesktopHoverDevice]);

  useEffect(() => {
    if (!trialMode) return;
    setTrialPoints(readTrialPointsFromStorage());
  }, [trialMode]);

  const trialRemainingTextQuota = trialMode
    ? (trialPoints ?? readTrialPointsFromStorage())
    : null;
  const isTrialTextConvertExhausted =
    trialMode && (trialRemainingTextQuota ?? 0) <= 0;

  // 사용자 정보 가져오기 (컴포넌트 마운트 시). 체험판은 비로그인 전제라 호출 시 401이 콘솔에 찍히므로 생략
  useEffect(() => {
    if (trialMode) return;
    fetchUser();
  }, [fetchUser, trialMode]);
  const [screenshotImagePreview, setScreenshotImagePreview] = useState<string | null>(null);
  const [showTextProcessingModal, setShowTextProcessingModal] = useState(false);
  const [textProcessingSource, setTextProcessingSource] = useState<'screenshot' | 'imageFile'>('screenshot');
  const [downloadModalFileName, setDownloadModalFileName] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "processing" | "done">("idle");
  /** 체험판: 다운로드 클릭 시 상세 안내 모달 */
  const [showTrialDownloadModal, setShowTrialDownloadModal] = useState(false);
  const [unknownHeadersWarning, setUnknownHeadersWarning] = useState<string[]>([]);
  const [unknownHeaderSamples, setUnknownHeaderSamples] = useState<UnknownHeaderSamples>({});
  const [unknownHeadersExpanded, setUnknownHeadersExpanded] = useState(false);
  const [directMappingModalOpen, setDirectMappingModalOpen] = useState(false);
  const [directMappingConfirmModalOpen, setDirectMappingConfirmModalOpen] = useState(false);
  const [directMappingPendingColumns, setDirectMappingPendingColumns] = useState<DirectMappingFinalColumn[]>([]);
  const [directMappingSourceHeaders, setDirectMappingSourceHeaders] = useState<string[]>([]);
  const [directMappingSourceSamples, setDirectMappingSourceSamples] = useState<UnknownHeaderSamples>({});
  const [directMappingRenameValues, setDirectMappingRenameValues] = useState<string[]>([]);
  const [directMappingOutputOrder, setDirectMappingOutputOrder] = useState<number[]>([]);
  const [directMappingCustomHeaders, setDirectMappingCustomHeaders] = useState<string[]>([]);
  const [directMappingCustomHeaderInputOpen, setDirectMappingCustomHeaderInputOpen] = useState(false);
  const [directMappingNewHeaderInput, setDirectMappingNewHeaderInput] = useState('');
  const [directMappingDraggingSourceIndex, setDirectMappingDraggingSourceIndex] = useState<number | null>(null);
  const [directMappingDragOverOrderIndex, setDirectMappingDragOverOrderIndex] = useState<number | null>(null);
  const [isDirectMappingRegistering, setIsDirectMappingRegistering] = useState(false);
  const directMappingSampleCleanInputRef = useRef<OrderPipelineStage2Input | null>(null);
  const [fileProcessingStatus, setFileProcessingStatus] = useState<"idle" | "processing" | "done">("idle");
  const [stage2ChunkLabel, setStage2ChunkLabel] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [processingDots, setProcessingDots] = useState("");
  const [textProcessingDots, setTextProcessingDots] = useState("");
  const [textConvertStatusLabel, setTextConvertStatusLabel] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  // 입력 방식 추적: 사용자가 어떤 방식으로 입력했는지 기록
  const [inputSourceType, setInputSourceType] = useState<'excel' | 'image' | 'text' | null>(null);
  const [sessionInputCounts, setSessionInputCounts] = useState<InputSourceCounts>(
    emptyInputSourceCounts
  );

  const recordWorkspaceInput = useCallback((kind: 'excel' | 'text' | 'image') => {
    setSessionInputCounts((prev) => incrementInputSource(prev, kind));
    setInputSourceType(kind);
  }, []);

  const clearWorkspaceInputTracking = useCallback(() => {
    setSessionInputCounts(emptyInputSourceCounts());
    setInputSourceType(null);
  }, []);

  /** 매핑 맵 — 자동 투영 없음, 사용자가 「상품명→상품코드 변환」 시에만 적용 */
  const [productCodeMap, setProductCodeMap] = useState<ProductCodeMap>({});
  const [productCodeFileName, setProductCodeFileName] = useState<string | null>(null);

  /** 3PL과 동일: 매핑 파일 목록·모달 */
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [recentMappingFormats, setRecentMappingFormats] = useState<LogisticsMappingFileFormat[]>([]);
  const [showRecentMapping, setShowRecentMapping] = useState(false);
  const [tempSelectedMappingId, setTempSelectedMappingId] = useState<string>('');
  const [mappingRegistrationMessage, setMappingRegistrationMessage] = useState<string | null>(null);
  const [mappingPreviewMode, setMappingPreviewMode] = useState<'vertical' | 'horizontal'>('vertical');
  const [isLogisticsMappingStorageHydrated, setIsLogisticsMappingStorageHydrated] = useState(false);
  const mappingInputRef = useRef<HTMLInputElement | null>(null);
  /** 매핑 실패 건이 있을 때 코드·바코드 열 안내 */
  const [productCodeMappingNotice, setProductCodeMappingNotice] =
    useState<ProductCodeMappingNotice | null>(null);
  /** 상품명→코드 변환 적용 여부(같은 버튼으로 변환 전 상품명 복원) */
  const [isProductCodeColumnShowingMappedCodes, setIsProductCodeColumnShowingMappedCodes] =
    useState(false);
  const productCodeCellBackupByRowIdRef = useRef<Map<string, string>>(new Map());

  /** 미리보기 코드매핑 모달 (물류 전용) */
  const [showColumnCodeMappingModal, setShowColumnCodeMappingModal] =
    useState(false);
  const [columnMappingStaging, setColumnMappingStaging] = useState<
    Record<string, LogisticsStagedColumnMapping>
  >({});
  const [columnMappingActiveHeader, setColumnMappingActiveHeader] = useState<
    string | null
  >(null);
  /** 헤더별 매핑 적용 전 셀 값(해당 헤더만 되돌리기) rowId → 문자열 */
  const [columnCodeMappingSnapshots, setColumnCodeMappingSnapshots] = useState<
    Record<string, Record<string, string>>
  >({});
  const columnMappingModalFileRef = useRef<HTMLInputElement | null>(null);
  const columnMappingPendingHeaderRef = useRef<string | null>(null);

  type ColumnCodeMappingEditorRow = {
    id: string; // UI에서 안정적으로 식별하기 위한 행 ID
    key: string; // 내부키: name|option
    displayKey: string; // UI 표시: name / option
    value: string; // 변환값(상품코드)
    /** true: +행 추가로 만든 행만 원본값 입력 가능 (기본 10칸·미리보기 유도 행은 읽기 전용) */
    manualRow: boolean;
  };

  const makeColumnCodeMappingEditorRowId = () =>
    `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const toProductDisplayKey = (internalKey: string) => {
    const idx = internalKey.indexOf('|');
    if (idx < 0) return internalKey;
    const name = internalKey.slice(0, idx);
    const option = internalKey.slice(idx + 1);
    return option ? `${name} / ${option}` : name;
  };

  const parseProductDisplayKeyToInternalKey = (displayKey: string) => {
    const trimmed = String(displayKey ?? '').trim();
    if (!trimmed) return '';

    // 사용자가 “상품명 / 옵션명” 또는 “상품명/옵션명” 형태로 입력했다고 가정
    const parts = trimmed
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean);

    const name = parts[0] ?? '';
    const option = parts.length >= 2 ? parts[1] : '';
    if (!name) return '';

    return normalizeInternalCompositeKey(`${name}|${option}`);
  };

  const DEFAULT_COLUMN_CODE_MAPPING_ROWS_COUNT = 10;

  const createEmptyEditorRows = (count: number): ColumnCodeMappingEditorRow[] =>
    Array.from({ length: count }).map(() => ({
      id: makeColumnCodeMappingEditorRowId(),
      key: '',
      displayKey: '',
      value: '',
      manualRow: false,
    }));

  const createRowsFromProductCodeMap = (
    map: ProductCodeMap,
    maxCount: number,
  ): ColumnCodeMappingEditorRow[] =>
    Object.entries(map)
      .slice(0, maxCount)
      .map(([k, v]) => ({
        id: makeColumnCodeMappingEditorRowId(),
        key: k,
        displayKey: toProductDisplayKey(k),
        value: String(v ?? ''),
        manualRow: false,
      }));

  // (헤더별) 고정 2열 편집기: 원본값 / 변환값
  const [columnCodeMappingEditorRows, setColumnCodeMappingEditorRows] = useState<
    ColumnCodeMappingEditorRow[]
  >([]);
  const [columnCodeMappingEditorMap, setColumnCodeMappingEditorMap] = useState<
    ProductCodeMap
  >({});

  const [columnCodeMappingEditorMode, setColumnCodeMappingEditorMode] = useState<
    'product' | 'simple'
  >('product');

  const [columnCodeMappingEditorSimpleMap, setColumnCodeMappingEditorSimpleMap] =
    useState<Record<string, string>>({});

  // 업로드 파일 내 중복 원본키 경고(최대 5개 표시)
  const [columnCodeMappingDuplicatePopup, setColumnCodeMappingDuplicatePopup] = useState<{
    items: Array<{
      key: string;
      displayKey: string;
      count: number;
      lastValue: string;
    }>;
    moreCount: number;
  } | null>(null);

  const [columnCodeMappingSavedMessage, setColumnCodeMappingSavedMessage] = useState<string | null>(null);
  const [columnCodeMappingModalView, setColumnCodeMappingModalView] = useState<
    'editor' | 'excelGuide'
  >('editor');
  const [columnAutoApplyByHeader, setColumnAutoApplyByHeader] = useState<
    Record<string, ColumnAutoApplyEntry>
  >({});

  useEffect(() => {
    setColumnAutoApplyByHeader(loadColumnAutoApplyByUser(userId));
  }, [userId]);

  const closeColumnCodeMappingModal = useCallback(() => {
    setShowColumnCodeMappingModal(false);
    setColumnCodeMappingModalView('editor');
    setColumnMappingActiveHeader(null);
    setColumnMappingStaging({});
    setColumnCodeMappingEditorRows([]);
    setColumnCodeMappingEditorMap({});
    setColumnCodeMappingEditorSimpleMap({});
    setColumnCodeMappingEditorMode('product');
    setColumnCodeMappingDuplicatePopup(null);
    setColumnCodeMappingSavedMessage(null);
    columnMappingPendingHeaderRef.current = null;
  }, []);

  const isActiveHeaderAutoApplyEnabled = Boolean(
    columnMappingActiveHeader &&
      columnAutoApplyByHeader[columnMappingActiveHeader]?.enabled,
  );

  const prependPreviewRowsWithAutoMapping = useCallback(
    (
      newRows: PreviewRowWithId[],
      headers: string[],
      existing: PreviewRowWithId[],
    ): PreviewRowWithId[] => {
      const combined = [...newRows, ...existing];
      const { rows, newSnapshots } = computeAutoColumnMappingApply(
        combined,
        headers,
        userId,
      );
      if (Object.keys(newSnapshots).length > 0) {
        setColumnCodeMappingSnapshots((prevSnap) => {
          const next = { ...prevSnap };
          for (const [h, snap] of Object.entries(newSnapshots)) {
            if (next[h]) continue;
            next[h] = snap;
          }
          return next;
        });
      }
      return rows;
    },
    [userId],
  );

  // 혹시 모달 진입 시 editorRows가 비어있는 케이스가 생기면,
  // 항상 최소 10칸을 보여주도록 안전장치 추가합니다.
  useEffect(() => {
    if (!showColumnCodeMappingModal) return;
    if (columnCodeMappingEditorRows.length > 0) return;
    setColumnCodeMappingEditorRows(
      createEmptyEditorRows(DEFAULT_COLUMN_CODE_MAPPING_ROWS_COUNT),
    );
  }, [showColumnCodeMappingModal, columnCodeMappingEditorRows.length]);

  const resetProductCodeColumnToggle = useCallback(() => {
    setIsProductCodeColumnShowingMappedCodes(false);
    productCodeCellBackupByRowIdRef.current = new Map();
  }, []);

  const selectedMappingFormat = useMemo(
    () => recentMappingFormats.find((f) => f.id === tempSelectedMappingId) ?? null,
    [recentMappingFormats, tempSelectedMappingId],
  );
  const selectedMappingSummary = useMemo(
    () =>
      selectedMappingFormat?.rows
        .slice(1)
        .map((row) => row.filter((c) => String(c).trim() !== '').join(' / '))
        .filter((s) => s !== '')
        .join(' · ') ?? '',
    [selectedMappingFormat],
  );

  const courierFileInputRef = useRef<HTMLInputElement | null>(null);
  const excelFileInputRef = useRef<HTMLInputElement | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  /** 텍스트 변환 중복 클릭·사용량 차감 이중 호출 방지 */
  const textConvertInFlightRef = useRef(false);
  /** 이미지 OCR 직후 같은 텍스트로 변환 시 텍스트 입력 중복 집계 방지 (수동 편집 시 해제) */
  const pendingImageOcrTextConvertRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const screenshotPasteAreaRef = useRef<HTMLDivElement | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const fileProcessingTokenRef = useRef(0);

  const needsAccount = !trialMode && !user && !isLoading;

  const clearUploadedExcelForUnlock = useCallback(() => {
    setUploadedExcelFile(null);
    setFileProcessingStatus('idle');
    setStage2ChunkLabel(null);
  }, []);
  const { unlockExcelFile, excelUnlockUi } = useExcelFileUnlock({
    onUploadCancel: clearUploadedExcelForUnlock,
  });

  const ensureLoggedInForOrderInput = useCallback((): boolean => {
    if (trialMode) return true;
    if (isAccountScopedReady && user) return true;
    if (isLoading || (authStatus === 'authenticated' && !isAccountScopedReady)) {
      setSettingsCheckOverlayOpen(true);
      return false;
    }
    setRequiresAccountModalOpen(true);
    return false;
  }, [trialMode, user, isLoading, authStatus, isAccountScopedReady]);

  useEffect(() => {
    if (isAccountScopedReady) {
      setSettingsCheckOverlayOpen(false);
    }
  }, [isAccountScopedReady]);

  const ensureCourierTemplateReady = useCallback(
    (modalType: 'fixed-input' | 'convert'): boolean => {
      if (!isAccountScopedReady) {
        setSettingsCheckOverlayOpen(true);
        return false;
      }
      setSettingsCheckOverlayOpen(false);
      if (!isValidCourierTemplate(courierUploadTemplate)) {
        setNoTemplateModalType(modalType);
        setIsNoTemplateModalOpen(true);
        return false;
      }
      return true;
    },
    [isAccountScopedReady, courierUploadTemplate],
  );

  const resetBundleShippingUi = useCallback(() => {
    setIsBundleShippingModalOpen(false);
    setDismissedBundleGroupKeys([]);
    setBundleShippingButtonAcked(false);
    setBundleApplyUndo(null);
  }, []);

  /** 다운로드 완료 후와 동일 — 미리보기·입력 소스·파일 선택 상태만 정리 (양식/브릿지는 유지) */
  const applyPreviewWorkspaceReset = useCallback(() => {
    clearPreviewWorkspace('logistics-convert', userId);
    void clearWorkspaceFiles('logistics-convert', userId);
    resetBundleShippingUi();
    setPreviewRows([]);
    setOrderStandardRowsByRowId({});
    resetProductCodeColumnToggle();
    setUserOverrides({});
    setSortConfig(null);
    setUnknownHeadersWarning([]);
    setUnknownHeaderSamples({});
    setDirectMappingModalOpen(false);
    setDirectMappingConfirmModalOpen(false);
    setDirectMappingPendingColumns([]);
    setDirectMappingSourceHeaders([]);
    setDirectMappingSourceSamples({});
    setDirectMappingRenameValues([]);
    setDirectMappingOutputOrder([]);
    setDirectMappingCustomHeaders([]);
    setDirectMappingCustomHeaderInputOpen(false);
    setDirectMappingNewHeaderInput('');
    setDirectMappingDraggingSourceIndex(null);
    setDirectMappingDragOverOrderIndex(null);
    setSelectedFileName(null);
    setColumnCodeMappingSnapshots({});
    setColumnMappingStaging({});
    setShowColumnCodeMappingModal(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (excelFileInputRef.current) {
      excelFileInputRef.current.value = '';
    }
    if (courierFileInputRef.current) {
      courierFileInputRef.current.value = '';
    }
    setSelectedFiles([]);
    setUploadedExcelFile(null);
    setUploadedFileMeta([]);
    clearWorkspaceInputTracking();
    setSelectedImage(null);
  }, [resetBundleShippingUi, resetProductCodeColumnToggle, clearWorkspaceInputTracking, userId]);

  /** 미리보기·입력 소스·변환 결과 비우기 (양식·브릿지·고정값은 유지). 확인 모달 후 실행 */
  const applyFullPreviewWorkspaceReset = useCallback(() => {
    applyPreviewWorkspaceReset();
    setCourierHeaders([]);
    setSelectedRows([]);
    setProductCodeMappingNotice(null);
    setNewRows(new Set());
    setEditingCell(null);
    setActiveCell(null);
    setImagePreview(null);
    setScreenshotImagePreview(null);
    setTextInput('');
    setScreenshotStage('idle');
    setErrorMessageTextImage(null);
    setCurrentFilePreviewData([]);
    setOrderStandardFile(null);
    setFileProcessingStatus('idle');
    setStage2ChunkLabel(null);
    setShowScreenshotModal(false);
    setShowTextProcessingModal(false);
    setIsPreviewResetModalOpen(false);
  }, [applyPreviewWorkspaceReset]);

  // 고정 헤더 순서 배열 (courierUploadTemplate.headers 기준)
  const FIXED_HEADER_ORDER = useMemo(() => {
    if (courierUploadTemplate && Array.isArray(courierUploadTemplate.headers) && courierUploadTemplate.headers.length > 0) {
      return courierUploadTemplate.headers.map(header => header.name);
    }
    return [];
  }, [courierUploadTemplate]);

  // 정렬은 대용량일 때 Worker로 오프로드
  const sortedRows = useWorkerSortedRows(previewRows, sortConfig, userOverrides);

  // 미리보기 초기 노출량 (대용량에서 첫 화면 체감 개선)
  const PREVIEW_BATCH_SIZE = 100;
  const [renderedRowCount, setRenderedRowCount] = useState(0);
  const VIRTUAL_ROW_HEIGHT = 30;
  const VIRTUAL_OVERSCAN = 8;
  const [previewScrollTop, setPreviewScrollTop] = useState(0);
  const [previewViewportHeight, setPreviewViewportHeight] = useState(260);
  const displayRows = useMemo(
    () => sortedRows.slice(0, renderedRowCount),
    [sortedRows, renderedRowCount],
  );
  const visibleRowCount = Math.max(
    1,
    Math.ceil(previewViewportHeight / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2,
  );
  const virtualStartIndex = Math.min(
    Math.max(0, displayRows.length - visibleRowCount),
    Math.max(0, Math.floor(previewScrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN),
  );
  const virtualEndIndex = Math.min(displayRows.length, virtualStartIndex + visibleRowCount);
  const virtualRows = useMemo(
    () => displayRows.slice(virtualStartIndex, virtualEndIndex),
    [displayRows, virtualStartIndex, virtualEndIndex],
  );
  const virtualTopSpacerHeight = virtualStartIndex * VIRTUAL_ROW_HEIGHT;
  const virtualBottomSpacerHeight =
    (displayRows.length - virtualEndIndex) * VIRTUAL_ROW_HEIGHT;

  useEffect(() => {
    const totalRows = previewRows.length;
    if (totalRows === 0 || courierHeaders.length === 0) {
      setRenderedRowCount(0);
      return;
    }

    if (isPreviewExpanded) {
      setRenderedRowCount(totalRows);
      return;
    }

    // renderedRowCount 의존성 금지: '추가 조회' 후 effect가 초기 배치(100건)로 리셋되는 것 방지
    setRenderedRowCount((prev) => {
      if (prev >= totalRows) return totalRows;
      // 누적 업로드 시 100건 이하 구간은 자동으로 표시 건수를 확장한다.
      // (예: 5건 이후 10건 추가 -> 15건 표시, 5건 이후 100건 추가 -> 100건 표시)
      if (prev >= PREVIEW_BATCH_SIZE) return Math.min(prev, totalRows);
      return Math.min(PREVIEW_BATCH_SIZE, totalRows);
    });
  }, [previewRows.length, courierHeaders.length, isPreviewExpanded]);

  const hasMorePreviewRows = sortedRows.length > renderedRowCount;

  const bundleShippingDetection = useMemo(
    () => detectBundleShippingGroups(previewRows, courierHeaders, templateBridgeFile, userOverrides),
    [previewRows, courierHeaders, templateBridgeFile, userOverrides],
  );

  const activeBundleShippingGroups = useMemo(
    () =>
      bundleShippingDetection.groups.filter((g) => !dismissedBundleGroupKeys.includes(g.key)),
    [bundleShippingDetection.groups, dismissedBundleGroupKeys],
  );

  const bundleShippingGroupCount = activeBundleShippingGroups.length;
  const bundleShippingRowCount = countBundleShippingDuplicateRows(activeBundleShippingGroups);

  const activeBundleGroupKeysSig = useMemo(
    () => activeBundleShippingGroups.map((g) => g.key).sort().join('\u0001'),
    [activeBundleShippingGroups],
  );

  useEffect(() => {
    if (bundleShippingGroupCount > 0) {
      setBundleShippingButtonAcked(false);
    }
  }, [activeBundleGroupKeysSig, bundleShippingGroupCount]);

  const clonePreviewRows = (rows: PreviewRowWithId[]) =>
    rows.map((r) => ({ rowId: r.rowId, data: { ...r.data } }));

  const handleBundleShippingApply = useCallback(
    (payload: BundleShippingApplyPayload) => {
      setBundleApplyUndo({
        snapshot: {
          previewRows: clonePreviewRows(previewRows),
          userOverrides: structuredClone(userOverrides),
          dismissedBundleGroupKeys: [...dismissedBundleGroupKeys],
        },
        summary: payload.summary,
      });

      const deletedSet = new Set(payload.deletedRowIds);
      setPreviewRows((prev) => prev.filter((row) => !deletedSet.has(row.rowId)));
      setOrderStandardRowsByRowId((prev) =>
        pruneOrderSnapshotsForRowIds(prev, deletedSet),
      );
      setUserOverrides((prev) => {
        const next = { ...prev };
        for (const id of payload.deletedRowIds) {
          delete next[id];
        }
        for (const [rowId, cols] of Object.entries(payload.overrides)) {
          if (deletedSet.has(rowId)) continue;
          next[rowId] = { ...(next[rowId] ?? {}), ...cols };
        }
        return next;
      });
      setSelectedRows((prev) => prev.filter((id) => !deletedSet.has(id)));
      if (payload.ignoredGroupKeys.length > 0) {
        setDismissedBundleGroupKeys((prev) => {
          const merged = new Set([...prev, ...payload.ignoredGroupKeys]);
          return [...merged];
        });
      }
      setBundleShippingButtonAcked(true);
    },
    [previewRows, userOverrides, dismissedBundleGroupKeys],
  );

  const handleUndoBundleShippingApply = useCallback(() => {
    if (!bundleApplyUndo) return;
    const { snapshot } = bundleApplyUndo;
    setPreviewRows(snapshot.previewRows);
    setUserOverrides(snapshot.userOverrides);
    setDismissedBundleGroupKeys(snapshot.dismissedBundleGroupKeys);
    setSelectedRows([]);
    setBundleApplyUndo(null);
    setBundleShippingButtonAcked(false);
  }, [bundleApplyUndo]);

  const handlePreviewScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    setPreviewScrollTop(e.currentTarget.scrollTop);
  }, []);

  useEffect(() => {
    const node = previewScrollContainerRef.current;
    if (!node) return;

    const syncViewport = () => {
      setPreviewViewportHeight(node.clientHeight || 260);
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, [isPreviewExpanded, displayRows.length, courierHeaders.length, trialMode]);

  const commitCellEdit = (rowId: string, header: string, value: string) => {
    setUserOverrides(prev => ({
      ...prev,
      [rowId]: {
        ...prev[rowId],
        [header]: value,
      },
    }));
  };

  // 물류 택배 양식·최근 양식·고정값·bridge — 체험은 기존 키, 본페이지는 계정별 (본페이지는 세션·유저 조회 확정 후에만 hydrate)
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    if (trialMode) {
      setWorkspaceStorageHydrated(false);
      logisticsCourierHydratedRef.current = false;
      setCourierUploadTemplate(loadCourierUploadTemplate(true, null));
      setRecentExcelFormats(loadRecentExcelFormats(true, null));
      try {
        const raw = localStorage.getItem(TRIAL_LOGISTICS_FIXED_KEY);
        setFixedHeaderValues(raw ? JSON.parse(raw) : {});
      } catch {
        setFixedHeaderValues({});
      }
      try {
        const saved = localStorage.getItem(TRIAL_LOGISTICS_BRIDGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as TemplateBridgeFile;
          const pcccIndex =
            parsed?.courierHeaders?.findIndex((h) =>
              /개인통관번호|PCCC/i.test(String(h ?? '')),
            ) ?? -1;
          const pcccMapped =
            pcccIndex >= 0 ? parsed?.mappedBaseHeaders?.[pcccIndex] : null;
          const needsPcccMigration = pcccIndex >= 0 && pcccMapped !== '개인통관번호';

          if (needsPcccMigration) {
            localStorage.removeItem(TRIAL_LOGISTICS_BRIDGE_KEY);
            setTemplateBridgeFile(null);
          } else {
            const activeTemplate = loadCourierUploadTemplate(true, null);
            const columnOrder =
              activeTemplate?.headers
                ?.filter((h) => h.name?.trim())
                .map((h) => h.name) ?? parsed.courierHeaders ?? [];
            const repaired = repairTrialBridgeFileIfNeeded(columnOrder, parsed);
            setTemplateBridgeFile(repaired);
            localStorage.setItem(TRIAL_LOGISTICS_BRIDGE_KEY, JSON.stringify(repaired));
          }
        } else {
          setTemplateBridgeFile(null);
        }
      } catch (error) {
        console.error('localStorage에서 bridgeFile을 불러오는 중 오류 발생:', error);
      }
      prevLogisticsAccountBoundaryRef.current = '__trial__';
      logisticsCourierHydratedRef.current = true;
      setWorkspaceStorageHydrated(true);
      return;
    }

    if (!authAssetsReady) {
      setWorkspaceStorageHydrated(false);
      logisticsCourierHydratedRef.current = false;
      return;
    }

    const boundaryKey = userId ?? '__guest__';
    const guestToUserLogin =
      prevLogisticsAccountBoundaryRef.current === '__guest__' && boundaryKey !== '__guest__';
    if (
      prevLogisticsAccountBoundaryRef.current !== undefined &&
      prevLogisticsAccountBoundaryRef.current !== boundaryKey
    ) {
      const prevScopeUserId =
        prevLogisticsAccountBoundaryRef.current === '__guest__' ||
        prevLogisticsAccountBoundaryRef.current === '__trial__'
          ? null
          : prevLogisticsAccountBoundaryRef.current;
      if (guestToUserLogin && userId) {
        migratePreviewWorkspaceGuestToUser('logistics-convert', userId);
        clearPreviewWorkspace('logistics-convert', null);
      } else {
        clearAllPreviewWorkspacesForScope(prevScopeUserId);
        void clearWorkspaceFiles('logistics-convert', prevScopeUserId);
      }
      if (!guestToUserLogin) {
      isCancelledRef.current = true;
      setPreviewRows([]);
      setOrderStandardRowsByRowId({});
      setCourierHeaders([]);
      setOrderStandardFile(null);
      setTemplateBridgeFile(null);
      setUploadedExcelFile(null);
      setSelectedFiles([]);
      setUploadedFileMeta([]);
      setUserOverrides({});
      resetBundleShippingUi();
      setSelectedRows([]);
      setNewRows(new Set());
      setEditingCell(null);
      setActiveCell(null);
      setEditingValue('');
      setSortConfig(null);
      setUnknownHeadersWarning([]);
      setUnknownHeaderSamples({});
      setFileProcessingStatus('idle');
      setStage2ChunkLabel(null);
      setSelectedFileName(null);
      setDownloadStatus('idle');
      setDownloadModalFileName(null);
      clearWorkspaceInputTracking();
      setTemplateFileSessionId(null);
      setOrderFileSessionId(null);
      setCurrentFilePreviewData([]);
      setIsPreviewExpanded(false);
      setRenderedRowCount(0);
      setPreviewScrollTop(0);
      setTextInput('');
      setSelectedImage(null);
      setImagePreview(null);
      setScreenshotImagePreview(null);
      setErrorMessageTextImage(null);
      setIsProcessingTextImage(false);
      setScreenshotStage('idle');
      setShowTextProcessingModal(false);
      setShowScreenshotModal(false);
      setQualityNoticeModal('hidden');
      setIsDragging(false);
      }
    }
    prevLogisticsAccountBoundaryRef.current = boundaryKey;

    logisticsCourierHydratedRef.current = false;
    try {
      let loadedTemplate = loadCourierUploadTemplate(false, userId);
      if (
        !trialMode &&
        loadedTemplate &&
        isActiveDefaultCjTemplate(loadedTemplate) &&
        isDefaultCjAutoSeedOptOutForUserIds(templateScopeUserIds, LOGISTICS_DEFAULT_CJ_OPT_OUT_KEY)
      ) {
        for (const uid of templateScopeUserIds) {
          saveCourierUploadTemplate(null, false, uid);
          removeLocalStorageForUser(LOGISTICS_MAIN_KEYS.bridge, uid);
        }
        loadedTemplate = null;
      }
      setCourierUploadTemplate(loadedTemplate);
      setRecentExcelFormats(loadRecentExcelFormats(false, userId));
      try {
        const rawFixed = readLocalStorageWithLegacyMigrate(LOGISTICS_MAIN_KEYS.fixedHeaders, userId);
        setFixedHeaderValues(rawFixed ? JSON.parse(rawFixed) : {});
      } catch {
        setFixedHeaderValues({});
      }

      const saved = readLocalStorageWithLegacyMigrate(LOGISTICS_MAIN_KEYS.bridge, userId);
      if (saved) {
        const parsed = JSON.parse(saved) as TemplateBridgeFile;
        const pcccIndex =
          parsed?.courierHeaders?.findIndex((h) =>
            /개인통관번호|PCCC/i.test(String(h ?? '')),
          ) ?? -1;
        const pcccMapped =
          pcccIndex >= 0 ? parsed?.mappedBaseHeaders?.[pcccIndex] : null;
        const needsPcccMigration = pcccIndex >= 0 && pcccMapped !== '개인통관번호';

        if (needsPcccMigration) {
          removeLocalStorageForUser(LOGISTICS_MAIN_KEYS.bridge, userId);
          setTemplateBridgeFile(null);
        } else {
          setTemplateBridgeFile(parsed);
        }
      } else {
        setTemplateBridgeFile(null);
      }
    } catch (error) {
      console.error('[logistics] 저장소 복원 오류:', error);
    }
    isCancelledRef.current = false;
    logisticsCourierHydratedRef.current = true;
    setWorkspaceStorageHydrated(true);
  }, [trialMode, authAssetsReady, userId, templateScopeUserIds]);

  const activeTemplateHeaderNames = useMemo(() => {
    if (!isValidCourierTemplate(courierUploadTemplate) || !courierUploadTemplate) {
      return null;
    }
    return courierUploadTemplate.headers
      .filter((header) => !header.isEmpty && header.name.trim() !== '')
      .map((header) => header.name);
  }, [courierUploadTemplate]);

  const isUsingDefaultCjTemplate = useMemo(
    () => !trialMode && isActiveDefaultCjTemplate(courierUploadTemplate),
    [trialMode, courierUploadTemplate],
  );

  useEffect(() => {
    defaultCjSeedAppliedRef.current = false;
  }, [userId, trialMode]);

  /** 본페이지: 양식 미등록 시 CJ 12열 기본 양식 자동 등록 */
  useEffect(() => {
    if (trialMode || !authAssetsReady || !workspaceStorageHydrated) return;

    const storedTemplate = loadCourierUploadTemplate(false, userId);
    const scopeOptOut = isDefaultCjAutoSeedOptOutForUserIds(
      templateScopeUserIds,
      LOGISTICS_DEFAULT_CJ_OPT_OUT_KEY,
    );

    if (isValidCourierTemplate(storedTemplate)) {
      if (isActiveDefaultCjTemplate(storedTemplate) && scopeOptOut) {
        for (const uid of templateScopeUserIds) {
          saveCourierUploadTemplate(null, false, uid);
          removeLocalStorageForUser(LOGISTICS_MAIN_KEYS.bridge, uid);
        }
        setCourierUploadTemplate(null);
        setTemplateBridgeFile(null);
        return;
      }

      if (isActiveDefaultCjTemplate(storedTemplate) && !scopeOptOut) {
        const formats = loadRecentExcelFormats(false, userId);
        const hasDefaultEntry = formats.some((format) => isDefaultCjSeedFormatId(format.id));
        if (!hasDefaultEntry) {
          const seed = buildDefaultCjCourierSeed();
          const updatedFormats = [
            seed.recentFormat,
            ...formats.filter((format) => format.id !== DEFAULT_CJ_FORMAT_ID),
          ];
          persistLogisticsRecentFormats(false, userId, updatedFormats);
          setRecentExcelFormats(updatedFormats);
        }
      }
      return;
    }

    if (scopeOptOut) {
      return;
    }

    if (defaultCjSeedAppliedRef.current) return;
    defaultCjSeedAppliedRef.current = true;

    const seed = buildDefaultCjCourierSeed();
    saveCourierUploadTemplate(seed.template, false, userId);
    writeLocalStorageForUser(
      LOGISTICS_MAIN_KEYS.bridge,
      userId,
      JSON.stringify(seed.bridgeFile),
    );

    const updatedFormats = [
      seed.recentFormat,
      ...loadRecentExcelFormats(false, userId).filter(
        (format) => format.id !== DEFAULT_CJ_FORMAT_ID,
      ),
    ];
    persistLogisticsRecentFormats(false, userId, updatedFormats);

    setCourierUploadTemplate(seed.template);
    setTemplateBridgeFile(seed.bridgeFile);
    setRecentExcelFormats(updatedFormats);
    setTempSelectedFormatId(DEFAULT_CJ_FORMAT_ID);
  }, [trialMode, authAssetsReady, workspaceStorageHydrated, userId, templateScopeUserIds]);

  const handleLogisticsPreviewSessionRestored = useCallback(() => {
    setFileProcessingStatus('done');
  }, []);

  const handleLogisticsTemplateBridgeChanged = useCallback(() => {
    setPreviewRows([]);
    setOrderStandardRowsByRowId({});
    setCourierHeaders([]);
    resetProductCodeColumnToggle();
    setColumnCodeMappingSnapshots({});
    setColumnMappingStaging({});
    setShowColumnCodeMappingModal(false);
  }, [resetProductCodeColumnToggle]);

  const getFallbackCourierHeaders = useCallback((): string[] => {
    if (templateBridgeFile?.courierHeaders?.length) {
      return templateBridgeFile.courierHeaders;
    }
    if (typeof window === 'undefined') return [];
    try {
      const saved = readLocalStorageWithLegacyMigrate(LOGISTICS_MAIN_KEYS.bridge, userId);
      if (!saved) return [];
      const parsed = JSON.parse(saved) as TemplateBridgeFile;
      return Array.isArray(parsed.courierHeaders) ? parsed.courierHeaders : [];
    } catch {
      return [];
    }
  }, [templateBridgeFile, userId]);

  const getActiveTemplateBridgeFile = useCallback((): TemplateBridgeFile | null => {
    if (templateBridgeFile?.courierHeaders?.length) {
      return templateBridgeFile;
    }
    if (typeof window === 'undefined') return null;
    try {
      const saved = trialMode
        ? localStorage.getItem(TRIAL_LOGISTICS_BRIDGE_KEY)
        : readLocalStorageWithLegacyMigrate(LOGISTICS_MAIN_KEYS.bridge, userId);
      if (!saved) return null;
      const parsed = JSON.parse(saved) as TemplateBridgeFile;
      return Array.isArray(parsed.courierHeaders) && parsed.courierHeaders.length > 0
        ? parsed
        : null;
    } catch {
      return null;
    }
  }, [templateBridgeFile, trialMode, userId]);

  useEffect(() => {
    if (trialMode) {
      setIsPreviewSessionRestoring(false);
      return;
    }
    if (previewSessionEnabled || !authAssetsReady || !workspaceStorageHydrated) return;
    if (authStatus === 'loading') return;
    setIsPreviewSessionRestoring(false);
  }, [trialMode, previewSessionEnabled, authAssetsReady, workspaceStorageHydrated, authStatus]);

  useEffect(() => {
    if (!previewSessionEnabled) return;
    if (previewRows.length > 0 && courierHeaders.length === 0) {
      const headers = getFallbackCourierHeaders();
      if (headers.length > 0) {
        setCourierHeaders(headers);
      }
    }
  }, [
    previewSessionEnabled,
    previewRows.length,
    courierHeaders.length,
    getFallbackCourierHeaders,
    templateBridgeFile,
  ]);

  usePreviewWorkspaceSession({
    pageKey: 'logistics-convert',
    enabled: previewSessionEnabled,
    storageUserId: userId,
    previewRows,
    userOverrides,
    courierHeaders,
    sortConfig,
    setPreviewRows,
    setUserOverrides,
    setCourierHeaders,
    setSortConfig,
    getFallbackCourierHeaders,
    fallbackCourierHeaders: templateBridgeFile?.courierHeaders ?? [],
    selectedFileName,
    uploadedFileMeta: uploadedFileMeta.map((m) => ({
      name: m.name,
      size: m.size,
      lastModified: 0,
      type: '',
    })),
    textInput,
    inputSourceType,
    sessionInputCounts,
    setSelectedFileName,
    setUploadedFileMeta: (meta) =>
      setUploadedFileMeta(meta.map(({ name, size }) => ({ name, size }))),
    setTextInput,
    setInputSourceType,
    setSessionInputCounts,
    onSessionRestored: (snap) => {
      if (snap.previewRows.length > 0) handleLogisticsPreviewSessionRestored();
    },
    onRestoreSettled: (hadPreview) => {
      setIsPreviewSessionRestoring(false);
      if (!hadPreview) {
        setFileProcessingStatus('idle');
      }
    },
  });

  useClearPreviewOnBridgeChange(templateBridgeFile, handleLogisticsTemplateBridgeChanged);

  useEffect(() => {
    if (!previewSessionEnabled || typeof window === 'undefined') return;
    const t = window.setTimeout(() => {
      const slots: { slot: string; file: File }[] = [];
      if (uploadedExcelFile) slots.push({ slot: 'orderExcel', file: uploadedExcelFile });
      if (selectedImage) slots.push({ slot: 'selectedImage', file: selectedImage });
      void putWorkspaceFiles('logistics-convert', userId, slots);
    }, 600);
    return () => window.clearTimeout(t);
  }, [previewSessionEnabled, userId, uploadedExcelFile, selectedImage]);

  useEffect(() => {
    if (!previewSessionEnabled || isPreviewSessionRestoring) return;
    if (typeof window === 'undefined') return;
    if (uploadedExcelFile) return;
    if (uploadedFileMeta.length === 0) return;

    let cancelled = false;
    void (async () => {
      const files = await loadWorkspaceFiles('logistics-convert', userId);
      if (cancelled) return;
      const order = files.orderExcel;
      const m0 = uploadedFileMeta[0];
      if (order && m0 && order.name === m0.name && order.size === m0.size) {
        setUploadedExcelFile(order);
        if (previewRows.length > 0) {
          setFileProcessingStatus('done');
        }
      }
      const img = files.selectedImage;
      if (img && inputSourceType === 'image') {
        setSelectedImage(img);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    previewSessionEnabled,
    isPreviewSessionRestoring,
    userId,
    uploadedFileMeta,
    uploadedExcelFile,
    previewRows.length,
    inputSourceType,
  ]);

  // 양식 변경 시 모달에 없는 기준헤더-only 잔여 키 제거 (예: 배송메시지1 삭제 후 배송메시지 키만 남은 경우)
  const templateCourierHeaderKey = templateBridgeFile?.courierHeaders?.join('\x1e') ?? '';
  useEffect(() => {
    if (!templateBridgeFile?.courierHeaders?.length) return;
    setFixedHeaderValues((prev) => {
      const pruned = pruneFixedInputToCourierKeys(prev, templateBridgeFile);
      if (Object.keys(pruned).length === Object.keys(prev).length) {
        const same = Object.keys(pruned).every(
          (k) => pruned[k] === prev[k],
        );
        if (same && Object.keys(prev).every((k) => k in pruned)) return prev;
      }
      return pruned;
    });
  }, [templateCourierHeaderKey, templateBridgeFile]);

  // fixedHeaderValues 저장 (복원 후)
  useEffect(() => {
    if (typeof window === 'undefined' || !logisticsCourierHydratedRef.current) return;
    const toStore = templateBridgeFile
      ? pruneFixedInputToCourierKeys(fixedHeaderValues, templateBridgeFile)
      : fixedHeaderValues;
    if (trialMode) {
      try {
        localStorage.setItem(TRIAL_LOGISTICS_FIXED_KEY, JSON.stringify(toStore));
      } catch (error) {
        console.error('localStorage에 고정 헤더 값을 저장하는 중 오류 발생:', error);
      }
      return;
    }
    if (!authAssetsReady) return;
    try {
      writeLocalStorageForUser(
        LOGISTICS_MAIN_KEYS.fixedHeaders,
        userId,
        JSON.stringify(toStore),
      );
    } catch (error) {
      console.error('localStorage에 고정 헤더 값을 저장하는 중 오류 발생:', error);
    }
  }, [fixedHeaderValues, trialMode, authAssetsReady, userId, templateBridgeFile]);

  // 물류 상품코드 매핑 목록·선택 복원 (3PL과 동일 패턴)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 체험판: 비로그인(guest)과 동일 키를 쓰면 과거 테스트 매핑 잔재가 그대로 보이므로 LS를 읽지 않음
    if (trialMode) {
      setRecentMappingFormats([]);
      setTempSelectedMappingId('');
      setProductCodeMap({});
      setProductCodeFileName(null);
      setIsLogisticsMappingStorageHydrated(true);
      return;
    }

    try {
      const mappingKey = getLogisticsScopedKey(LOGISTICS_MAPPING_STORAGE_KEY, userId);
      const mappingSelectedKey = getLogisticsScopedKey(LOGISTICS_MAPPING_SELECTED_KEY, userId);
      const savedMappings = localStorage.getItem(mappingKey);
      const savedMappingSelected = localStorage.getItem(mappingSelectedKey);

      if (savedMappings) {
        const parsed = JSON.parse(savedMappings) as LogisticsMappingFileFormat[];
        if (!Array.isArray(parsed)) {
          // 과거 포맷/깨진 값일 가능성이 높음 → 잔재 정리
          clearLogisticsMappingLocalStorage(userId);
          return;
        }

        setRecentMappingFormats(parsed);
        if (savedMappingSelected) {
          setTempSelectedMappingId(savedMappingSelected);
          const fmt = parsed.find((f) => f.id === savedMappingSelected);
          if (fmt?.rows?.length) {
            setProductCodeMap(parseProductCodeMapFromMatrix(fmt.rows));
            setProductCodeFileName(fmt.displayName ?? '매핑');
          }
        }
      }
    } catch (err) {
      // 과거 잔재/포맷 불일치로 인한 JSON parse 실패는 기능 오류가 아니라 “정리 대상”
      clearLogisticsMappingLocalStorage(userId);
    } finally {
      setIsLogisticsMappingStorageHydrated(true);
    }
  }, [userId, trialMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isLogisticsMappingStorageHydrated) return;
    // 체험판: guest 키에 매핑을 쓰지 않음 (잔재 유출·오염 방지, 세션에서만 사용)
    if (trialMode) return;
    try {
      const mappingKey = getLogisticsScopedKey(LOGISTICS_MAPPING_STORAGE_KEY, userId);
      const mappingSelectedKey = getLogisticsScopedKey(LOGISTICS_MAPPING_SELECTED_KEY, userId);
      localStorage.setItem(mappingKey, JSON.stringify(recentMappingFormats));
      const hasSelected = recentMappingFormats.some((f) => f.id === tempSelectedMappingId);
      localStorage.setItem(mappingSelectedKey, hasSelected ? tempSelectedMappingId : '');
    } catch (err) {
      // 저장 실패는 사용자가 이후 매핑을 다시 저장하면 되므로 “잔재 정리” 관점에서 조용히 무시
    }
  }, [recentMappingFormats, tempSelectedMappingId, userId, isLogisticsMappingStorageHydrated, trialMode]);

  /**
   * 상품코드 칸 기준: 매핑으로 코드 치환 ↔ 변환 직전 상품명 복원(토글)
   */
  const handleApplyProductNameToCodeConversion = useCallback(() => {
    if (courierHeaders.length === 0 || previewRows.length === 0) {
      alert('미리보기에 변환할 데이터가 없습니다.');
      return;
    }
    const codeKey = resolveProductCodeColumnHeader(courierHeaders);
    if (!codeKey) {
      alert('템플릿에 상품코드(또는 바코드·코드) 열을 찾지 못했습니다.');
      return;
    }

    if (isProductCodeColumnShowingMappedCodes) {
      const backup = productCodeCellBackupByRowIdRef.current;
      setPreviewRows((prev) =>
        prev.map((row) => {
          const saved = backup.get(row.rowId);
          if (saved === undefined) return row;
          return {
            ...row,
            data: { ...row.data, [codeKey]: saved },
          };
        }),
      );
      resetProductCodeColumnToggle();
      setProductCodeMappingNotice(null);
      return;
    }

    if (Object.keys(productCodeMap).length === 0) {
      alert('상품코드 매핑 파일을 먼저 등록해 주세요.');
      return;
    }

    const backup = new Map<string, string>();
    for (const r of previewRows) {
      backup.set(r.rowId, String(r.data[codeKey] ?? '').trim());
    }
    productCodeCellBackupByRowIdRef.current = backup;

    const mergedRows = previewRows.map((r) => r.data);
    const { rows, meta } = applyProductCodeProjection(
      mergedRows,
      courierHeaders,
      productCodeMap,
      { nameSource: 'code_column_as_name' },
    );
    setPreviewRows((prev) =>
      rows.map((data, i) => ({
        rowId: prev[i]!.rowId,
        data,
      })),
    );
    setIsProductCodeColumnShowingMappedCodes(true);
    if (
      meta.didAttemptProjection &&
      meta.failCount > 0 &&
      meta.targetCodeColumnHeader
    ) {
      setProductCodeMappingNotice({
        targetHeader: meta.targetCodeColumnHeader,
        failCount: meta.failCount,
        successCount: meta.successCount,
      });
    } else {
      setProductCodeMappingNotice(null);
    }
  }, [
    previewRows,
    courierHeaders,
    productCodeMap,
    isProductCodeColumnShowingMappedCodes,
    resetProductCodeColumnToggle,
  ]);

  const handleOpenColumnCodeMappingModal = useCallback(() => {
    if (courierHeaders.length === 0 || previewRows.length === 0) {
      alert('미리보기에 변환된 데이터가 있어야 코드매핑을 할 수 있습니다.');
      return;
    }
    setColumnMappingStaging({});
    setColumnMappingActiveHeader(null);
    setColumnCodeMappingModalView('editor');
    setShowColumnCodeMappingModal(true);
  }, [courierHeaders.length, previewRows.length]);

  const handleClearColumnCodeMappingForHeader = useCallback(
    (header: string) => {
      const snap = columnCodeMappingSnapshots[header];
      if (!snap) return;
      setPreviewRows((prev) =>
        prev.map((row) => ({
          ...row,
          data: {
            ...row.data,
            [header]: snap[row.rowId] ?? row.data[header] ?? '',
          },
        })),
      );
      setUserOverrides((prev) => {
        const next = { ...prev };
        for (const rowId of Object.keys(snap)) {
          const rowOv = next[rowId];
          if (!rowOv) continue;
          const copy = { ...rowOv };
          delete copy[header];
          if (Object.keys(copy).length === 0) delete next[rowId];
          else next[rowId] = copy;
        }
        return next;
      });
      setColumnCodeMappingSnapshots((prev) => {
        const rest = { ...prev };
        delete rest[header];
        return rest;
      });
    },
    [columnCodeMappingSnapshots],
  );

  /** 모달만 닫기 — 미리보기에 이미 반영된 매핑은 유지 */
  const handleCloseColumnCodeMappingModal = useCallback(() => {
    closeColumnCodeMappingModal();
  }, [closeColumnCodeMappingModal]);

  /** 적용 취소 — 이 열에 반영된 코드매핑이 있으면 미리보기에서 되돌린 뒤 닫기 */
  const handleCancelColumnCodeMappingModal = useCallback(() => {
    const header = columnMappingActiveHeader;
    if (header && columnCodeMappingSnapshots[header]) {
      handleClearColumnCodeMappingForHeader(header);
    }
    closeColumnCodeMappingModal();
    setColumnMappingStaging({});
  }, [
    columnMappingActiveHeader,
    columnCodeMappingSnapshots,
    handleClearColumnCodeMappingForHeader,
    closeColumnCodeMappingModal,
  ]);

  /**
   * 미리보기 테이블 헤더 체크박스 동작
   * - 체크: 해당 열을 active로 두고 코드매핑 설정 모달을 즉시 오픈
   * - 체크 해제: (해당 열에 적용된 스냅샷이 있으면) 매핑 해제
   */
  const handleHeaderCodeMappingCheckboxChange = useCallback(
    (header: string, checked: boolean) => {
      if (!checked) {
        const hasSnap = Boolean(columnCodeMappingSnapshots[header]);

        // 모달을 통해 작업 중이었다면 먼저 닫습니다.
        if (
          showColumnCodeMappingModal &&
          columnMappingActiveHeader === header
        ) {
          handleCloseColumnCodeMappingModal();
          if (hasSnap) handleClearColumnCodeMappingForHeader(header);
          return;
        }

        // 이미 적용된 매핑 스냅샷이 있다면 해제합니다.
        if (hasSnap) {
          handleClearColumnCodeMappingForHeader(header);
        }
        return;
      }

      if (courierHeaders.length === 0 || previewRows.length === 0) {
        alert('미리보기에 변환된 데이터가 있어야 코드매핑을 할 수 있습니다.');
        return;
      }

      // 체크 즉시 모달 오픈
      const lower = String(header ?? '').toLowerCase();
      const isProductMode =
        lower.includes('상품') ||
        lower.includes('품목') ||
        lower.includes('제품') ||
        lower.includes('옵션') ||
        lower.includes('option') ||
        lower.includes('상품코드') ||
        lower.includes('품목코드') ||
        lower.includes('바코드') ||
        lower.includes('박스코드') ||
        lower.includes('sku') ||
        lower.includes('code');

      if (isProductMode) {
        setColumnCodeMappingEditorMode('product');

        const nameCol = resolveLogisticsProductNameColumn(courierHeaders);
        const optCol = resolveLogisticsProductOptionColumn(courierHeaders);
        const codeCol = resolveProductCodeColumnHeader(courierHeaders);

        // 상품명 컬럼이 없으면: “해당 헤더가 상품코드(또는 바코드/코드) 열”일 때만 역으로 이름을 그 칸의 문자열로 사용
        const sourceNameCol =
          nameCol ?? (codeCol && header === codeCol ? codeCol : null);

        if (!sourceNameCol) {
          alert(
            '상품 마스터를 쓰려면 템플릿에 상품명·품목명 열 또는 상품코드·바코드·코드 열이 필요합니다.',
          );
          return;
        }

        const keyDisplayMap = new Map<
          string,
          { displayKey: string; key: string }
        >();

        for (const row of previewRows) {
          const nameVal = String(row.data[sourceNameCol] ?? '').trim();
          if (!nameVal) continue;
          const optionVal = optCol
            ? String(row.data[optCol] ?? '').trim()
            : '';
          const internalKey = normalizeInternalCompositeKey(
            `${nameVal}|${optionVal}`,
          );
          if (!keyDisplayMap.has(internalKey)) {
            const displayKey = optionVal ? `${nameVal} / ${optionVal}` : nameVal;
            keyDisplayMap.set(internalKey, {
              displayKey,
              key: internalKey,
            });
          }
        }

        const savedProductByHeader = loadProductColumnMapsByUser(userId);
        const headerProductMap = savedProductByHeader[header];
        const effectiveProductMap: ProductCodeMap =
          headerProductMap && Object.keys(headerProductMap).length > 0
            ? headerProductMap
            : (productCodeMap ?? {});

        let nextRows = Array.from(keyDisplayMap.values()).map(
          ({ key, displayKey }) => ({
            id: makeColumnCodeMappingEditorRowId(),
            key,
            displayKey,
            value: effectiveProductMap[key] ?? '',
            manualRow: false,
          }),
        );

        // 미리보기에서 뽑힌 원본값이 0개면: 기본 10칸을 열어서 직접 입력 가능하게
        if (nextRows.length === 0) {
          const fromSaved =
            Object.keys(effectiveProductMap).length > 0
              ? createRowsFromProductCodeMap(
                  effectiveProductMap,
                  DEFAULT_COLUMN_CODE_MAPPING_ROWS_COUNT,
                )
              : [];
          nextRows =
            fromSaved.length > 0 ? fromSaved : createEmptyEditorRows(DEFAULT_COLUMN_CODE_MAPPING_ROWS_COUNT);
        }

        setColumnCodeMappingEditorMap({ ...effectiveProductMap });
        setColumnCodeMappingEditorSimpleMap({});
        setColumnCodeMappingEditorRows(nextRows);
      } else {
        // simple 모드: 선택한 헤더 자체의 값들을 원본값 목록으로 사용
        setColumnCodeMappingEditorMode('simple');
        setColumnCodeMappingEditorMap({});
        setColumnCodeMappingEditorSimpleMap({});

        const unique = new Map<string, string>(); // key -> displayKey
        for (const row of previewRows) {
          const raw = String(row.data[header] ?? '').trim();
          if (!raw) continue;
          if (!unique.has(raw)) unique.set(raw, raw);
        }

        let nextRows = Array.from(unique.entries()).map(([key, displayKey]) => ({
          id: makeColumnCodeMappingEditorRowId(),
          key,
          displayKey,
          value: '',
          manualRow: false,
        }));

        // 미리보기에서 뽑힌 원본값이 0개면: 기본 10칸을 열어서 직접 입력 가능하게
        if (nextRows.length === 0) {
          nextRows = createEmptyEditorRows(
            DEFAULT_COLUMN_CODE_MAPPING_ROWS_COUNT,
          );
        }

        const savedByHeader = loadSimpleColumnMapsByUser(userId);
        const savedSimple = savedByHeader[header] ?? {};
        nextRows = nextRows.map((row) => ({
          ...row,
          value:
            savedSimple[row.key] !== undefined
              ? savedSimple[row.key]!
              : row.value,
        }));

        const rowKeySet = new Set(nextRows.map((r) => r.key));
        for (const k of Object.keys(savedSimple)) {
          if (rowKeySet.has(k)) continue;
          rowKeySet.add(k);
          nextRows.push({
            id: makeColumnCodeMappingEditorRowId(),
            key: k,
            displayKey: k,
            value: savedSimple[k] ?? '',
            manualRow: true,
          });
        }

        setColumnCodeMappingEditorSimpleMap(savedSimple);
        setColumnCodeMappingEditorRows(nextRows);
      }

      setColumnMappingStaging({}); // 새 모달은 editor 상태로만 처리
      setColumnMappingActiveHeader(header);
      setColumnCodeMappingDuplicatePopup(null);
      setColumnCodeMappingSavedMessage(null);
      setColumnCodeMappingModalView('editor');
      setShowColumnCodeMappingModal(true);
    },
    [
      showColumnCodeMappingModal,
      columnMappingActiveHeader,
      courierHeaders.length,
      previewRows.length,
      productCodeMap,
      productCodeFileName,
      columnCodeMappingSnapshots,
      handleCloseColumnCodeMappingModal,
      handleClearColumnCodeMappingForHeader,
      userId,
    ],
  );

  const commitColumnMappingFromEditorToPreview = useCallback((): boolean => {
    if (!columnMappingActiveHeader) return false;

    const header = columnMappingActiveHeader;
    const productMap = columnCodeMappingEditorMap;
    const simpleMap = buildSimpleMapFromEditorRows(columnCodeMappingEditorRows);
    const kind = columnCodeMappingEditorMode;

    const hasContent =
      kind === 'product'
        ? Object.values(productMap).some((v) => String(v ?? '').trim() !== '')
        : Object.keys(simpleMap).length > 0;
    if (!hasContent) return false;

    const snap: Record<string, string> = {};
    for (const row of previewRows) {
      snap[row.rowId] = String(row.data[header] ?? '');
    }

    setColumnCodeMappingSnapshots((prev) => {
      if (prev[header]) return prev;
      return { ...prev, [header]: snap };
    });

    const baseline = previewRows.map((r) => r.data);
    const merged = applyLogisticsStagedColumnMappings(
      baseline,
      courierHeaders,
      [
        kind === 'product'
          ? {
              targetHeader: header,
              kind: 'product',
              fileName: '직접입력',
              productMap,
            }
          : {
              targetHeader: header,
              kind: 'simple',
              fileName: '직접입력',
              simpleMap,
            },
      ],
    );

    setPreviewRows((prev) =>
      merged.map((data, i) => ({
        rowId: prev[i]!.rowId,
        data,
      })),
    );

    setUserOverrides((prev) => {
      const next = { ...prev };
      for (const row of previewRows) {
        const rowOv = next[row.rowId];
        if (!rowOv || rowOv[header] === undefined) continue;
        const copy = { ...rowOv };
        delete copy[header];
        if (Object.keys(copy).length === 0) delete next[row.rowId];
        else next[row.rowId] = copy;
      }
      return next;
    });

    return true;
  }, [
    columnMappingActiveHeader,
    columnCodeMappingEditorMap,
    columnCodeMappingEditorRows,
    columnCodeMappingEditorMode,
    previewRows,
    courierHeaders,
  ]);

  const handleApplyColumnCodeMappingFromEditor = useCallback(() => {
    if (!commitColumnMappingFromEditorToPreview()) {
      setColumnCodeMappingSavedMessage('적용할 변환값이 없습니다.');
      setTimeout(() => setColumnCodeMappingSavedMessage(null), 2000);
      return;
    }
    setColumnCodeMappingSavedMessage('미리보기에 반영되었습니다.');
    setTimeout(() => {
      closeColumnCodeMappingModal();
      setColumnMappingStaging({});
    }, 900);
  }, [commitColumnMappingFromEditorToPreview, closeColumnCodeMappingModal]);

  const handleEnableColumnAutoApply = useCallback(() => {
    if (!columnMappingActiveHeader) return;
    const header = columnMappingActiveHeader;
    const kind = columnCodeMappingEditorMode;

    if (kind === 'simple') {
      const sm = buildSimpleMapFromEditorRows(columnCodeMappingEditorRows);
      if (Object.keys(sm).length === 0) {
        setColumnCodeMappingSavedMessage('저장할 변환값이 없습니다.');
        setTimeout(() => setColumnCodeMappingSavedMessage(null), 2000);
        return;
      }
      try {
        saveSimpleColumnMapForHeader(userId, header, sm);
        setColumnCodeMappingEditorSimpleMap(sm);
      } catch (e) {
        console.error('[물류] simple 매핑 저장 오류:', e);
        setColumnCodeMappingSavedMessage('저장 중 오류가 발생했습니다.');
        setTimeout(() => setColumnCodeMappingSavedMessage(null), 2500);
        return;
      }
    } else {
      const pm = columnCodeMappingEditorMap;
      if (
        !pm ||
        !Object.values(pm).some((v) => String(v ?? '').trim() !== '')
      ) {
        setColumnCodeMappingSavedMessage('저장할 변환값이 없습니다.');
        setTimeout(() => setColumnCodeMappingSavedMessage(null), 2000);
        return;
      }
      try {
        saveProductColumnMapForHeader(userId, header, { ...pm });
      } catch (e) {
        console.error('[물류] product 매핑 저장 오류:', e);
        setColumnCodeMappingSavedMessage('저장 중 오류가 발생했습니다.');
        setTimeout(() => setColumnCodeMappingSavedMessage(null), 2500);
        return;
      }
    }

    try {
      saveColumnAutoApplyForHeader(userId, header, { enabled: true, kind });
      setColumnAutoApplyByHeader((prev) => ({
        ...prev,
        [header]: { enabled: true, kind },
      }));
    } catch (e) {
      console.error('[물류] 자동 적용 설정 오류:', e);
      setColumnCodeMappingSavedMessage('저장 중 오류가 발생했습니다.');
      setTimeout(() => setColumnCodeMappingSavedMessage(null), 2500);
      return;
    }

    if (!commitColumnMappingFromEditorToPreview()) {
      setColumnCodeMappingSavedMessage('적용할 변환값이 없습니다.');
      setTimeout(() => setColumnCodeMappingSavedMessage(null), 2000);
      return;
    }

    setColumnCodeMappingSavedMessage('다음 업로드부터 자동 적용됩니다.');
    setTimeout(() => setColumnCodeMappingSavedMessage(null), 3000);
  }, [
    columnMappingActiveHeader,
    columnCodeMappingEditorMode,
    columnCodeMappingEditorRows,
    columnCodeMappingEditorMap,
    userId,
    commitColumnMappingFromEditorToPreview,
  ]);

  const handleCancelColumnAutoApply = useCallback(() => {
    if (!columnMappingActiveHeader) return;
    const header = columnMappingActiveHeader;
    try {
      saveColumnAutoApplyForHeader(userId, header, null);
      setColumnAutoApplyByHeader((prev) => {
        const next = { ...prev };
        delete next[header];
        return next;
      });
    } catch (e) {
      console.error('[물류] 자동 적용 해제 오류:', e);
      setColumnCodeMappingSavedMessage('해제 중 오류가 발생했습니다.');
      setTimeout(() => setColumnCodeMappingSavedMessage(null), 2500);
      return;
    }
    setColumnCodeMappingSavedMessage('자동 적용이 해제되었습니다.');
    setTimeout(() => setColumnCodeMappingSavedMessage(null), 3000);
  }, [columnMappingActiveHeader, userId]);

  const handleColumnMappingExcelFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f) return;

      try {
        if (columnCodeMappingEditorMode === 'product') {
          const parsed = await parseTwoColumnKeyValueMapFromFile(f);

          const toDisplayKey = (internalKey: string) => {
            const idx = internalKey.indexOf('|');
            if (idx < 0) return internalKey;
            const name = internalKey.slice(0, idx);
            const option = internalKey.slice(idx + 1);
            return option ? `${name} / ${option}` : name;
          };

          if (parsed.duplicates.length > 0) {
            const showItems = parsed.duplicates
              .slice(0, 5)
              .map((d) => ({
                key: d.key,
                displayKey: toDisplayKey(d.key),
                count: d.count,
                lastValue: d.lastValue,
              }));
            const moreCount = Math.max(0, parsed.duplicates.length - 5);
            setColumnCodeMappingDuplicatePopup({
              items: showItems,
              moreCount,
            });
          } else {
            setColumnCodeMappingDuplicatePopup(null);
          }

          setColumnCodeMappingEditorSimpleMap({});

          setColumnCodeMappingEditorRows((prevRows) => {
            const updated = prevRows.map((r) => {
              const nv = lookupProductCodeForEditorRow(r, parsed.map);
              return nv ? { ...r, value: nv } : r;
            });
            setColumnCodeMappingEditorMap((prev) => {
              const next: ProductCodeMap = { ...prev };
              for (const [k, v] of Object.entries(parsed.map)) {
                const trimmed = String(v ?? '').trim();
                if (!trimmed) delete next[k];
                else next[k] = trimmed;
              }
              for (const r of updated) {
                const v = String(r.value ?? '').trim();
                if (v && r.key) next[r.key] = v;
              }
              return next;
            });
            return updated;
          });
        } else {
          const parsed = await parseTwoColumnSimpleKeyValueMapFromFile(f);

          if (parsed.duplicates.length > 0) {
            const showItems = parsed.duplicates.slice(0, 5).map((d) => ({
              key: d.key,
              displayKey: d.key,
              count: d.count,
              lastValue: d.lastValue,
            }));
            const moreCount = Math.max(0, parsed.duplicates.length - 5);
            setColumnCodeMappingDuplicatePopup({
              items: showItems,
              moreCount,
            });
          } else {
            setColumnCodeMappingDuplicatePopup(null);
          }

          setColumnCodeMappingEditorSimpleMap((prev) => {
            const next = { ...prev };
            for (const [k, v] of Object.entries(parsed.map)) {
              const trimmed = String(v ?? '').trim();
              if (!trimmed) delete next[k];
              else next[k] = trimmed;
            }
            return next;
          });
          setColumnCodeMappingEditorMap({});

          setColumnCodeMappingEditorRows((prevRows) =>
            prevRows.map((r) => {
              const nv = lookupSimpleCodeForEditorRow(r, parsed.map);
              return nv ? { ...r, value: nv } : r;
            }),
          );
        }

        setColumnCodeMappingSavedMessage(
          '엑셀 매핑을 불러왔습니다. 변환값 칸을 확인해 주세요.',
        );
        setTimeout(() => setColumnCodeMappingSavedMessage(null), 3000);
        setColumnCodeMappingModalView('editor');
      } catch (err) {
        console.error('[물류 코드매핑] 엑셀 파싱 오류:', err);
        alert('엑셀을 읽는 중 오류가 발생했습니다.');
      }
    },
    [columnCodeMappingEditorMode],
  );

  // 편집 테이블에 사용자가 추가 행을 직접 만들 수 있도록 지원
  const handleAddColumnCodeMappingEditorRow = useCallback(() => {
    setColumnCodeMappingEditorRows((prev) => [
      ...prev,
      {
        id: makeColumnCodeMappingEditorRowId(),
        key: '',
        displayKey: '',
        value: '',
        manualRow: true,
      },
    ]);
  }, []);

  // (헤더별) 고정 2열 편집기에서 만든 매핑을 “지난 변환 보기”에 재사용 저장
  const handleSaveColumnCodeMappingForReuse = useCallback(() => {
    if (columnCodeMappingEditorMode === 'simple') {
      if (!columnMappingActiveHeader) return;
      const sm = buildSimpleMapFromEditorRows(columnCodeMappingEditorRows);
      if (Object.keys(sm).length === 0) {
        setColumnCodeMappingSavedMessage('저장할 내용이 없습니다.');
        setTimeout(() => setColumnCodeMappingSavedMessage(null), 2000);
        return;
      }
      try {
        saveSimpleColumnMapForHeader(userId, columnMappingActiveHeader, sm);
        setColumnCodeMappingEditorSimpleMap(sm);
      } catch (e) {
        console.error('[물류] simple 매핑 저장 오류:', e);
        setColumnCodeMappingSavedMessage('저장 중 오류가 발생했습니다.');
        setTimeout(() => setColumnCodeMappingSavedMessage(null), 2500);
        return;
      }
      setColumnCodeMappingSavedMessage('변환값이 저장되었습니다.');
      setTimeout(() => setColumnCodeMappingSavedMessage(null), 3000);
      return;
    }

    const productMap = columnCodeMappingEditorMap;
    if (!productMap || Object.keys(productMap).length === 0) {
      setColumnCodeMappingSavedMessage('저장할 내용이 없습니다.');
      setTimeout(() => setColumnCodeMappingSavedMessage(null), 2000);
      return;
    }

    const rows: string[][] = [];
    rows.push(['상품명', '옵션명', '상품코드']);

    for (const [internalKey, code] of Object.entries(productMap)) {
      const codeTrim = String(code ?? '').trim();
      if (!codeTrim) continue;
      const idx = internalKey.indexOf('|');
      const name = idx >= 0 ? internalKey.slice(0, idx) : internalKey;
      const option = idx >= 0 ? internalKey.slice(idx + 1) : '';
      rows.push([name, option, codeTrim]);
    }

    if (rows.length <= 1) {
      setColumnCodeMappingSavedMessage('변환값이 비어있어 저장할 수 없습니다.');
      setTimeout(() => setColumnCodeMappingSavedMessage(null), 2500);
      return;
    }

    const newId = `logistics-mapping-direct-${Date.now()}`;
    const displayName = '상품코드 매핑(직접입력)';
    const nextMapping: LogisticsMappingFileFormat = {
      id: newId,
      displayName,
      createdAt: new Date().toISOString(),
      rows,
    };

    setRecentMappingFormats((prev) => [nextMapping, ...prev]);
    setTempSelectedMappingId(newId);
    setProductCodeMap({ ...productMap });
    setProductCodeFileName(displayName);

    setColumnCodeMappingSavedMessage('변환값이 저장되었습니다.');
    setTimeout(() => setColumnCodeMappingSavedMessage(null), 3000);
  }, [
    columnCodeMappingEditorMode,
    columnMappingActiveHeader,
    columnCodeMappingEditorRows,
    columnCodeMappingEditorMap,
    userId,
    setRecentMappingFormats,
    setTempSelectedMappingId,
  ]);

  const handleConfirmColumnCodeMapping = useCallback(() => {
    const stagedList = courierHeaders
      .map((h) => columnMappingStaging[h])
      .filter((x): x is LogisticsStagedColumnMapping => Boolean(x));
    if (stagedList.length === 0) {
      alert('헤더를 선택한 뒤 열당 매핑 파일을 등록해 주세요.');
      return;
    }
    const nameColForProduct = resolveLogisticsProductNameColumn(courierHeaders);
    const codeColForProduct = resolveProductCodeColumnHeader(courierHeaders);
    for (const s of stagedList) {
      if (s.kind !== 'product') continue;
      if (nameColForProduct) continue;
      if (codeColForProduct && s.targetHeader === codeColForProduct) continue;
      alert(
        codeColForProduct
          ? `템플릿에 상품명 열이 없을 때는, 원문이 들어 있는 「${codeColForProduct}」열을 코드매핑 대상으로 선택해 주세요. (현재: 「${s.targetHeader}」)`
          : '상품 마스터를 쓰려면 템플릿에 상품명·품목명 열 또는 상품코드·바코드·코드 열이 있어야 합니다.',
      );
      return;
    }
    const invalidSimple = stagedList.find(
      (s) => s.kind === 'simple' && Object.keys(s.simpleMap ?? {}).length === 0,
    );
    if (invalidSimple) {
      alert(
        `「${invalidSimple.targetHeader}」에 올린 파일에서 단순 매핑(원본→코드)을 읽지 못했습니다. 엑셀 형식을 확인해 주세요.`,
      );
      return;
    }

    const baseline = previewRows.map((r) => r.data);
    setColumnCodeMappingSnapshots((prevSnap) => {
      const next = { ...prevSnap };
      for (const spec of stagedList) {
        const h = spec.targetHeader;
        if (next[h]) continue;
        const rowSnap: Record<string, string> = {};
        for (const row of previewRows) {
          rowSnap[row.rowId] = String(row.data[h] ?? '');
        }
        next[h] = rowSnap;
      }
      return next;
    });

    const merged = applyLogisticsStagedColumnMappings(
      baseline,
      courierHeaders,
      stagedList,
    );

    setPreviewRows((prev) =>
      merged.map((data, i) => ({
        rowId: prev[i]!.rowId,
        data,
      })),
    );

    setUserOverrides((prev) => {
      const next = { ...prev };
      const headers = new Set(stagedList.map((s) => s.targetHeader));
      for (const row of previewRows) {
        for (const h of headers) {
          const rowOv = next[row.rowId];
          if (!rowOv?.[h]) continue;
          const copy = { ...rowOv };
          delete copy[h];
          if (Object.keys(copy).length === 0) delete next[row.rowId];
          else next[row.rowId] = copy;
        }
      }
      return next;
    });

    setShowColumnCodeMappingModal(false);
    setColumnMappingStaging({});
    setColumnMappingActiveHeader(null);
    columnMappingPendingHeaderRef.current = null;
  }, [columnMappingStaging, courierHeaders, previewRows]);

  const triggerColumnMappingFilePick = useCallback((header: string) => {
    columnMappingPendingHeaderRef.current = header;
    columnMappingModalFileRef.current?.click();
  }, []);

  // 점 애니메이션 처리 (파일 처리용)
  useEffect(() => {
    if (fileProcessingStatus !== "processing") return;

    const interval = setInterval(() => {
      setProcessingDots(prev => (prev.length >= 3 ? "" : prev + "."));
    }, 400);

    return () => clearInterval(interval);
  }, [fileProcessingStatus]);

  // 점 애니메이션 처리 (텍스트 변환용)
  useEffect(() => {
    if (!isProcessingTextImage) {
      setTextProcessingDots("");
      return;
    }

    const interval = setInterval(() => {
      setTextProcessingDots(prev => (prev.length >= 3 ? "" : prev + "."));
    }, 400);

    return () => clearInterval(interval);
  }, [isProcessingTextImage]);

  const clearOrderInputForTemplateChange = useCallback(() => {
    setUploadedExcelFile(null);
    setOrderStandardFile(null);
    setUploadedFileMeta([]);
    setSelectedFiles([]);
    setSelectedFileName(null);
    setFileProcessingStatus('idle');
    setStage2ChunkLabel(null);
    setUnknownHeadersWarning([]);
    setUnknownHeaderSamples({});
    setDirectMappingModalOpen(false);
    setDirectMappingConfirmModalOpen(false);
    setDirectMappingPendingColumns([]);
    setDirectMappingSourceHeaders([]);
    setDirectMappingSourceSamples({});
    setDirectMappingRenameValues([]);
    setDirectMappingOutputOrder([]);
    setDirectMappingCustomHeaders([]);
    setDirectMappingCustomHeaderInputOpen(false);
    setDirectMappingNewHeaderInput('');
    setDirectMappingDraggingSourceIndex(null);
    setDirectMappingDragOverOrderIndex(null);
    setTextInput('');
    clearWorkspaceInputTracking();
  }, [clearWorkspaceInputTracking]);

  const handleOpenCourierTemplateModal = () => {
    const formats = loadRecentExcelFormats(trialMode, trialMode ? null : userId);
    setRecentExcelFormats(formats);
    setShowRecentTemplate(formats.length > 0);

    let matchedFormatId: string | null = null;
    if (courierUploadTemplate && Array.isArray(courierUploadTemplate.headers)) {
      const currentHeaders = courierUploadTemplate.headers
        .filter((header) => !header.isEmpty && header.name.trim() !== '')
        .map((header) => header.name);

      const matchedFormat = formats.find((format) => {
        const formatHeaders = format.columnOrder || [];
        if (currentHeaders.length !== formatHeaders.length) return false;
        return currentHeaders.every((header, index) => header === formatHeaders[index]);
      });

      if (matchedFormat) {
        matchedFormatId = matchedFormat.id;
      }
    }

    templateModalBaselineFormatIdRef.current = matchedFormatId;
    hadOrderWorkBeforeTemplateModalRef.current =
      Boolean(uploadedExcelFile) ||
      previewRows.length > 0 ||
      Boolean(orderStandardFile) ||
      textInput.trim().length > 0 ||
      uploadedFileMeta.length > 0;

    setTempSelectedFormatId(matchedFormatId);
    setIsCourierTemplateModalOpen(true);
  };

  const handleCloseCourierTemplateModal = () => {
    setIsCourierTemplateModalOpen(false);
  };

  const trialFirstPreviewFormatNotice = useTrialFirstPreviewFormatNotice({
    enabled: trialMode,
    previewRowCount: previewRows.length,
    courierHeaderCount: courierHeaders.length,
    templateModalOpen: isCourierTemplateModalOpen,
    scope: 'logistics',
  });

  const handleTrialFirstPreviewFormatNoticeChangeFormat = () => {
    trialFirstPreviewFormatNotice.close();
    handleOpenCourierTemplateModal();
  };

  const handleConfirmCourierTemplateModal = () => {
    const formatChanged = tempSelectedFormatId !== templateModalBaselineFormatIdRef.current;
    const shouldNotifyReupload = formatChanged && hadOrderWorkBeforeTemplateModalRef.current;

    setIsCourierTemplateModalOpen(false);

    if (shouldNotifyReupload) {
      clearOrderInputForTemplateChange();
      setIsTemplateChangeReuploadModalOpen(true);
    }
  };

  const handleTemplateFileClick = () => {
    if (courierFileInputRef.current) {
      courierFileInputRef.current.click();
    }
  };

  const applyTemplateFromFile = useCallback(
    async (
      file: File,
      options?: {
        /** 체험 기본 양식 자동 로드 등 토스트 생략 */
        silent?: boolean;
        formatDisplayName?: string;
        /** 체험 기본 양식 등 — 목록에서 삭제 불가 */
        protectedFromDeletion?: boolean;
        /** 체험 예시 양식 고정 id (중복 등록 방지) */
        formatId?: string;
      },
    ) => {
      const newTemplateSessionId = crypto.randomUUID();
      setTemplateFileSessionId(newTemplateSessionId);

      setCurrentFilePreviewData([]);
      setOrderStandardFile(null);
      setTemplateBridgeFile(null);
      setUploadedFileMeta([]);

      const templateResult = await runTemplatePipeline(file, undefined, newTemplateSessionId);
      setOrderStandardFile(null);
      setTemplateBridgeFile(templateResult.bridgeFile);

      if (typeof window !== 'undefined') {
        try {
          if (trialMode) {
            localStorage.setItem(
              TRIAL_LOGISTICS_BRIDGE_KEY,
              JSON.stringify(templateResult.bridgeFile),
            );
          } else {
            writeLocalStorageForUser(
              LOGISTICS_MAIN_KEYS.bridge,
              userId,
              JSON.stringify(templateResult.bridgeFile),
            );
          }
        } catch (error) {
          console.error('localStorage에 bridgeFile을 저장하는 중 오류 발생:', error);
        }
      }

      const headers: CourierUploadHeader[] = templateResult.bridgeFile.courierHeaders.map((headerName, index) => ({
        name: headerName,
        index,
        isEmpty: !headerName || headerName.trim() === '',
      }));

      const hasSenderColumns = headers.some((header) => !header.isEmpty && isSenderColumn(header.name));

      const template: CourierUploadTemplate = {
        courierType: null,
        headers,
        requiresSender: hasSenderColumns,
      };

      const newFormatId = saveRecentExcelFormat(
        template,
        setRecentExcelFormats,
        trialMode,
        userId,
        templateResult.bridgeFile,
        options?.formatDisplayName,
        options?.protectedFromDeletion,
        options?.formatId,
      );
      setCourierUploadTemplate(template);
      saveCourierUploadTemplate(template, trialMode, userId);

      if (newFormatId) {
        setTempSelectedFormatId(newFormatId);
      }

      if (!options?.silent) {
        logTemplateHeaderUpload(
          buildTemplateHeaderLogPayload(templateResult.bridgeFile, {
            page: 'logistics-convert',
            fileSessionId: newTemplateSessionId,
            templateId: newFormatId ?? undefined,
            templateName: options?.formatDisplayName ?? undefined,
            courierName: template.courierType ?? undefined,
          }),
        );
      }

      if (!options?.silent) {
        setRegistrationSuccessMessage('등록이 완료되었습니다');
        setTimeout(() => {
          setRegistrationSuccessMessage(null);
        }, 3500);
      }
    },
    [trialMode, userId],
  );

  /** 체험판: 택배사명 없는 예시 양식 3종 + 기본 xlsx 양식 목록 보강 */
  const mergeTrialExtraSampleFormats = useCallback(() => {
    if (!trialMode || typeof window === 'undefined') return;

    let formats = loadRecentExcelFormats(true, null);
    let changed = false;

    for (const spec of TRIAL_EXTRA_SAMPLE_FORMATS) {
      const bridgeFile = buildTrialBridgeFile(spec.headers);
      const existingIndex = formats.findIndex((format) => format.id === spec.id);

      if (existingIndex >= 0) {
        const existing = formats[existingIndex];
        const nextBridge = buildTrialBridgeFile(spec.headers);
        const prevBridge = existing.bridgeFile;
        const mappingChanged =
          !prevBridge ||
          trialBridgeNeedsAliasRefresh(prevBridge) ||
          JSON.stringify(prevBridge.mappedBaseHeaders) !==
            JSON.stringify(nextBridge.mappedBaseHeaders);

        if (mappingChanged) {
          formats[existingIndex] = {
            ...existing,
            columnOrder: spec.headers,
            displayName: spec.displayName,
            bridgeFile: nextBridge,
            protectedFromDeletion: true,
          };
          changed = true;
        }
        continue;
      }

      formats.push({
        id: spec.id,
        createdAt: new Date().toISOString(),
        columnOrder: spec.headers,
        displayName: spec.displayName,
        bridgeFile,
        protectedFromDeletion: true,
      });
      changed = true;
    }

    if (changed) {
      persistLogisticsRecentFormats(true, null, formats);
      setRecentExcelFormats(formats);
    }
  }, [trialMode]);

  /** 체험판: 저장된 양식이 없을 때 public의 기본 xlsx로 자동 등록 (텍스트/주문 테스트만으로 미리보기 가능) */
  useEffect(() => {
    if (!trialMode) return;

    mergeTrialExtraSampleFormats();

    const existing = loadCourierUploadTemplate(true, null);
    const recent = loadRecentExcelFormats(true, null);
    const hasDefaultSeed = recent.some(
      (format) =>
        format.id === TRIAL_SEED_FORMAT_IDS.logistics ||
        format.displayName === TRIAL_DEFAULT_FORMAT_DISPLAY_NAME,
    );

    if (isValidCourierTemplate(existing) && hasDefaultSeed) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(TRIAL_DEFAULT_TEMPLATE_PUBLIC_PATH);
        if (!res.ok) {
          console.error('[체험 기본 양식] 파일을 불러오지 못했습니다.', res.status);
          return;
        }
        const blob = await res.blob();
        const file = new File(
          [blob],
          '체험판업로드양식1.xlsx',
          {
            type:
              blob.type ||
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        );
        if (cancelled) return;
        await applyTemplateFromFile(file, {
          silent: true,
          formatDisplayName: TRIAL_DEFAULT_FORMAT_DISPLAY_NAME,
          protectedFromDeletion: true,
          formatId: TRIAL_SEED_FORMAT_IDS.logistics,
        });
        if (!cancelled) {
          mergeTrialExtraSampleFormats();
        }
      } catch (err) {
        console.error('[체험 기본 양식] 자동 적용 실패:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [trialMode, applyTemplateFromFile, mergeTrialExtraSampleFormats]);

  const handleTemplateFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      e.target.value = '';
      return;
    }

    try {
      await applyTemplateFromFile(file);
    } catch (error) {
      console.error('엑셀 파일 파싱 오류:', error);
      alert('엑셀 파일을 읽는 중 오류가 발생했습니다.');
    } finally {
      e.target.value = '';
    }
  };

  const resetDirectMappingEditorFields = (headers: string[]) => {
    setDirectMappingRenameValues([...headers]);
    setDirectMappingOutputOrder([]);
    setDirectMappingCustomHeaders([]);
    setDirectMappingCustomHeaderInputOpen(false);
    setDirectMappingNewHeaderInput('');
    setDirectMappingDraggingSourceIndex(null);
    setDirectMappingDragOverOrderIndex(null);
  };

  const openDirectMappingEditorModal = (
    headers: string[],
    samples: UnknownHeaderSamples,
  ) => {
    setDirectMappingSourceHeaders([...headers]);
    setDirectMappingSourceSamples(samples);
    resetDirectMappingEditorFields(headers);
    setDirectMappingModalOpen(true);
  };

  const handleOpenUserCustomFormatFlow = () => {
    if (directMappingSourceHeaders.length > 0) {
      resetDirectMappingEditorFields(directMappingSourceHeaders);
      setDirectMappingModalOpen(true);
      return;
    }
    setDirectMappingSampleFileModalOpen(true);
  };

  const handleDirectMappingSampleFileProcess = async (file: File) => {
    let buffer: ArrayBuffer;
    try {
      buffer = await unlockExcelFile(file);
    } catch (unlockError) {
      if (unlockError instanceof ExcelUnlockCancelledError) {
        return null;
      }
      throw unlockError;
    }

    const cleanInputFile = await parseOrderFileHeadersFromArrayBuffer(buffer);
    directMappingSampleCleanInputRef.current = {
      headers: [...cleanInputFile.headers],
      rows: cleanInputFile.rows.map((row) => [...row]),
      sourceType: 'excel',
    };
    return {
      headers: [...cleanInputFile.headers],
      samples: buildHeaderSamples(cleanInputFile),
    };
  };

  const handleDirectMappingSampleFileSuccess = (
    headers: string[],
    samples: UnknownHeaderSamples,
  ) => {
    setDirectMappingSampleFileModalOpen(false);
    openDirectMappingEditorModal(headers, samples);
  };

  const saveFormatDisplayName = (formatId: string, displayName: string) => {
    try {
      const formats = loadRecentExcelFormats(trialMode, trialMode ? null : userId);
      const updatedFormats = formats.map((format) =>
        format.id === formatId ? { ...format, displayName: displayName.trim() || undefined } : format,
      );
      persistLogisticsRecentFormats(trialMode, userId, updatedFormats);
      setRecentExcelFormats(updatedFormats);
      setEditingFormatId(null);
      setEditingDisplayName('');
    } catch (error) {
      console.error('양식 이름을 저장하는 중 오류 발생:', error);
    }
  };

  const handleStartEditName = (format: RecentExcelFormat) => {
    setEditingFormatId(format.id);
    setEditingDisplayName(format.displayName || '');
  };

  const handleCancelEditName = () => {
    setEditingFormatId(null);
    setEditingDisplayName('');
  };

  const handleConfirmEditName = (formatId: string) => {
    saveFormatDisplayName(formatId, editingDisplayName);
  };

  const handleTemplateSelect = (formatId: string) => {
    const selected = recentExcelFormats.find((format) => format.id === formatId);

    if (!selected) {
      return;
    }

    if (formatId !== tempSelectedFormatId) {
      clearOrderInputForTemplateChange();
    }

    // 1. setSelectedTemplateId 실행 (tempSelectedFormatId로 관리)
    setTempSelectedFormatId(formatId);

    // 2. courierUploadTemplate 설정
    const headers: CourierUploadHeader[] = Array.isArray(selected.columnOrder)
      ? selected.columnOrder.map((name, index) => ({
          name: name || '',
          index,
          isEmpty: !name || name.trim() === '',
        }))
      : [];

    const hasSenderColumns = headers.some((header) => !header.isEmpty && isSenderColumn(header.name));

    const template: CourierUploadTemplate = {
      courierType: null,
      headers,
      requiresSender: hasSenderColumns,
    };

    setCourierUploadTemplate(template);
    saveCourierUploadTemplate(template, trialMode, userId);

    // 템플릿 변경 시 메타 초기화
    setUploadedFileMeta([]);

    // 3. 선택된 템플릿의 bridgeFile 적용
    const bridgeToApply = repairTrialBridgeFileIfNeeded(
      selected.columnOrder ?? [],
      selected.bridgeFile,
    );
    if (bridgeToApply) {
      // setTemplateBridgeFile 실행 - 새 객체로 복사하여 전달 (React 객체 동일성 비교 문제 해결)
      setTemplateBridgeFile(JSON.parse(JSON.stringify(bridgeToApply)));
      
      // localStorage(활성 bridgeFile)도 함께 갱신
      if (typeof window !== 'undefined') {
        try {
          if (trialMode) {
            localStorage.setItem(
              TRIAL_LOGISTICS_BRIDGE_KEY,
              JSON.stringify(bridgeToApply),
            );
          } else {
            writeLocalStorageForUser(
              LOGISTICS_MAIN_KEYS.bridge,
              userId,
              JSON.stringify(bridgeToApply),
            );
          }
        } catch (error) {
          console.error('localStorage에 bridgeFile을 저장하는 중 오류 발생:', error);
        }
      }
    }
  };

  const handleOpenDirectMappingModal = () => {
    if (directMappingSourceHeaders.length === 0) {
      setDirectMappingSampleFileModalOpen(true);
      return;
    }

    resetDirectMappingEditorFields(directMappingSourceHeaders);
    setDirectMappingModalOpen(true);
  };

  const handleDirectMappingRenameChange = (sourceIndex: number, value: string) => {
    setDirectMappingRenameValues((prev) =>
      prev.map((header, index) => (index === sourceIndex ? value : header)),
    );
  };

  const getDirectMappingOutputHeaderName = (outputIndex: number) => {
    if (outputIndex >= 0) {
      const sourceHeader = directMappingSourceHeaders[outputIndex] ?? '';
      return directMappingRenameValues[outputIndex]?.trim() || sourceHeader;
    }

    return directMappingCustomHeaders[Math.abs(outputIndex) - 1]?.trim() || '';
  };

  const getDirectMappingSourceHeaderName = (outputIndex: number) => {
    if (outputIndex >= 0) return directMappingSourceHeaders[outputIndex] ?? '';
    return '';
  };

  const handleAddDirectMappingCustomHeader = () => {
    const headerName = directMappingNewHeaderInput.trim();
    if (!headerName) {
      alert('추가할 새 헤더명을 입력해 주세요.');
      return;
    }

    const normalizedHeaderName = headerName.replace(/\s/g, '').toLowerCase();
    const hasDuplicate = directMappingOutputOrder.some(
      (outputIndex) =>
        getDirectMappingOutputHeaderName(outputIndex).replace(/\s/g, '').toLowerCase() === normalizedHeaderName,
    );
    if (hasDuplicate) {
      alert(`이미 최종 출력 순서에 같은 헤더명이 있습니다: ${headerName}`);
      return;
    }

    const outputIndex = -(directMappingCustomHeaders.length + 1);
    setDirectMappingCustomHeaders((prev) => [...prev, headerName]);
    setDirectMappingOutputOrder((prev) => [...prev, outputIndex]);
    setDirectMappingNewHeaderInput('');
    setDirectMappingCustomHeaderInputOpen(false);
  };

  const handleRemoveDirectMappingOutputHeader = (outputIndex: number) => {
    setDirectMappingOutputOrder((prev) => prev.filter((item) => item !== outputIndex));
  };

  const handleMoveDirectMappingOutputHeader = (sourceIndex: number, direction: -1 | 1) => {
    setDirectMappingOutputOrder((prev) => {
      const currentIndex = prev.indexOf(sourceIndex);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev;

      const next = [...prev];
      [next[currentIndex], next[nextIndex]] = [next[nextIndex]!, next[currentIndex]!];
      return next;
    });
  };

  const moveDirectMappingOutputHeaderTo = (sourceIndex: number, targetOrderIndex: number) => {
    setDirectMappingOutputOrder((prev) => {
      const currentIndex = prev.indexOf(sourceIndex);
      if (currentIndex < 0) {
        const insertIndex = Math.min(Math.max(targetOrderIndex, 0), prev.length);
        const next = [...prev];
        next.splice(insertIndex, 0, sourceIndex);
        return next;
      }
      if (
        targetOrderIndex < 0 ||
        targetOrderIndex >= prev.length ||
        currentIndex === targetOrderIndex
      ) {
        return prev;
      }

      const next = [...prev];
      const [moved] = next.splice(currentIndex, 1);
      next.splice(targetOrderIndex, 0, moved!);
      return next;
    });
  };

  const handleDirectMappingDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    sourceIndex: number,
  ) => {
    setDirectMappingDraggingSourceIndex(sourceIndex);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(sourceIndex));
  };

  const handleDirectMappingDragOver = (
    event: React.DragEvent<HTMLTableCellElement>,
    orderIndex: number,
  ) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDirectMappingDragOverOrderIndex(orderIndex);
  };

  const handleDirectMappingDrop = (
    event: React.DragEvent<HTMLTableCellElement>,
    targetOrderIndex: number,
  ) => {
    event.preventDefault();
    const rawSourceIndex = event.dataTransfer.getData('text/plain');
    const sourceIndex = Number.isFinite(Number(rawSourceIndex))
      ? Number(rawSourceIndex)
      : directMappingDraggingSourceIndex;

    if (typeof sourceIndex === 'number') {
      moveDirectMappingOutputHeaderTo(sourceIndex, targetOrderIndex);
    }

    setDirectMappingDraggingSourceIndex(null);
    setDirectMappingDragOverOrderIndex(null);
  };

  const handleDirectMappingDragEnd = () => {
    setDirectMappingDraggingSourceIndex(null);
    setDirectMappingDragOverOrderIndex(null);
  };

  const handleAddDirectMappingSourceToOutput = (sourceIndex: number) => {
    setDirectMappingOutputOrder((prev) => {
      if (prev.includes(sourceIndex)) return prev;
      return [...prev, sourceIndex];
    });
  };

  const handleCreateDirectMappingFormat = () => {
    const finalColumns = directMappingOutputOrder
      .map((outputIndex) => ({
        sourceHeader: getDirectMappingSourceHeaderName(outputIndex),
        outputHeader: getDirectMappingOutputHeaderName(outputIndex),
      }));

    if (finalColumns.length === 0) {
      alert('최종 출력에 포함할 항목을 1개 이상 남겨 주세요.');
      return;
    }

    const emptyColumn = finalColumns.find((column) => !column.outputHeader);
    if (emptyColumn) {
      alert('2번 행의 변경할 헤더명을 모두 입력해 주세요.');
      return;
    }

    const seenHeaders = new Set<string>();
    const duplicateHeader = finalColumns.find((column) => {
      const normalized = column.outputHeader.replace(/\s/g, '').toLowerCase();
      if (seenHeaders.has(normalized)) return true;
      seenHeaders.add(normalized);
      return false;
    });

    if (duplicateHeader) {
      alert(`중복된 최종 출력 헤더가 있습니다: ${duplicateHeader.outputHeader}`);
      return;
    }

    setDirectMappingPendingColumns(finalColumns);
    setDirectMappingConfirmModalOpen(true);
  };

  const handleConfirmDirectMappingFormat = async () => {
    const activeBridge = getActiveTemplateBridgeFile();
    const finalColumns = directMappingPendingColumns;
    if (finalColumns.length === 0) {
      alert('확인할 출력 순서가 없습니다. 수정하기를 눌러 출력 항목을 추가해 주세요.');
      return;
    }

    const finalHeaders = finalColumns.map((column) => column.outputHeader);
    const directHeaderMappings = finalColumns.reduce<DirectHeaderMapping>((acc, column) => {
      acc[column.outputHeader] = column.sourceHeader || null;
      return acc;
    }, {});

    setIsDirectMappingRegistering(true);
    let directBaseHeaderMappings: Record<string, string | null>;
    try {
      const sampleCleanInput = directMappingSampleCleanInputRef.current;
      if (sampleCleanInput && sampleCleanInput.headers.length > 0) {
        try {
          directBaseHeaderMappings = await buildDirectBaseHeaderMappingsForUserCustomFormat({
            outputHeaders: finalHeaders,
            directHeaderMappings,
            cleanInputFile: sampleCleanInput,
            fileSessionId: crypto.randomUUID(),
            trialHeader: trialMode,
          });
        } catch (error) {
          console.error('사용자 지정양식 기준헤더 매핑 생성 실패:', error);
          directBaseHeaderMappings = inferDirectBaseHeaderMappings(
            finalHeaders,
            directHeaderMappings,
          );
        }
      } else {
        directBaseHeaderMappings = inferDirectBaseHeaderMappings(
          finalHeaders,
          directHeaderMappings,
        );
      }
    } finally {
      setIsDirectMappingRegistering(false);
    }

    const directBridgeFile: TemplateBridgeFile = {
      ...(activeBridge ?? createEmptyTemplateBridgeShell()),
      courierHeaders: finalHeaders,
      mappedBaseHeaders: finalHeaders.map(() => null),
      unknownHeaders: [],
      directHeaderMappings,
      directSourceHeaders: [...directMappingSourceHeaders],
      directBaseHeaderMappings,
    };
    const template = buildCourierTemplateFromHeaders(finalHeaders);
    const formatName = USER_CUSTOM_FORMAT_NAME;
    const directFormatId = saveRecentExcelFormat(
      template,
      setRecentExcelFormats,
      trialMode,
      userId,
      directBridgeFile,
      formatName,
    );

    setTemplateBridgeFile(directBridgeFile);
    setCourierUploadTemplate(template);
    saveCourierUploadTemplate(template, trialMode, userId);
    if (directFormatId) {
      setTempSelectedFormatId(directFormatId);
      setShowRecentTemplate(true);
    }

    if (typeof window !== 'undefined') {
      try {
        if (trialMode) {
          localStorage.setItem(TRIAL_LOGISTICS_BRIDGE_KEY, JSON.stringify(directBridgeFile));
        } else {
          writeLocalStorageForUser(LOGISTICS_MAIN_KEYS.bridge, userId, JSON.stringify(directBridgeFile));
        }
      } catch (error) {
        console.error('localStorage에 직접 연결 bridgeFile을 저장하는 중 오류 발생:', error);
      }
    }

    setDirectMappingModalOpen(false);
    setDirectMappingConfirmModalOpen(false);
    directMappingSampleCleanInputRef.current = null;
    applyPreviewWorkspaceReset();
    setIsTemplateChangeReuploadModalOpen(true);
    setRegistrationSuccessMessage('사용자 지정양식이 등록되었습니다. 이 양식에 맞는 주문파일을 다시 첨부해 주세요.');
    setTimeout(() => {
      setRegistrationSuccessMessage(null);
    }, 5000);
  };

  const handleDeleteFormat = (formatId: string) => {
    const formats = loadRecentExcelFormats(trialMode, trialMode ? null : userId);
    const formatToDelete = formats.find((format) => format.id === formatId);
    if (isProtectedFormat(formatToDelete, trialMode)) {
      alert('체험용 예시 양식은 삭제할 수 없습니다.');
      return;
    }
    if (!confirm('이 양식을 삭제하시겠습니까?')) return;
    try {
      if (!trialMode && formatToDelete && isDefaultCjSeedFormat(formatToDelete)) {
        setDefaultCjAutoSeedOptOutForUserIds(templateScopeUserIds, LOGISTICS_DEFAULT_CJ_OPT_OUT_KEY);
        for (const uid of templateScopeUserIds) {
          saveCourierUploadTemplate(null, false, uid);
          removeLocalStorageForUser(LOGISTICS_MAIN_KEYS.bridge, uid);
        }
        setCourierUploadTemplate(null);
        setTemplateBridgeFile(null);
      } else if (
        formatToDelete &&
        courierUploadTemplate &&
        Array.isArray(courierUploadTemplate.headers)
      ) {
        const currentHeaders = courierUploadTemplate.headers
          .filter((header) => !header.isEmpty && header.name.trim() !== '')
          .map((header) => header.name);
        const formatHeaders = formatToDelete.columnOrder || [];
        
        // 헤더 배열이 일치하는지 확인
        if (currentHeaders.length === formatHeaders.length &&
            currentHeaders.every((header, index) => header === formatHeaders[index])) {
          // 현재 사용 중인 템플릿이면 초기화
          setCourierUploadTemplate(null);
          saveCourierUploadTemplate(null, trialMode, userId);
          // bridgeFile도 함께 삭제
          if (typeof window !== 'undefined') {
            try {
              if (trialMode) {
                localStorage.removeItem(TRIAL_LOGISTICS_BRIDGE_KEY);
              } else {
                removeLocalStorageForUser(LOGISTICS_MAIN_KEYS.bridge, userId);
              }
              setTemplateBridgeFile(null);
            } catch (error) {
              console.error('localStorage에서 bridgeFile을 삭제하는 중 오류 발생:', error);
            }
          }
        }
      }
      
      const updatedFormats = formats.filter((format) => format.id !== formatId);
      persistLogisticsRecentFormats(trialMode, userId, updatedFormats);
      setRecentExcelFormats(updatedFormats);

      if (tempSelectedFormatId === formatId) {
        setTempSelectedFormatId(null);
      }
    } catch (error) {
      console.error('양식을 삭제하는 중 오류 발생:', error);
    }
  };

  const handleCloseEmptyDataModal = () => {
    setIsEmptyDataModalOpen(false);
  };

  const handleOpenSenderModal = () => {
    if (!ensureCourierTemplateReady('fixed-input')) return;
    fixedInputAtModalOpenRef.current = { ...fixedHeaderValues };
    setIsSenderModalOpen(true);
  };

  const applyFixedInputChangeToPreview = useCallback(() => {
    if (!templateBridgeFile || previewRows.length === 0) return;

    const headers =
      courierHeaders.length > 0
        ? courierHeaders
        : templateBridgeFile.courierHeaders;

    const reapplied = reapplyFixedInputToPreviewRows({
      previewRows,
      orderSnapshotsByRowId: orderStandardRowsByRowId,
      template: templateBridgeFile,
      fixedInput: fixedHeaderValues,
      previousFixedInput: fixedInputAtModalOpenRef.current,
      userOverrides,
    });

    const { rows } = computeAutoColumnMappingApply(reapplied, headers, userId);
    setPreviewRows(rows);
  }, [
    templateBridgeFile,
    previewRows,
    orderStandardRowsByRowId,
    fixedHeaderValues,
    userOverrides,
    courierHeaders,
    userId,
  ]);

  const handleCloseSenderModal = () => {
    setIsSenderModalOpen(false);
    applyFixedInputChangeToPreview();
  };

  const handleCloseNoTemplateModal = () => {
    setIsNoTemplateModalOpen(false);
  };

  const handleOpenCourierTemplateFromNoTemplateModal = () => {
    setIsNoTemplateModalOpen(false);
    handleOpenCourierTemplateModal();
  };

  const readDefaultCjIntroSuppressUntil = useCallback((): number | null => {
    const raw = readLocalStorageWithLegacyMigrate(
      DEFAULT_CJ_INTRO_SUPPRESS_KEY,
      templateStorageUserId,
    );
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  }, [templateStorageUserId]);

  const writeDefaultCjIntroSuppressUntil = useCallback(
    (expiresAt: number | null) => {
      if (expiresAt === null) {
        removeLocalStorageForUser(DEFAULT_CJ_INTRO_SUPPRESS_KEY, templateStorageUserId);
        return;
      }
      writeLocalStorageForUser(
        DEFAULT_CJ_INTRO_SUPPRESS_KEY,
        templateStorageUserId,
        String(expiresAt),
      );
    },
    [templateStorageUserId],
  );

  const handleCloseTemplateOnboardingModal = useCallback(() => {
    setDefaultCjIntroAcknowledged(
      templateStorageUserId,
      LOGISTICS_DEFAULT_CJ_INTRO_ACKNOWLEDGED_KEY,
    );
    if (dontShowTemplateGuideForWeek) {
      const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
      writeDefaultCjIntroSuppressUntil(Date.now() + oneWeekMs);
    }
    setDismissedTemplateGuideThisVisit(true);
    setIsTemplateOnboardingModalOpen(false);
    setDontShowTemplateGuideForWeek(false);
  }, [dontShowTemplateGuideForWeek, templateStorageUserId, writeDefaultCjIntroSuppressUntil]);

  const handleGoTemplateRegistrationFromOnboarding = useCallback(() => {
    setDefaultCjIntroAcknowledged(
      templateStorageUserId,
      LOGISTICS_DEFAULT_CJ_INTRO_ACKNOWLEDGED_KEY,
    );
    setDismissedTemplateGuideThisVisit(true);
    setIsTemplateOnboardingModalOpen(false);
    setDontShowTemplateGuideForWeek(false);
    handleOpenCourierTemplateModal();
  }, [templateStorageUserId]);

  useLayoutEffect(() => {
    if (trialMode || !authAssetsReady || !workspaceStorageHydrated) {
      setIsTemplateOnboardingModalOpen(false);
      return;
    }

    if (!isUsingDefaultCjTemplate) {
      setIsTemplateOnboardingModalOpen(false);
      setDismissedTemplateGuideThisVisit(false);
      return;
    }
    if (dismissedTemplateGuideThisVisit) {
      setIsTemplateOnboardingModalOpen(false);
      return;
    }

    if (
      isDefaultCjIntroAcknowledged(
        templateStorageUserId,
        LOGISTICS_DEFAULT_CJ_INTRO_ACKNOWLEDGED_KEY,
      )
    ) {
      setIsTemplateOnboardingModalOpen(false);
      return;
    }

    const suppressUntil = readDefaultCjIntroSuppressUntil();
    if (suppressUntil && suppressUntil > Date.now()) {
      setIsTemplateOnboardingModalOpen(false);
      return;
    }

    setIsTemplateOnboardingModalOpen(true);
  }, [
    trialMode,
    authAssetsReady,
    workspaceStorageHydrated,
    isUsingDefaultCjTemplate,
    dismissedTemplateGuideThisVisit,
    readDefaultCjIntroSuppressUntil,
    templateStorageUserId,
  ]);

  const processOrderInputFiles = async (files: File[]) => {
    if (files.length === 0) return;
    if (!ensureLoggedInForOrderInput()) return;

    const supportedFiles = files.filter((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      const fileType = file.type || '';
      return (
        extension === 'xlsx' ||
        extension === 'xls' ||
        extension === 'zip' ||
        extension === 'jpg' ||
        extension === 'jpeg' ||
        extension === 'png' ||
        extension === 'gif' ||
        extension === 'webp' ||
        fileType.startsWith('image/')
      );
    });
    setSelectedFiles(supportedFiles);

    const seenExcelKeys = new Set(
      previewRows.length > 0
        ? uploadedFileMeta.map((file) => `${file.name}:${file.size}`)
        : [],
    );
    const excelFiles: File[] = [];
    let duplicateExcelCount = 0;
    const unsupportedFileNames: string[] = [];

    for (const file of files) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      const fileType = file.type || '';

      if (extension === 'xlsx' || extension === 'xls' || extension === 'zip') {
        const key = `${file.name}:${file.size}`;
        if (seenExcelKeys.has(key)) {
          duplicateExcelCount += 1;
          continue;
        }

        seenExcelKeys.add(key);
        if (!ensureCourierTemplateReady('convert')) return;

        setUploadedExcelFile(file);
        excelFiles.push(file);
        continue;
      }

      if (
        extension === 'jpg' ||
        extension === 'jpeg' ||
        extension === 'png' ||
        extension === 'gif' ||
        extension === 'webp' ||
        fileType.startsWith('image/')
      ) {
        await handleImageFileSelect(file);
        continue;
      }

      unsupportedFileNames.push(file.name);
    }

    if (excelFiles.length === 1) {
      await parseExcelFile(excelFiles[0]);
    } else if (excelFiles.length > 1) {
      const chunks = (
        await Promise.all(
          excelFiles.map((file) => parseExcelFile(file, { appendPreview: false })),
        )
      ).filter((chunk): chunk is ParsedExcelPreviewChunk => Boolean(chunk));

      if (chunks.length > 0) {
        const rowsToAdd = chunks.flatMap((chunk) => chunk.previewRows);
        const rowIdsToAdd = chunks.flatMap((chunk) => chunk.rowIds);
        const mergedUnknownHeaders = chunks.reduce<string[]>(
          (acc, chunk) => mergeUnknownHeaders(acc, chunk.unknownHeaders),
          [],
        );
        const mergedUnknownHeaderSamples = chunks.reduce<UnknownHeaderSamples>(
          (acc, chunk) => mergeUnknownHeaderSamples(acc, chunk.unknownHeaderSamples),
          {},
        );
        setProductCodeMappingNotice(null);
        resetProductCodeColumnToggle();
        if (mergedUnknownHeaders.length > 0) {
          setUnknownHeadersWarning((prev) => mergeUnknownHeaders(prev, mergedUnknownHeaders));
          setUnknownHeaderSamples((prev) =>
            mergeUnknownHeaderSamples(prev, mergedUnknownHeaderSamples),
          );
        }
        setPreviewRows((prev) =>
          prependPreviewRowsWithAutoMapping(
            rowsToAdd,
            chunks[chunks.length - 1].courierHeaders,
            prev,
          ),
        );
        setOrderStandardRowsByRowId((prev) =>
          chunks.reduce(
            (acc, chunk) =>
              registerOrderSnapshotsForPreviewChunk(acc, chunk.rowIds, chunk.standardRows),
            prev,
          ),
        );
        setNewRows((prev) => {
          const updated = new Set(prev);
          rowIdsToAdd.forEach((id) => updated.add(id));
          return updated;
        });
        setTimeout(() => {
          setNewRows((prev) => {
            const updated = new Set(prev);
            rowIdsToAdd.forEach((id) => updated.delete(id));
            return updated;
          });
        }, 3000);
        setCourierHeaders(chunks[chunks.length - 1].courierHeaders);
        setUploadedFileMeta((prev) => [
          ...chunks.map((chunk) => ({ name: chunk.file.name, size: chunk.file.size })),
          ...prev,
        ]);
        setStage2ChunkLabel(null);
        setFileProcessingStatus("done");
        const completionToken = fileProcessingTokenRef.current;
        setTimeout(() => {
          if (fileProcessingTokenRef.current === completionToken) {
            setFileProcessingStatus("idle");
          }
        }, 1500);
      } else {
        setStage2ChunkLabel(null);
        setFileProcessingStatus("idle");
      }
    }

    if (duplicateExcelCount > 0) {
      alert(`${duplicateExcelCount}개 파일은 이미 업로드되어 건너뛰었습니다.`);
    }

    if (unsupportedFileNames.length > 0) {
      const sample = unsupportedFileNames.slice(0, 5).join(', ');
      const suffix = unsupportedFileNames.length > 5 ? ` 외 ${unsupportedFileNames.length - 5}개` : '';
      alert(`지원하지 않는 파일 형식입니다: ${sample}${suffix}`);
    }
  };

  const handleExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    void processOrderInputFiles(files);
    // input 초기화하여 같은 파일을 다시 선택할 수 있도록 함
    if (e.target) {
      e.target.value = '';
    }
  };

  // 이미지 파일 선택 및 OCR 자동 실행 (이미지 변환)
  const handleImageFileSelect = async (file: File) => {
    if (!ensureLoggedInForOrderInput()) return;

    setSelectedImage(file);
    recordWorkspaceInput('image');
    setErrorMessageTextImage(null);

    // 텍스트 정리 중 모달 열기 (이미지 파일로 표시)
    setTextProcessingSource('imageFile');
    setShowTextProcessingModal(true);
    setScreenshotStage('processing');

    try {
      setIsProcessingTextImage(true);

      const ocrText = await extractTextFromImage(file);

      setTextInput(ocrText);
      pendingImageOcrTextConvertRef.current = true;

      setScreenshotStage('completed');

    } catch (error) {
      setErrorMessageTextImage(
        error instanceof Error ? error.message : 'OCR 처리 중 오류가 발생했습니다.'
      );
      setScreenshotStage('idle');
      setShowTextProcessingModal(false);
    } finally {
      setIsProcessingTextImage(false);
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 스크린샷 물류 주문 변환 모달 닫기
  const handleScreenshotModalClose = () => {
    // 처리 중단 플래그 설정
    if (screenshotStage === 'processing') {
      isCancelledRef.current = true;
    }
    
    setShowScreenshotModal(false);
    setScreenshotImagePreview(null);
    setScreenshotStage('idle');
    setErrorMessageTextImage(null);
    isCancelledRef.current = false;
  };

  // 클립보드 붙여넣기 처리
  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    
    const items = e.clipboardData.items;
    let imageFound = false;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // 이미지 타입 확인
      if (item.type.indexOf('image') !== -1) {
        imageFound = true;
        const blob = item.getAsFile();
        if (blob) {
          // 스크린샷 모달 닫기
          setShowScreenshotModal(false);
          
          // 텍스트 정리 중 모달 열기
          setShowTextProcessingModal(true);
          
          // 이미지 처리 시작
          await handleScreenshotImageProcess(blob);
        }
        break;
      }
    }

    // 이미지가 없으면 contentEditable 내용 제거
    if (!imageFound && screenshotPasteAreaRef.current) {
      setTimeout(() => {
        if (screenshotPasteAreaRef.current) {
          screenshotPasteAreaRef.current.textContent = '';
          screenshotPasteAreaRef.current.innerHTML = '';
        }
      }, 0);
    }
  };

  // contentEditable에서 텍스트 입력 방지 (이미지 미리보기는 유지)
  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    // contentEditable의 텍스트만 제거 (이미지 미리보기는 state로 관리되므로 유지됨)
    // 이미지 미리보기가 있을 때는 contentEditable 내용을 제거하지 않음
    // (이미지 미리보기가 state로 표시되므로 contentEditable 내용은 무시)
    if (screenshotPasteAreaRef.current && screenshotStage === 'idle') {
      // idle에서만 contentEditable 텍스트 제거
      screenshotPasteAreaRef.current.textContent = '';
      screenshotPasteAreaRef.current.innerHTML = '';
    }
  };

  // 스크린샷 이미지 처리 및 텍스트 추출
  const handleScreenshotImageProcess = async (blob: Blob) => {
    // 취소 플래그 초기화
    isCancelledRef.current = false;
    
    // 텍스트 정리 중 모달 열기 (스크린샷으로 표시)
    setTextProcessingSource('screenshot');
    setShowTextProcessingModal(true);
    setScreenshotStage('processing');
    recordWorkspaceInput('image');
    setErrorMessageTextImage(null);

    try {
      // Blob을 File로 변환
      const file = new File([blob], 'screenshot.png', { type: 'image/png' });

      // 기존 OCR 로직 사용 (extractTextFromImage)
      const extractedText = await extractTextFromImage(file);

      // 취소 여부 확인
      if (isCancelledRef.current) {
        setScreenshotStage('idle');
        setShowTextProcessingModal(false);
        return;
      }

      if (extractedText && extractedText.trim()) {
        // 취소 여부 재확인
        if (isCancelledRef.current) {
          setScreenshotStage('idle');
          setShowTextProcessingModal(false);
          return;
        }

        setTextInput(extractedText);
        pendingImageOcrTextConvertRef.current = true;

        setScreenshotStage('completed');
        // 모달은 완료 상태로 유지 (사용자가 확인 버튼을 눌러야 닫힘)
      } else {
        if (!isCancelledRef.current) {
          setErrorMessageTextImage('이미지에서 텍스트를 추출할 수 없습니다.');
          setScreenshotStage('idle');
          setShowTextProcessingModal(false);
        }
      }
    } catch (error) {
      if (!isCancelledRef.current) {
        console.error('[LogisticsConvertPage] 스크린샷 이미지 처리 중 오류:', error);
        setErrorMessageTextImage(
          error instanceof Error ? error.message : '이미지 처리 중 오류가 발생했습니다.'
        );
        setScreenshotStage('idle');
        setShowTextProcessingModal(false);
      }
    }
  };

  // 모달 열릴 때 취소 플래그 초기화 및 붙여넣기 이벤트 리스너 등록
  useEffect(() => {
    if (showScreenshotModal) {
      // 모달이 열릴 때 취소 플래그 및 상태 초기화
      isCancelledRef.current = false;
      setScreenshotStage('idle');
      setErrorMessageTextImage(null);
    }

    if (showScreenshotModal && screenshotPasteAreaRef.current) {
      const pasteArea = screenshotPasteAreaRef.current;
      
      const handlePasteEvent = async (e: ClipboardEvent) => {
        e.preventDefault();
        const items = e.clipboardData?.items;
        let imageFound = false;

        if (items) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            if (item.type.indexOf('image') !== -1) {
              imageFound = true;
              const blob = item.getAsFile();
              if (blob) {
                // 스크린샷 모달 닫기
                setShowScreenshotModal(false);
                
                // 텍스트 정리 중 모달 열기
                setShowTextProcessingModal(true);
                
                // 이미지 처리 시작
                await handleScreenshotImageProcess(blob);
              }
              break;
            }
          }
        }

        // 이미지가 없으면 contentEditable 내용 제거
        if (!imageFound && screenshotPasteAreaRef.current) {
          setTimeout(() => {
            if (screenshotPasteAreaRef.current) {
              screenshotPasteAreaRef.current.textContent = '';
              screenshotPasteAreaRef.current.innerHTML = '';
            }
          }, 0);
        }
      };

      pasteArea.addEventListener('paste', handlePasteEvent);
      pasteArea.focus();

      return () => {
        pasteArea.removeEventListener('paste', handlePasteEvent);
      };
    }
  }, [showScreenshotModal]);
  
  const formatNextRechargeDate = (dateLike?: string | null): string => {
    if (!dateLike) return '다음 충전일 미정';
    const parsed = new Date(dateLike);
    if (Number.isNaN(parsed.getTime())) return '다음 충전일 미정';
    return `${parsed.getFullYear()}.${String(parsed.getMonth() + 1).padStart(2, '0')}.${String(parsed.getDate()).padStart(2, '0')}`;
  };

  const buildInsufficientPointsMessage = (
    plan: 'FREE' | 'PRO' | 'YEARLY',
    nextPointDate?: string | null,
    feedbackTrialEndsAt?: string | null,
    adminTrialEndsAt?: string | null,
  ): string => {
    const nextDateLabel = formatNextRechargeDate(nextPointDate);
    if (!hasProEntitlementClient(plan, feedbackTrialEndsAt, adminTrialEndsAt)) {
      return `사용량이 부족합니다.\n다음 충전일(${nextDateLabel})까지 기다리거나 플랜 업그레이드 후 이용해 주세요.`;
    }
    return `사용량이 부족합니다.\n다음 충전일(${nextDateLabel})까지 기다려 주세요.`;
  };

  // 사용량 차감 헬퍼 함수
  const usePoints = async (
    amount: number,
    type: 'text' | 'download',
    options?: { redirectOnAuthRequired?: boolean },
  ): Promise<boolean> => {
    const redirectOnAuthRequired = options?.redirectOnAuthRequired ?? true;
    if (trialMode) {
      if (type === 'download') return false;
      const current = readTrialPointsFromStorage();
      if (current < amount) {
        alert(formatTrialTextQuotaShortfall(current, amount));
        return false;
      }
      const next = current - amount;
      writeTrialPointsToStorage(next);
      setTrialPoints(next);
      return true;
    }

    // 현재 사용자 정보 가져오기 (최신 상태)
    let currentUser = useUserStore.getState().user;
    
    if (!currentUser) {
      // 사용자 정보 다시 가져오기 시도
      try {
        await fetchUser();
        currentUser = useUserStore.getState().user;
        if (!currentUser) {
          if (redirectOnAuthRequired) {
            alert('로그인이 필요합니다. 로그인 페이지로 이동합니다.');
            router.push('/auth/login');
          }
          return false;
        }
      } catch (error) {
        console.error('[usePoints] 사용자 정보 가져오기 실패:', error);
        if (redirectOnAuthRequired) {
          alert('로그인이 필요합니다. 로그인 페이지로 이동합니다.');
          router.push('/auth/login');
        }
        return false;
      }
    }

    if (currentUser.points < amount) {
      await useUserStore.getState().prepareForPointCharge(amount);
      currentUser = useUserStore.getState().user;
      if (!currentUser) {
        if (redirectOnAuthRequired) {
          alert('로그인이 필요합니다. 로그인 페이지로 이동합니다.');
          router.push('/auth/login');
        }
        return false;
      }
    }

    // 사용량 부족 확인
    if (currentUser.points < 1) {
      alert(
        buildInsufficientPointsMessage(
          currentUser.plan,
          currentUser.nextPointDate ?? currentUser.lastMonthlyGrant ?? null,
          currentUser.feedbackTrialEndsAt,
          currentUser.adminTrialEndsAt,
        ),
      );
      return false;
    }

    try {
      const response = await fetch('/api/user/use-points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          amount,
          type,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (data.error === '사용량이 부족합니다.') {
          alert(
            buildInsufficientPointsMessage(
              currentUser.plan,
              (data.nextPointDate as string | null | undefined) ?? currentUser.nextPointDate ?? currentUser.lastMonthlyGrant ?? null,
              currentUser.feedbackTrialEndsAt,
              currentUser.adminTrialEndsAt,
            ),
          );
          return false;
        }
        throw new Error(data.error || '사용량 차감 실패');
      }

      const result = await response.json();
      if (result.success && result.user) {
        // Zustand store 업데이트
        updatePoints(result.user.points, result.user.monthlyPoints, result.user.nextPointDate);
        if (result.user.points === 0) {
          alert(`이번 작업으로 사용량이 모두 소진되었습니다.\n다음 충전일: ${formatNextRechargeDate(result.user.nextPointDate ?? currentUser.nextPointDate ?? currentUser.lastMonthlyGrant ?? null)}`);
        }
        return true;
      }

      return false;
    } catch (error) {
      console.error('[LogisticsConvertPage] 사용량 차감 중 오류:', error);
      return false;
    }
  };

  // 텍스트 물류 주문 변환 처리 (실제 변환 로직)
  const rollbackTextConvertPreviewRows = useCallback((rowIds: string[]) => {
    if (rowIds.length === 0) return;
    const idSet = new Set(rowIds);
    setPreviewRows((prev) => prev.filter((row) => !idSet.has(row.rowId)));
    setOrderStandardRowsByRowId((prev) => pruneOrderSnapshotsForRowIds(prev, idSet));
    setNewRows((prev) => {
      const updated = new Set(prev);
      rowIds.forEach((id) => updated.delete(id));
      return updated;
    });
  }, []);

  const handleTextConvert = async () => {
    if (textConvertInFlightRef.current || isProcessingTextImage || textConvertReviewModal !== null) {
      return;
    }
    setErrorMessageTextImage(null);

    if (!ensureCourierTemplateReady('convert')) return;

    const trimmed = textInput.trim();
    if (!trimmed) {
      setErrorMessageTextImage('변환할 텍스트를 입력해 주세요.');
      return;
    }

    const textLength = trimmed.length;

    if (trialMode) {
      const tp = trialPoints ?? readTrialPointsFromStorage();
      if (tp <= 0) {
        setErrorMessageTextImage(TRIAL_TEXT_QUOTA_EXHAUSTED_MESSAGE);
        return;
      }
      if (tp < textLength) {
        setErrorMessageTextImage(formatTrialTextQuotaShortfall(tp, textLength));
        return;
      }
    } else {
      if (!user) {
        setRequiresAccountModalOpen(true);
        return;
      }

      if (user.points < 1) {
        setErrorMessageTextImage('사용량이 부족합니다');
        return;
      }
    }

    textConvertInFlightRef.current = true;
    setIsProcessingTextImage(true);
    setTextConvertStatusLabel(null);
    setStage2ChunkLabel(null);
    try {
      if (pendingImageOcrTextConvertRef.current) {
        pendingImageOcrTextConvertRef.current = false;
      } else {
        recordWorkspaceInput('text');
      }

      setTextConvertStatusLabel('물류 주문 텍스트 분석 중…');
      const adapterResult = await runTextToCleanInputAdapter(trimmed);
      const { normalizeMeta: _normalizeMeta, ...cleanInputFile } = adapterResult;
      if (!cleanInputFile.rows.length) {
        setQualityNoticeModal('convert_failed');
        return;
      }

      const activeTemplateBridgeFile = getActiveTemplateBridgeFile();
      if (activeTemplateBridgeFile && hasDirectHeaderMappings(activeTemplateBridgeFile)) {
        setTextConvertStatusLabel('등록된 양식에 맞추는 중…');
        const standardRows = buildStandardRowsFromBaseHeaderMatrix(
          cleanInputFile.headers,
          cleanInputFile.rows,
        );
        const mergedPreviewRows = buildDirectPreviewRowsFromStandardRows(
          standardRows,
          activeTemplateBridgeFile,
          fixedHeaderValues,
        );
        const newRowIds = mergedPreviewRows.map(() => crypto.randomUUID());
        const previewRowsWithIds = mergedPreviewRows.map((row, index) => ({
          rowId: newRowIds[index]!,
          data: row,
        }));

        setUnknownHeadersWarning([]);
        setUnknownHeaderSamples({});
        setOrderStandardFile(null);
        setPreviewRows((prev) => [...previewRowsWithIds, ...prev]);
        setOrderStandardRowsByRowId((prev) =>
          registerOrderSnapshotsForPreviewChunk(prev, newRowIds, mergedPreviewRows),
        );
        setNewRows((prev) => {
          const updated = new Set(prev);
          newRowIds.forEach((id) => updated.add(id));
          return updated;
        });
        setTimeout(() => {
          setNewRows((prev) => {
            const updated = new Set(prev);
            newRowIds.forEach((id) => updated.delete(id));
            return updated;
          });
        }, 3000);
        setCourierHeaders(activeTemplateBridgeFile.courierHeaders);

        const effectiveMappedBaseHeaders = buildEffectiveMappedBaseHeaders(activeTemplateBridgeFile);
        setTextInput('');
        setTextConvertPointsPending(true);
        setTextConvertReviewModal({
          originalText: trimmed,
          rows: buildTextConvertReviewRows(
            newRowIds,
            mergedPreviewRows,
            activeTemplateBridgeFile.courierHeaders,
            activeTemplateBridgeFile.mappedBaseHeaders,
            effectiveMappedBaseHeaders,
          ),
        });

        const rowIdsToRollback = newRowIds;
        void (async () => {
          let pendingReleasedByTimeout = false;
          const pendingReleaseTimer = window.setTimeout(() => {
            pendingReleasedByTimeout = true;
            setTextConvertPointsPending(false);
            void fetchUser();
          }, 15_000);

          const pointsDeducted = await usePoints(textLength, 'text', {
            redirectOnAuthRequired: false,
          });
          window.clearTimeout(pendingReleaseTimer);
          if (!pointsDeducted) {
            if (!pendingReleasedByTimeout) {
              rollbackTextConvertPreviewRows(rowIdsToRollback);
              setTextConvertReviewModal(null);
            } else {
              void fetchUser();
            }
            setTextConvertPointsPending(false);
            return;
          }
          setTextConvertPointsPending(false);
        })();
        return;
      }

      const fileSessionId = crypto.randomUUID();
      setTextConvertStatusLabel('물류 양식에 맞추는 중…');
      const pipelineResult = await runUnifiedInputOrderPipelines({
        cleanInputFile: {
          ...cleanInputFile,
          headers: [...cleanInputFile.headers],
          rows: cleanInputFile.rows.map((r) => [...r]),
        },
        templateBridgeFile,
        fixedHeaderValues,
        fileSessionId,
        onStage2ChunkProgress: (completed, total) => {
          if (total > 1) {
            setStage2ChunkLabel(`서버 변환 ${completed}/${total}`);
          }
        },
      });

      if (!pipelineResult.mergeResult) {
        setErrorMessageTextImage(
          trialMode
            ? '텍스트 주문 변환에 실패했습니다. 다시 시도해주세요.'
            : '텍스트 물류 주문 변환에 실패했습니다. 다시 시도해주세요.',
        );
        return;
      }

      const appendResult = handleUnifiedPipelinesCompleted(pipelineResult, cleanInputFile);
      if (!appendResult) {
        setErrorMessageTextImage(
          trialMode
            ? '텍스트 주문 변환에 실패했습니다. 다시 시도해주세요.'
            : '텍스트 물류 주문 변환에 실패했습니다. 다시 시도해주세요.',
        );
        return;
      }

      setTextInput('');
      setTextConvertPointsPending(true);
      setTextConvertReviewModal({
        originalText: trimmed,
        rows: buildTextConvertReviewRows(
          appendResult.newRowIds,
          appendResult.previewRows,
          appendResult.courierHeaders,
          templateBridgeFile?.mappedBaseHeaders,
        ),
      });

      const rowIdsToRollback = appendResult.newRowIds;
      void (async () => {
        let pendingReleasedByTimeout = false;
        const pendingReleaseTimer = window.setTimeout(() => {
          pendingReleasedByTimeout = true;
          setTextConvertPointsPending(false);
          void fetchUser();
        }, 15_000);

        const pointsDeducted = await usePoints(textLength, 'text', {
          redirectOnAuthRequired: false,
        });
        window.clearTimeout(pendingReleaseTimer);
        if (!pointsDeducted) {
          if (!pendingReleasedByTimeout) {
            rollbackTextConvertPreviewRows(rowIdsToRollback);
            setTextConvertReviewModal(null);
          } else {
            void fetchUser();
          }
          setTextConvertPointsPending(false);
          return;
        }
        setTextConvertPointsPending(false);
      })();
    } catch (error) {
      console.error('[LogisticsConvertPage] 텍스트 물류 주문 변환 중 오류:', error);
      const noticeKind = resolveNormalizeQualityNotice(error, isLikelyClientNetworkError);
      if (noticeKind) {
        setQualityNoticeModal(noticeKind);
        setErrorMessageTextImage(null);
      } else {
        setErrorMessageTextImage(
          error instanceof Error ? error.message : '텍스트를 변환하는 중 알 수 없는 오류가 발생했습니다.',
        );
      }
    } finally {
      setIsProcessingTextImage(false);
      setTextConvertStatusLabel(null);
      setStage2ChunkLabel(null);
      textConvertInFlightRef.current = false;
    }
  };

  // 텍스트 물류 주문 변환 실행 (모달 확인 후 호출)
  const executeTextConvert = async () => {
    // 오늘은 보지 않기 체크 시 localStorage에 저장
    if (dontShowToday) {
      const today = new Date().toDateString();
      localStorage.setItem("hideLogisticsTextConvertModal", today);
    }
    setShowTextConvertModal(false);
    setDontShowToday(false); // 체크박스 초기화
    await handleTextConvert();
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    void processOrderInputFiles(files);
  };

  const parseExcelFile = async (
    file: File,
    options?: { appendPreview?: boolean },
  ): Promise<ParsedExcelPreviewChunk | null> => {
    const appendPreview = options?.appendPreview ?? true;
    const processingToken = fileProcessingTokenRef.current + 1;
    fileProcessingTokenRef.current = processingToken;
    setFileProcessingStatus("processing");
    setStage2ChunkLabel(null);
    recordWorkspaceInput('excel');
    
    const newOrderSessionId = crypto.randomUUID();
    setOrderFileSessionId(newOrderSessionId);

    if (!trialMode && !user) {
      setFileProcessingStatus('idle');
      setRequiresAccountModalOpen(true);
      return null;
    }

    // 중복 검사 로직
    if (appendPreview && previewRows.length > 0 && uploadedFileMeta.some(
      f => f.name === file.name && f.size === file.size
    )) {
      alert('이미 업로드된 파일입니다.');
      setFileProcessingStatus("idle");
      return null;
    }

    try {
    let buffer: ArrayBuffer;
    try {
      buffer = await unlockExcelFile(file);
    } catch (unlockError) {
      if (unlockError instanceof ExcelUnlockCancelledError) {
        setFileProcessingStatus('idle');
        return null;
      }
      throw unlockError;
    }
    const rawData = readFirstSheetMatrixFromArrayBuffer(buffer);

    const filteredRows = filterNonEmptyRows(rawData);
    const headerIndex = detectHeaderRowIndex(filteredRows);
    const alignedRawData = alignRowsFromHeader(filteredRows, headerIndex);

    // ExcelPreprocessPipeline(Stage0)을 통과하여 CleanInputFile 생성
    const preprocessPipeline = new ExcelPreprocessPipeline();
    const cleanInputFile = preprocessPipeline.run(alignedRawData);
    directMappingSampleCleanInputRef.current = {
      headers: [...cleanInputFile.headers],
      rows: cleanInputFile.rows.map((row) => [...row]),
      sourceType: 'excel',
    };
    setDirectMappingSourceHeaders([...cleanInputFile.headers]);
    setDirectMappingSourceSamples(buildHeaderSamples(cleanInputFile));

    const activeTemplateBridgeFile = getActiveTemplateBridgeFile();
    if (!activeTemplateBridgeFile) {
      setStage2ChunkLabel(null);
      setFileProcessingStatus('idle');
      setNoTemplateModalType('convert');
      setIsNoTemplateModalOpen(true);
      return null;
    }

    if (hasDirectHeaderMappings(activeTemplateBridgeFile)) {
      const directPreviewRows = buildDirectPreviewRowsFromCleanInput(
        cleanInputFile,
        activeTemplateBridgeFile,
        fixedHeaderValues,
      );
      const newRowIds = directPreviewRows.map(() => crypto.randomUUID());
      const newPreviewChunk = directPreviewRows.map((row, index) => ({
        rowId: newRowIds[index]!,
        data: row,
      }));

      setUnknownHeadersWarning([]);
      setUnknownHeaderSamples({});
      setOrderStandardFile(null);

      if (appendPreview) {
        setProductCodeMappingNotice(null);
        resetProductCodeColumnToggle();
        setPreviewRows((prev) =>
          prependPreviewRowsWithAutoMapping(
            newPreviewChunk,
            activeTemplateBridgeFile.courierHeaders,
            prev,
          ),
        );
        setOrderStandardRowsByRowId((prev) =>
          registerOrderSnapshotsForPreviewChunk(
            prev,
            newRowIds,
            directPreviewRows,
          ),
        );
        setNewRows((prev) => {
          const updated = new Set(prev);
          newRowIds.forEach((id) => updated.add(id));
          return updated;
        });
        setTimeout(() => {
          setNewRows((prev) => {
            const updated = new Set(prev);
            newRowIds.forEach((id) => updated.delete(id));
            return updated;
          });
        }, 3000);
        setCourierHeaders(activeTemplateBridgeFile.courierHeaders);
        setUploadedFileMeta((prev) => [
          { name: file.name, size: file.size },
          ...prev,
        ]);
        setStage2ChunkLabel(null);
        setFileProcessingStatus('done');
        setTimeout(() => {
          if (fileProcessingTokenRef.current === processingToken) {
            setFileProcessingStatus('idle');
          }
        }, 1500);
      }

      return {
        file,
        rowIds: newRowIds,
        previewRows: newPreviewChunk,
        standardRows: directPreviewRows,
        courierHeaders: activeTemplateBridgeFile.courierHeaders,
        unknownHeaders: [],
        unknownHeaderSamples: {},
      };
    }

    const { orderStandardFile: stage2Result, headerMapping } = await fetchOrderPipelineStage2(cleanInputFile, newOrderSessionId, {
      trialHeader: trialMode,
      onChunkProgress: (completed, total) => {
        if (total > 1) {
          setStage2ChunkLabel(`서버 변환 ${completed}/${total}`);
        } else {
          setStage2ChunkLabel(null);
        }
      },
    });

    if (headerMapping) {
      logTemplateHeaderUpload(
        buildOrderFileHeaderLogPayload(cleanInputFile.headers, headerMapping, {
          page: 'logistics-convert',
          fileSessionId: newOrderSessionId,
          courierName: courierUploadTemplate?.courierType ?? undefined,
        }),
      );
    }

    if (isExcloudPipelineDebugClient()) {
      try {
        const pcccBaseHeader = '개인통관번호';
        const includes =
          Array.isArray(stage2Result?.baseHeaders) &&
          stage2Result.baseHeaders.includes(pcccBaseHeader);
        const row0 = String(stage2Result?.rows?.[0]?.[pcccBaseHeader] ?? '');

        console.log(
          `[EXCLOAD][DEBUG][PCCC] Stage2 baseHeadersHas=${includes} row0=${row0}`,
        );
        if (typeof window !== 'undefined') {
          (window as unknown as { __EXCLOUD_PCCC_STAGE2?: unknown }).__EXCLOUD_PCCC_STAGE2 =
            {
              baseHeadersHas: includes,
              row0,
              rowsCount: stage2Result?.rows?.length ?? 0,
            };
        }
      } catch {
        // ignore
      }
    }

    const stage2UnknownHeaders = Array.isArray(stage2Result.unknownHeaders)
      ? stage2Result.unknownHeaders
      : [];
    const stage2UnknownHeaderSamples =
      stage2UnknownHeaders.length > 0
        ? buildUnknownHeaderSamples(stage2UnknownHeaders, cleanInputFile)
        : {};

    // unknownHeaders 처리
    if (appendPreview) {
      if (stage2UnknownHeaders.length > 0) {
        setUnknownHeadersWarning((prev) => mergeUnknownHeaders(prev, stage2UnknownHeaders));
        setUnknownHeaderSamples((prev) =>
          mergeUnknownHeaderSamples(prev, stage2UnknownHeaderSamples),
        );
      }
    }
    
    // orderStandardFile 상태는 유지하되, 누적하지 않음 (파일 단위 처리)
    if (appendPreview) {
      setOrderStandardFile(stage2Result);
    }
    
    // Stage3 실행 (handleExcelUpload 내부에서만 실행)
    if (activeTemplateBridgeFile) {
      const stage3Result = await runMergePipeline({
        template: activeTemplateBridgeFile,
        orderData: stage2Result, // ❗ 누적 전체 아님, 현재 파일의 stage2Result만 전달
        fixedInput: fixedHeaderValues,
      });

      if (isExcloudPipelineDebugClient()) {
        try {
          const pcccCourierHeader =
            stage3Result?.courierHeaders?.find((h) =>
              /개인통관번호|PCCC/i.test(String(h)),
            ) ?? null;
          const previewRow0 = pcccCourierHeader
            ? String(stage3Result?.previewRows?.[0]?.[pcccCourierHeader] ?? '')
            : '';
          const idx = pcccCourierHeader
            ? activeTemplateBridgeFile.courierHeaders.indexOf(pcccCourierHeader)
            : -1;
          const mappedBaseHeader =
            idx >= 0 ? activeTemplateBridgeFile.mappedBaseHeaders[idx] ?? null : null;

          console.log(
            `[EXCLOAD][DEBUG][PCCC] Stage3 courierHeader=${pcccCourierHeader} mappedBase=${mappedBaseHeader} previewRow0=${previewRow0}`,
          );
          if (typeof window !== 'undefined') {
            (window as unknown as { __EXCLOUD_PCCC_STAGE3?: unknown }).__EXCLOUD_PCCC_STAGE3 =
              {
                courierHeader: pcccCourierHeader,
                mappedBase: mappedBaseHeader,
                previewRow0,
                previewRowsCount: stage3Result?.previewRows?.length ?? 0,
              };
          }
        } catch {
          // ignore
        }
      }

      if (appendPreview) {
        // Stage3 직후: 자동 상품코드 투영 없음 — 미리보기에는 상품명 등 원문만 두고, 코드는 사용자가 버튼으로 적용
        setProductCodeMappingNotice(null);
        resetProductCodeColumnToggle();
      }

      const projectedPreviewRows = stage3Result.previewRows;

      // previewRows 상단 prepend 구조 적용
      const newRowIds = projectedPreviewRows.map(() => crypto.randomUUID());
      const newPreviewChunk = projectedPreviewRows.map((row, index) => ({
        rowId: newRowIds[index]!,
        data: row,
      }));
      if (appendPreview) {
        setPreviewRows((prev) =>
          prependPreviewRowsWithAutoMapping(
            newPreviewChunk,
            stage3Result.courierHeaders,
            prev,
          ),
        );
        setOrderStandardRowsByRowId((prev) =>
          registerOrderSnapshotsForPreviewChunk(
            prev,
            newRowIds,
            stage2Result.rows ?? [],
          ),
        );
        
        // 새로 생성된 행을 newRows에 추가
        setNewRows(prev => {
          const updated = new Set(prev);
          newRowIds.forEach(id => updated.add(id));
          return updated;
        });
        
        // 3초 후 자동 제거
        setTimeout(() => {
          setNewRows(prev => {
            const updated = new Set(prev);
            newRowIds.forEach(id => updated.delete(id));
            return updated;
          });
        }, 3000);
        setStage2ChunkLabel(null);
        setFileProcessingStatus("done");
        setTimeout(() => {
          if (fileProcessingTokenRef.current === processingToken) {
            setFileProcessingStatus("idle");
          }
        }, 1500);
      }
      
      if (appendPreview) {
        setCourierHeaders(stage3Result.courierHeaders);
      }

      // Stage3 성공 후 메타데이터 저장
      if (appendPreview) {
        setUploadedFileMeta(prev => [
          { name: file.name, size: file.size },
          ...prev
        ]);
      }

      return {
        file,
        rowIds: newRowIds,
        previewRows: newPreviewChunk,
        standardRows: stage2Result.rows ?? [],
        courierHeaders: stage3Result.courierHeaders,
        unknownHeaders: stage2UnknownHeaders,
        unknownHeaderSamples: stage2UnknownHeaderSamples,
      };
    } else {
      console.warn('[UI] Stage3 실행 불가: templateBridgeFile이 없습니다.');
    }
    
    if (typeof window !== 'undefined') {
      (window as any).__lastOrderResult = stage2Result;
      (window as any).__lastOrderFile = file.name;
    }
    return null;
    } catch (error) {
      console.error('[LogisticsConvertClient] parseExcelFile', error);
      setStage2ChunkLabel(null);
      setFileProcessingStatus("idle");
      alert(
        error instanceof Error
          ? error.message
          : '엑셀 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      );
      return null;
    }
  };

  const handleUnifiedPipelinesCompleted = (
    result: UnifiedInputPipelineResult,
    cleanInputFile?: UnknownHeaderSampleInput,
  ) => {
    if (!result.mergeResult) {
      return null;
    }

    // unknownHeaders 처리
    if (result.orderStandardFile?.unknownHeaders?.length > 0) {
      setUnknownHeadersWarning((prev) =>
        mergeUnknownHeaders(prev, result.orderStandardFile.unknownHeaders),
      );
      setUnknownHeaderSamples((prev) =>
        mergeUnknownHeaderSamples(
          prev,
          buildUnknownHeaderSamples(result.orderStandardFile.unknownHeaders, cleanInputFile),
        ),
      );
    }

    const { courierHeaders: mergedCourierHeaders, previewRows: mergedPreviewRows } = result.mergeResult;

    // 자동 상품코드 투영 없음 — 코드 치환은 「상품명→상품코드 변환」 버튼으로만
    setProductCodeMappingNotice(null);
    resetProductCodeColumnToggle();

    const projectedPreviewRows = mergedPreviewRows;

    // Stage3 결과를 현재 미리보기 상단에 추가
    const newRowIds = projectedPreviewRows.map(() => crypto.randomUUID());
    const newPreviewChunk = projectedPreviewRows.map((row, index) => ({
      rowId: newRowIds[index]!,
      data: row,
    }));
    setPreviewRows((prev) =>
      prependPreviewRowsWithAutoMapping(
        newPreviewChunk,
        mergedCourierHeaders,
        prev,
      ),
    );
    setOrderStandardFile(result.orderStandardFile);
    setOrderStandardRowsByRowId((prev) =>
      registerOrderSnapshotsForPreviewChunk(
        prev,
        newRowIds,
        result.orderStandardFile?.rows ?? [],
      ),
    );
    
    // 새로 생성된 행을 newRows에 추가
    setNewRows(prev => {
      const updated = new Set(prev);
      newRowIds.forEach(id => updated.add(id));
      return updated;
    });
    
    // 3초 후 자동 제거
    setTimeout(() => {
      setNewRows(prev => {
        const updated = new Set(prev);
        newRowIds.forEach(id => updated.delete(id));
        return updated;
      });
    }, 3000);

    setCourierHeaders(mergedCourierHeaders);

    return {
      newRowIds,
      previewRows: projectedPreviewRows,
      courierHeaders: mergedCourierHeaders,
    };
  };

  const handleTextConvertReviewConfirm = useCallback(() => {
    setTextConvertReviewModal(null);
    setTextConvertPointsPending(false);
  }, []);

  const handleTextConvertReviewApply = useCallback(
    (overrides: Record<string, Record<string, string>>) => {
      setUserOverrides((prev) => {
        const next = { ...prev };
        for (const [rowId, rowEdits] of Object.entries(overrides)) {
          next[rowId] = {
            ...(next[rowId] ?? {}),
            ...rowEdits,
          };
        }
        return next;
      });
    },
    [],
  );

  const handleDownloadPreview = async () => {
    // 체험판: 양식·데이터 여부와 관계없이 상세 안내 모달 (다른 검증 알림이 뜨지 않도록)
    if (trialMode) {
      setShowTrialDownloadModal(true);
      return;
    }

    if (!courierHeaders || courierHeaders.length === 0) {
      alert("물류센터 양식을 먼저 등록해주세요.");
      return;
    }

    if (!sortedRows || sortedRows.length === 0) {
      alert("다운로드할 주문 데이터가 없습니다.");
      return;
    }

    if (!user) {
      alert('로그인이 필요합니다.');
      router.push('/auth/login');
      return;
    }

    if (shouldChargeDownloadPoints(user.plan, user.feedbackTrialEndsAt, user.adminTrialEndsAt)) {
      if (user.points < 1) {
        alert(
          buildInsufficientPointsMessage(
            user.plan,
            user.nextPointDate ?? user.lastMonthlyGrant ?? null,
            user.feedbackTrialEndsAt,
            user.adminTrialEndsAt,
          ),
        );
        return;
      }
    }

    setDownloadStatus("processing");

    try {
      const excelData = buildPreviewDownloadAoA(courierHeaders, sortedRows, userOverrides);
      const wb = createPreviewDownloadWorkbook(excelData);
      const fileName = buildPreviewDownloadFileName();

      if (shouldChargeDownloadPoints(user.plan, user.feedbackTrialEndsAt, user.adminTrialEndsAt)) {
        const pointsDeducted = await usePoints(1000, 'download');
        if (!pointsDeducted) {
          setDownloadStatus("idle");
          return;
        }
      }

      XLSX.writeFile(wb, fileName);

        // 히스토리 세션 저장
        try {
          const { addSession } = useHistoryStore.getState();
          
          const inputSources = normalizeInputSourcesForSession(
            sessionInputCounts,
            inputSourceType
          );
          const sourceType: SourceType = primarySourceTypeFromCounts(inputSources);
          
          // files: 입력 방식에 따라 파일 메타데이터 생성
          let files: FileMetadata[] = [];
          if (inputSourceType === 'excel') {
            // 엑셀 업로드: uploadedFileMeta 사용
            files = uploadedFileMeta.map(meta => ({
              name: meta.name,
              size: meta.size,
              lastModified: Date.now(), // 현재 시간으로 설정 (원본 파일 정보가 없으므로)
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // 엑셀 파일 타입
            }));
          } else if (inputSourceType === 'image' && selectedImage) {
            // 이미지 업로드: selectedImage 사용
            files = [{
              name: selectedImage.name,
              size: selectedImage.size,
              lastModified: selectedImage.lastModified,
              type: selectedImage.type
            }];
          } else {
            // 텍스트 입력: 빈 배열
            files = [];
          }
          
          // courier: courierUploadTemplate의 courierType
          const courier = courierUploadTemplate?.courierType || null;
          
          // senderInfo: fixedHeaderValues에서 sender 정보 추출
          let senderInfo: SenderInfo | null = null;
          if (courierUploadTemplate?.headers) {
            const senderNameHeader = courierUploadTemplate.headers.find(h => h.fixedType === 'sender_name');
            const senderPhoneHeader = courierUploadTemplate.headers.find(h => h.fixedType === 'sender_phone');
            const senderAddressHeader = courierUploadTemplate.headers.find(h => h.fixedType === 'sender_address');
            
            const senderName = senderNameHeader ? fixedHeaderValues[senderNameHeader.name] : '';
            const senderPhone = senderPhoneHeader ? fixedHeaderValues[senderPhoneHeader.name] : '';
            const senderAddress = senderAddressHeader ? fixedHeaderValues[senderAddressHeader.name] : '';
            
            if (senderName || senderPhone || senderAddress) {
              senderInfo = {
                name: senderName || '',
                phone: senderPhone || '',
                address: senderAddress || ''
              };
            }
          }
          
          addSession({
            sourceType,
            inputSources,
            files,
            courier,
            downloadedFileName: fileName,
            senderInfo,
            orderCount: sortedRows.length, // 생성된 주문 건수
            resultRows: sortedRows // 변환된 주문 데이터 (히스토리 복원용)
          });
        } catch (error) {
          console.error('히스토리 세션 저장 오류:', error);
          // 히스토리 저장 실패는 치명적이지 않으므로 조용히 처리
        }

        setDownloadModalFileName(fileName);
        setDownloadStatus("done");

        setTimeout(() => {
          setDownloadStatus("idle");
          setDownloadModalFileName(null);
          applyPreviewWorkspaceReset();
        }, 3000);

    } catch (error) {
      console.error("다운로드 오류:", error);
      alert('다운로드 파일을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setDownloadStatus("idle");
    }
  };

  return (
    <>
      <WorkspaceSettingsCheckingOverlay open={settingsCheckOverlayOpen} />

      <BundleShippingModal
        open={isBundleShippingModalOpen}
        groups={activeBundleShippingGroups}
        courierHeaders={courierHeaders}
        previewRows={previewRows}
        userOverrides={userOverrides}
        onClose={() => setIsBundleShippingModalOpen(false)}
        onApply={handleBundleShippingApply}
      />

      <ExcloudConfirmDialog
        open={isDeleteModalOpen}
        title={`선택한 ${selectedRows.length}개 항목을 삭제하시겠습니까?`}
        description="선택한 항목을 삭제하고, 나머지 데이터만 유지합니다."
        confirmLabel="삭제"
        variant="danger"
        onCancel={() => setIsDeleteModalOpen(false)}
        onConfirm={() => {
          const deleted = selectedRows;
          setPreviewRows((prev) => prev.filter((row) => !deleted.includes(row.rowId)));
          setOrderStandardRowsByRowId((prev) => pruneOrderSnapshotsForRowIds(prev, deleted));
          setSelectedRows([]);
          setIsDeleteModalOpen(false);
        }}
      />

      <ExcloudConfirmDialog
        open={isPreviewResetModalOpen}
        title="미리보기 초기화"
        description={
          <>
            <p>첨부·주문 정보와 미리보기를 비우고 처음 화면 상태로 되돌립니다.</p>
            <p className="text-zinc-500">등록한 물류 양식·고정 입력은 그대로 둡니다.</p>
          </>
        }
        confirmLabel="초기화"
        variant="warning"
        onCancel={() => setIsPreviewResetModalOpen(false)}
        onConfirm={applyFullPreviewWorkspaceReset}
      />

      {/* 체험판: 다운로드 안내 — 미리보기 취지와 정식 서비스(엑셀) 구분 */}
      {showTrialDownloadModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowTrialDownloadModal(false)}
          role="presentation"
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-lg w-full p-6 border border-zinc-200 dark:border-zinc-700"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="trial-download-modal-title"
            aria-describedby="trial-download-modal-desc"
          >
            <h2
              id="trial-download-modal-title"
              className="text-xl font-bold text-zinc-950 dark:text-zinc-100 leading-snug"
            >
              주문 정리가 잘 되었나요?
            </h2>

            <div
              id="trial-download-modal-desc"
              className="mt-5 space-y-3 text-base text-zinc-800 dark:text-zinc-300 leading-relaxed"
            >
              <p>
                확인한 주문 내용을 엑셀로 저장하려면
                <br />
                무료 회원가입 후 다운로드해 주세요.
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                className="w-full sm:w-auto px-4 py-2.5 text-base rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                onClick={() => setShowTrialDownloadModal(false)}
              >
                다시 확인하기
              </button>
              <Link
                href="/auth?mode=login"
                className="w-full sm:w-auto px-4 py-2.5 text-base rounded-lg border border-blue-200 bg-blue-50 text-center font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-700/70 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-900/40"
                onClick={() => setShowTrialDownloadModal(false)}
              >
                무료 가입 후 다운로드
              </Link>
            </div>
          </div>
        </div>
      )}

      <TrialFirstPreviewFormatNoticeModal
        open={trialFirstPreviewFormatNotice.open}
        scope="logistics"
        onContinue={trialFirstPreviewFormatNotice.close}
        onChangeFormat={handleTrialFirstPreviewFormatNoticeChangeFormat}
      />

      <div
        className={`${trialMode && isDesktopHoverDevice ? 'ex-tooltip-follow-mode' : ''} ${
          landingEmbed
            ? 'bg-transparent pb-2 pt-0 dark:bg-transparent'
            : 'bg-zinc-50 pb-4 pt-1.5 dark:bg-black'
        }`}
      >
      <main
        className={
          landingEmbed
            ? 'w-full max-w-none px-0'
            : 'mx-auto max-w-[1200px] px-3 sm:px-5 lg:px-8'
        }
      >
        <div
          className={
            landingEmbed
              ? landingContentCardClass
              : trialMode
                ? 'trial-focus-outline'
                : ''
          }
        >
        {/* Hero 섹션 - 세로 흐름 구조 */}
        <section className="relative pt-1 pb-3">
          {!trialMode ? (
            <>
              <div className="mb-2 flex min-h-[38px] w-full items-center justify-center">
                <h1 className="text-center text-lg font-semibold text-gray-900 sm:text-xl">
                  물류주문변환
                </h1>
              </div>
              <p className="mb-3 text-center text-sm leading-relaxed text-gray-600 px-2">
                3PL·물류센터 양식에 맞게 주문 데이터를 변환할 수 있습니다.
                물류 업로드 엑셀 양식에 맞춰 주문·배송 정보를 정리합니다.
              </p>
            </>
          ) : null}
          <div className="flex flex-col gap-2 lg:gap-3">
            {/* 좌·우 200px · 체험 모드는 가운데 안내 문구 유지 */}
            <div
              className={`flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-2 ${trialMode ? '' : 'sm:justify-between'}`}
            >
              <div className="flex w-full shrink-0 justify-center sm:h-[38px] sm:w-[200px] sm:justify-start">
                {trialMode ? (
                  <div className="hidden h-[38px] shrink-0 sm:block sm:w-[200px]" aria-hidden />
                ) : (
                  <button
                    type="button"
                    onClick={() => router.push('/order/fetch')}
                    className="flex h-[38px] w-full items-center justify-center rounded-lg bg-green-600 px-3 text-sm font-semibold text-white shadow-md transition hover:bg-green-700 sm:w-[200px]"
                  >
                    즐겨찾는 쇼핑몰
                  </button>
                )}
              </div>
              {!trialMode ? null : (
                <p
                  data-ex-tooltip={
                    trialMode
                      ? '체험판은 미리보기 중심으로 제공되며, 다운로드는 가입 후 이용할 수 있습니다.'
                      : undefined
                  }
                  className={`order-first min-w-0 flex-1 self-center px-1 text-center text-xl font-bold leading-snug text-blue-400 sm:order-none ${trialMode ? 'ex-tooltip-target' : ''}`}
                >
                  주문 엑셀이나 카톡 주문문구로 바로 테스트해보세요
                </p>
              )}
              <div className="flex w-full shrink-0 justify-center sm:h-[38px] sm:w-[200px] sm:justify-end">
                {trialMode ? (
                  <div
                    data-ex-tooltip={
                      trialMode
                        ? isTrialTextConvertExhausted
                          ? TRIAL_TEXT_QUOTA_EXHAUSTED_MESSAGE
                          : '텍스트 변환만 입력 글자 수만큼 차감됩니다. 엑셀·파일 변환은 체험에서 별도 제한이 없습니다.'
                        : undefined
                    }
                    className={`${trialMode ? 'ex-tooltip-target' : ''} trial-usage-badge flex h-[38px] w-full min-w-0 items-center justify-end rounded-lg px-3 text-white shadow-md sm:w-[200px] ${
                      landingEmbed
                        ? 'bg-gradient-to-r from-blue-500 to-sky-600 shadow-blue-600/30'
                        : 'bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-emerald-600/30'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-hidden">
                      <Coins className="h-4 w-4 shrink-0" />
                      <span className="shrink-0 text-[10px] font-medium opacity-90 leading-tight sm:text-[11px]">
                        체험 잔여 사용량
                      </span>
                      <span
                        className="min-w-0 truncate text-xs font-bold tabular-nums leading-none"
                        title={
                          trialPoints === null
                            ? undefined
                            : `${trialPoints.toLocaleString()} / ${TRIAL_INITIAL_POINTS.toLocaleString()}`
                        }
                      >
                        {trialPoints === null
                          ? '…'
                          : `${trialPoints.toLocaleString()} / ${TRIAL_INITIAL_POINTS.toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                ) : user ? (
                  <div className="flex h-[38px] w-full min-w-0 items-center justify-end gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 text-white shadow-md sm:w-[200px]">
                    <Coins className="h-4 w-4 shrink-0" />
                    <span className="shrink-0 text-sm font-medium">잔여 사용량</span>
                    <span className="min-w-0 truncate text-sm font-bold tabular-nums" title={String(user.points)}>
                      :{user.points.toLocaleString()}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* 통합 입력 카드 - 하나의 파란색 테두리 카드에서 파일선택(왼쪽) + 텍스트입력(오른쪽) */}
            <div className="w-full border-2 border-emerald-500 rounded-xl bg-white p-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
                {/* 왼쪽: 파일선택 영역 (엑셀 + 이미지 드래그존) */}
                <div 
                  className="w-full lg:w-1/2 flex flex-col"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="mb-2.5 flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="text-base font-semibold text-gray-900 shrink-0">파일선택</h3>
                    <p className="min-w-0 text-xs leading-relaxed text-gray-600">
                      주문엑셀·이미지 파일을 선택하거나 이 영역에 끌어다 놓아 주세요
                    </p>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    data-ex-tooltip={
                      trialMode
                        ? '주문정보가 있는 엑셀파일 또는 기타 파일을 첨부하시면 테스트가능합니다\u000axlsx, xls,jpg,png 업로드가능'
                        : undefined
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (!ensureLoggedInForOrderInput()) return;
                        fileInputRef.current?.click();
                      }
                    }}
                    onClick={() => {
                      if (!ensureLoggedInForOrderInput()) return;
                      fileInputRef.current?.click();
                    }}
                    style={{ cursor: 'pointer' }}
                    className={`w-full h-[180px] bg-gray-50 border-2 border-dashed rounded-lg p-4 transition-colors overflow-hidden flex flex-col ${
                      isDragging
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-gray-300 hover:border-emerald-400'
                    } ${trialMode ? 'ex-tooltip-target' : ''}`}
                  >
                    <div className="flex-1 flex flex-col items-center justify-center gap-2.5 text-center">
                      <Upload className="w-8 h-8 text-gray-400" />
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-gray-700">
                          엑셀파일 · 이미지파일
                        </p>
                        <p className="text-xs text-gray-500">
                          클릭하거나 드래그하여 업로드하세요
                        </p>
                        <p className="text-xs text-gray-400 mt-1.5">
                          (xlsx, xls, jpg, png, gif)
                        </p>
                      </div>
                      {(selectedFiles.length > 0 || uploadedExcelFile || uploadedFileMeta.length > 0 || selectedFileName) && (
                        <div className="flex items-center justify-center gap-3 mt-2 text-sm text-gray-600">
                          <span>
                            📄 선택된 파일:{' '}
                            {selectedFiles[0]?.name ??
                              uploadedExcelFile?.name ??
                              selectedFileName ??
                              uploadedFileMeta[0]?.name ??
                              ''}
                            {selectedFiles.length > 1
                              ? ` 외 ${selectedFiles.length - 1}개`
                              : selectedFiles.length === 0 && uploadedFileMeta.length > 1
                                ? ` 외 ${uploadedFileMeta.length - 1}개`
                                : ''}
                          </span>

                          <span className="w-[110px] text-right inline-block">
                            {fileProcessingStatus === "processing" && (
                              <span className="inline-flex flex-col items-end gap-0.5 text-emerald-600 font-medium">
                                <span className="inline-flex items-center justify-end gap-2">
                                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                  <span>변환 중{processingDots}</span>
                                </span>
                                {stage2ChunkLabel ? (
                                  <span className="text-[11px] font-normal text-emerald-700/90 dark:text-emerald-400/90">
                                    {stage2ChunkLabel}
                                  </span>
                                ) : null}
                              </span>
                            )}

                            {fileProcessingStatus === "done" && (
                              <span className="text-green-600 font-medium">
                                ✔ 완료
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    id="unified-file-input"
                    type="file"
                    accept=".xlsx,.xls,.png,.jpg,.jpeg,.gif"
                    multiple
                    onChange={handleExcelFileChange}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    data-ex-tooltip={
                      trialMode
                        ? '주문정보가 있는 화면스크린샷 / 이미지파일을 첨부하거나 붙여넣으면\u000a미리보기에 구분하여 주문정리를 할수있습니다.'
                        : undefined
                    }
                    className={`mt-2.5 w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                      landingEmbed
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-emerald-600 hover:bg-emerald-700'
                    } ${trialMode ? 'ex-tooltip-target' : ''}`}
                    onClick={() => {
                      if (!ensureLoggedInForOrderInput()) return;
                      setShowScreenshotModal(true);
                    }}
                  >
                    {landingEmbed || trialMode
                      ? '캡처화면 주문변환 (스크린샷 주문 변환)'
                      : '캡처화면 물류 주문 변환 (스크린샷 물류 주문 변환)'}
                  </button>
                </div>

                {/* 오른쪽: 텍스트 주문입력 영역 (lg에서 좌측 파일 영역과 동일 높이·하단 버튼 정렬) */}
                <div className="flex min-h-0 w-full flex-col border-l-0 border-gray-200 pl-0 lg:w-1/2 lg:border-l lg:pl-5">
                  <div className="mb-2.5 flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="text-base font-semibold text-gray-900 shrink-0">텍스트 주문입력</h3>
                    <p className="min-w-0 text-xs leading-relaxed text-gray-600">
                      카카오톡·문자·주문페이지 등에서 받은 주문내용을 붙여넣어주세요
                    </p>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-2.5">
                    <textarea
                      ref={textInputRef}
                      data-ex-tooltip={trialMode ? TRIAL_TEXT_ORDER_TOOLTIP : undefined}
                      className={`min-h-[180px] w-full flex-1 basis-0 resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-gray-100 ${
                        trialMode ? 'ex-tooltip-target' : ''
                      }`}
                      placeholder={
                        needsAccount
                          ? '로그인 후 주문 내용을 붙여넣을 수 있어요.'
                          : trialMode
                            ? '예) 홍길동 010-1234-5766   무선마우스 2개  상품코드:A-2246\n' +
                              '서울시 강남구 테헤란로 123  문앞에 놓아주세요\n' +
                              '\n' +
                              '※ 상품코드·출고요청일 등 항목은 [ 항목명 : 값 ] 형태가 아닌 경우 반영되지 않습니다. 좋은예) 상품코드:B-1234     나쁜예)   B-1234'
                            : '예) 홍길동 010-1234-5766   무선마우스 2개  상품코드:A-2246\n' +
                              '서울시 강남구 테헤란로 123  문앞에 놓아주세요\n' +
                              '\n' +
                              '※ 상품코드·출고요청일 등 물류 항목은 [ 항목명 : 값 ] 형태가  아닌경우에는 반영되지 않습니다. 좋은예) 상품코드:B-1234     나쁜예)   B-1234'
                      }
                      value={textInput}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        pendingImageOcrTextConvertRef.current = false;
                        if (
                          user &&
                          !hasProEntitlementClient(user.plan, user.feedbackTrialEndsAt, user.adminTrialEndsAt) &&
                          newValue.length > FREE_TEXT_INPUT_MAX_CHARS
                        ) {
                          alert(`무료 회원은 최대 ${FREE_TEXT_INPUT_MAX_CHARS.toLocaleString('ko-KR')}자까지 입력할 수 있습니다.`);
                          return;
                        }
                        setTextInput(newValue);
                      }}
                      disabled={needsAccount || isProcessingTextImage}
                    />
                    <button
                      type="button"
                      data-ex-tooltip={
                        trialMode
                          ? '입력한 텍스트를 주문 표 형태로 변환합니다.'
                          : undefined
                      }
                      className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                        landingEmbed
                          ? 'bg-blue-600 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300'
                          : 'bg-emerald-600 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300'
                      } ${trialMode ? 'ex-tooltip-target' : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!ensureLoggedInForOrderInput()) return;
                        if (!ensureCourierTemplateReady('convert')) return;
                        const today = new Date().toDateString();
                        const saved = localStorage.getItem("hideLogisticsTextConvertModal");

                        if (saved === today) {
                          handleTextConvert(); // 바로 실행
                        } else {
                          setShowTextConvertModal(true);
                        }
                      }}
                      disabled={
                        needsAccount ||
                        isProcessingTextImage ||
                        !textInput.trim() ||
                        isTrialTextConvertExhausted
                      }
                    >
                      {isProcessingTextImage ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>
                            {textConvertStatusLabel ??
                              stage2ChunkLabel ??
                              `변환 중${textProcessingDots}`}
                          </span>
                        </>
                      ) : trialMode ? (
                        '텍스트로 주문 변환'
                      ) : (
                        '텍스트 물류 주문 변환'
                      )}
                    </button>
                    {trialMode && isTrialTextConvertExhausted && (
                      <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                        {TRIAL_TEXT_QUOTA_EXHAUSTED_MESSAGE}
                      </p>
                    )}
                    {errorMessageTextImage && (
                      <p className="text-xs text-red-600">
                        {errorMessageTextImage}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 변환된 파일 출력 영역 — 주문연동 허브와 동일 톤 */}
        <section className="relative pb-2 pt-1">
          <div className={EXCLOAD_PREVIEW_HEADER_ROW}>
            <div className={EXCLOAD_PREVIEW_HEADER_TITLE_GROUP}>
              <h3 className="text-lg font-semibold text-gray-900">미리보기</h3>
              {previewRows.length > 0 && courierHeaders.length > 0 ? (
                <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-zinc-600">
                  {previewRows.length.toLocaleString()}건
                </span>
              ) : null}
            </div>
            <div className={EXCLOAD_PREVIEW_HEADER_ACTION_SPACER} aria-hidden />
          </div>

          {previewRows.length > 0 && courierHeaders.length > 0 ? (
            <div className={EXCLOAD_PREVIEW_TOOLBAR_SHELL}>
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <button
                  type="button"
                  data-ex-tooltip={trialMode ? '미리보기 영역을 펼치거나 접습니다.' : undefined}
                  className={`${trialMode ? 'ex-tooltip-target' : ''} ${EXCLOAD_PREVIEW_TOOL_BTN}`}
                  onClick={() => setIsPreviewExpanded((prev) => !prev)}
                >
                  {isPreviewExpanded ? (
                    <Minimize2 className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
                  )}
                  {isPreviewExpanded ? '닫기' : '펼치기'}
                </button>
                <button
                  type="button"
                  data-ex-tooltip={
                    trialMode
                      ? '첨부·주문 정보와 미리보기를 비우고 처음 화면 상태로 되돌립니다.'
                      : undefined
                  }
                  className={`${trialMode ? 'ex-tooltip-target' : ''} ${EXCLOAD_PREVIEW_TOOL_BTN}`}
                  onClick={() => setIsPreviewResetModalOpen(true)}
                >
                  <RotateCcw className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
                  초기화
                </button>
                {selectedRows.length > 0 ? (
                  <button
                    type="button"
                    data-ex-tooltip={
                      trialMode ? '삭제가 필요한경우 선택하여 삭제 할수 있습니다' : undefined
                    }
                    className={`${
                      trialMode ? 'ex-tooltip-target' : ''
                    } inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md bg-red-600 px-2.5 text-xs font-semibold text-white transition hover:bg-red-700`}
                    onClick={() => setIsDeleteModalOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    선택 삭제 {selectedRows.length}
                  </button>
                ) : null}
              </div>

              {bundleShippingDetection.columns ? (
                bundleApplyUndo ? (
                  <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-zinc-100 pt-2 sm:border-t-0 sm:pt-0">
                    <p className="rounded-md bg-zinc-50 px-2.5 py-1.5 text-xs leading-snug text-zinc-600">
                      묶음 적용 · 삭제{' '}
                      <span className="font-semibold text-red-600">
                        {bundleApplyUndo.summary.deletedRowCount}
                      </span>
                      · 개별{' '}
                      <span className="font-semibold text-zinc-800">
                        {bundleApplyUndo.summary.individualGroupCount}
                      </span>
                      · 묶음{' '}
                      <span className="font-semibold text-zinc-800">
                        {bundleApplyUndo.summary.bundleDoneGroupCount}
                      </span>
                    </p>
                    <button
                      type="button"
                      className={`${EXCLOAD_PREVIEW_TOOL_BTN} border border-zinc-200 bg-white`}
                      onClick={handleUndoBundleShippingApply}
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
                      적용 취소
                    </button>
                  </div>
                ) : bundleShippingGroupCount > 0 ? (
                  <button
                    type="button"
                    className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 self-start rounded-md border border-violet-200 bg-violet-50 px-2.5 text-xs font-semibold text-violet-900 transition hover:bg-violet-100 sm:self-auto ${
                      !bundleShippingButtonAcked ? 'ring-2 ring-violet-300/70' : ''
                    }`}
                    onClick={() => {
                      setBundleShippingButtonAcked(true);
                      setIsBundleShippingModalOpen(true);
                    }}
                  >
                    <Package className="h-3.5 w-3.5" aria-hidden />
                    묶음배송 {bundleShippingGroupCount}그룹
                    <span className="font-medium text-violet-700/80">
                      · {bundleShippingRowCount}건
                    </span>
                  </button>
                ) : null
              ) : null}
            </div>
          ) : null}

          {previewRows.length > 0 && courierHeaders.length > 0 ? (
            <p className="mb-2 text-xs leading-relaxed text-zinc-500">
              셀 클릭으로 수정 · 헤더 클릭으로 정렬 · 헤더 체크로 코드매핑 · 체크 후 선택 삭제
            </p>
          ) : null}

          {previewRows.length > 0 && courierHeaders.length > 0 && !isPreviewExpanded ? (
            <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-snug text-zinc-500">
              <span>
                <span className="font-medium text-blue-700">
                  {Math.min(renderedRowCount, sortedRows.length).toLocaleString()}
                </span>
                {' / '}
                {sortedRows.length.toLocaleString()}건 표시
              </span>
              {hasMorePreviewRows ? (
                <>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 font-medium text-blue-700 transition hover:bg-blue-50"
                    onClick={() =>
                      setRenderedRowCount((prev) =>
                        Math.min(prev + PREVIEW_BATCH_SIZE, sortedRows.length),
                      )
                    }
                  >
                    +{PREVIEW_BATCH_SIZE}건 더보기
                  </button>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 font-medium text-zinc-600 transition hover:bg-zinc-100"
                    onClick={() => setRenderedRowCount(sortedRows.length)}
                  >
                    전체 보기
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {previewSessionEnabled &&
          isPreviewSessionRestoring &&
          (previewRows.length === 0 || courierHeaders.length === 0) ? (
            <div className={`${EXCLOAD_PREVIEW_EMPTY_SHELL} flex-col gap-2 text-sm text-gray-500`}>
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <p>이전 작업 내용을 불러오는 중입니다…</p>
            </div>
          ) : previewRows.length === 0 || courierHeaders.length === 0 ? (
            <div className={EXCLOAD_PREVIEW_EMPTY_SHELL}>
              <p className="max-w-md text-sm leading-relaxed text-gray-500">
                주문을 가져오면 변환결과가 여기에 표시됩니다
                <br />
                파일 크기·주문 건수·PC/인터넷 환경에 따라 처리 시간이 다소 걸릴 수 있습니다.
              </p>
            </div>
          ) : (
            <>
              <UnknownHeadersWarningBanner
                unknownHeaders={unknownHeadersWarning}
                unknownHeaderSamples={unknownHeaderSamples}
                expanded={unknownHeadersExpanded}
                onExpandedChange={setUnknownHeadersExpanded}
                variant="logistics"
                trialMode={trialMode}
                onDirectMapping={handleOpenDirectMappingModal}
              />

              {/* 상품코드 매핑 실패 시: 코드·바코드 열 비움 안내 */}
              {productCodeMappingNotice && (
                <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
                  <p className="mb-2 font-semibold">
                    ⚠ 상품코드 매핑: {productCodeMappingNotice.failCount}건이 매핑되지 않았습니다.
                  </p>
                  <p className="mb-2 leading-relaxed">
                    「<strong>코드매핑 설정</strong>」 적용 후,{' '}
                    {trialMode ? '등록한 업로드 양식의' : '물류 템플릿의'}{' '}
                    <span className="font-semibold text-rose-800">
                      「{productCodeMappingNotice.targetHeader}」
                    </span>{' '}
                    열에서 매핑되지 않은 행은{' '}
                    <span className="font-semibold">상품명을 그대로 두었습니다</span>
                    (코드로 바꾸지 못함).
                  </p>
                  <p className="text-xs text-rose-800">
                    매핑 성공 {productCodeMappingNotice.successCount}건 · 실패{' '}
                    {productCodeMappingNotice.failCount}건 — 매핑 파일에 해당 상품명·옵션 조합이 있는지
                    확인해 주세요.
                  </p>
                </div>
              )}

              {/*
                미리보기 렌더링 데이터 소스: previewRows / courierHeaders
                - courierHeaders 기준으로 전체 컬럼 구조 표시
              */}
              <div
                className={`${EXCLOAD_PREVIEW_TABLE_SHELL} flex flex-col overflow-hidden ${
                  isPreviewExpanded
                    ? EXCLOAD_PREVIEW_HEIGHT_EXPANDED
                    : EXCLOAD_PREVIEW_HEIGHT_DEFAULT
                }`}
              >
                <div className="flex flex-shrink-0 items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
                  <p className="text-xs text-zinc-600">
                    <span className="font-medium text-zinc-800">헤더 체크박스</span>를 선택하면
                    원하는 값을 설정할 수 있습니다.{' '}
                    {trialMode
                      ? '체험판에서는 미리보기로만 확인할 수 있습니다.'
                      : '미리보기에서 적용된 형식 그대로 업로드 파일이 생성됩니다.'}
                  </p>
                </div>
                <div
                  ref={previewScrollContainerRef}
                  onScroll={handlePreviewScroll}
                  className={`${isPreviewExpanded ? '' : 'flex-1'} min-h-0 overflow-auto preview-scrollbar preview-table-no-copy`}
                  onCopy={(e) => {
                    const t = e.target;
                    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
                    e.preventDefault();
                  }}
                >
                  <table className="min-w-max border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-20 bg-zinc-100">
                      <tr>
                        <th className="sticky left-0 z-30 border-b border-zinc-200 bg-zinc-100 px-2 py-2 text-left font-semibold shadow-[1px_0_0_0_rgba(228,228,231,1)] sm:whitespace-nowrap">
                            <input
                              type="checkbox"
                              data-ex-tooltip={
                                trialMode
                                  ? '삭제가 필요한경우 선택하여 삭제 할수 있습니다'
                                  : undefined
                              }
                              className={trialMode ? 'ex-tooltip-target' : undefined}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRows(previewRows.map(row => row.rowId));
                                } else {
                                  setSelectedRows([]);
                                }
                              }}
                            />
                          </th>
                          {courierHeaders.map((header) => (
                            <th
                              key={header}
                              className="whitespace-nowrap border-b border-zinc-200 px-2 py-2 text-left font-semibold text-zinc-700"
                            >
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1">
                                  <div className="flex shrink-0 items-center justify-center p-1 -m-1">
                                    <input
                                      type="checkbox"
                                      data-ex-tooltip={
                                        trialMode
                                          ? '헤더 체크박스로 코드매핑 설정을 열 수 있습니다.'
                                          : undefined
                                      }
                                      className={`${trialMode ? 'ex-tooltip-target' : ''} ex-preview-header-mapping-checkbox`}
                                      checked={
                                        Boolean(columnCodeMappingSnapshots[header]) ||
                                        columnMappingActiveHeader === header
                                      }
                                      onChange={(e) => {
                                        handleHeaderCodeMappingCheckboxChange(
                                          header,
                                          e.target.checked,
                                        );
                                      }}
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    data-ex-tooltip={
                                      trialMode
                                        ? '클릭하면 오름차순/내림차순으로 정렬됩니다.'
                                        : undefined
                                    }
                                    className={`${trialMode ? 'ex-tooltip-target' : ''} m-0 inline-flex min-w-0 cursor-pointer select-none items-center gap-1 border-0 bg-transparent p-0 text-left font-semibold`}
                                    onClick={() => {
                                      setSortConfig((prev) => {
                                        if (!prev || prev.header !== header) {
                                          return { header, direction: 'asc' };
                                        }
                                        if (prev.direction === 'asc') {
                                          return { header, direction: 'desc' };
                                        }
                                        return null;
                                      });
                                    }}
                                  >
                                    <span
                                      className={
                                        sortConfig?.header === header
                                          ? sortConfig.direction === 'asc'
                                            ? 'font-semibold text-blue-600'
                                            : 'font-semibold text-red-600'
                                          : ''
                                      }
                                    >
                                      {header}
                                    </span>

                                    {sortConfig?.header === header && (
                                      <span
                                        className={
                                          sortConfig.direction === 'asc'
                                            ? 'text-xs text-blue-600'
                                            : 'text-xs text-red-600'
                                        }
                                      >
                                        {sortConfig.direction === 'asc' ? '▲' : '▼'}
                                      </span>
                                    )}
                                  </button>
                                </div>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {virtualTopSpacerHeight > 0 && (
                          <tr aria-hidden="true">
                            <td
                              colSpan={courierHeaders.length + 1}
                              style={{ height: `${virtualTopSpacerHeight}px`, padding: 0, border: 0 }}
                            />
                          </tr>
                        )}
                        {virtualRows.map((row) => {
                          const isNewRow = newRows.has(row.rowId);
                          return (
                          <tr
                            key={row.rowId}
                            className={`transition-colors
                              ${
                                selectedRows.includes(row.rowId)
                                  ? "bg-emerald-100"
                                  : isNewRow
                                  ? "bg-green-100 animate-pulse"
                                  : "hover:bg-gray-50"
                              }
                            `}
                          >
                            <td
                              className={`sticky left-0 z-10 border border-gray-300 px-2 py-1 border-b sm:whitespace-nowrap shadow-[1px_0_0_0_rgba(209,213,219,1)] ${
                                selectedRows.includes(row.rowId)
                                  ? 'bg-emerald-100'
                                  : isNewRow
                                  ? 'bg-green-100'
                                  : 'bg-white'
                              }`}
                            >
                              <input
                                type="checkbox"
                                data-ex-tooltip={
                                  trialMode
                                    ? '삭제가 필요한경우 선택하여 삭제 할수 있습니다'
                                    : undefined
                                }
                                className={trialMode ? 'ex-tooltip-target' : undefined}
                                checked={selectedRows.includes(row.rowId)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedRows(prev => [...prev, row.rowId]);
                                  } else {
                                    setSelectedRows(prev =>
                                      prev.filter(id => id !== row.rowId)
                                    );
                                  }
                                }}
                              />
                            </td>
                            {courierHeaders.map((header) => {
                              const cellValue = row.data[header] ?? '';
                              const overrideValue = userOverrides[row.rowId]?.[header];
                              const displayValue = overrideValue ?? cellValue;
                              
                              // 전화번호 필드인지 확인 (헤더 이름에 "전화" 포함)
                              const isPhoneField = header.includes('전화') || header.includes('phone');

                              if (editingCell?.rowId === row.rowId && editingCell?.header === header) {
                                return (
                                  <td key={header} className="border border-gray-300 px-2 py-1 border-b sm:whitespace-nowrap bg-yellow-100">
                                    <input
                                      autoFocus
                                      className="w-full h-full border-0 p-0 bg-transparent outline-none text-sm select-text"
                                      style={{ minHeight: '1.25rem' }}
                                      value={editingValue}
                                      onChange={(e) => setEditingValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          commitCellEdit(row.rowId, header, editingValue);
                                          setEditingCell(null);
                                          setActiveCell(null);
                                        } else if (e.key === 'Escape') {
                                          setEditingCell(null);
                                          setActiveCell(null);
                                        }
                                      }}
                                      onBlur={() => {
                                        commitCellEdit(row.rowId, header, editingValue);
                                        setEditingCell(null);
                                        setActiveCell(null);
                                      }}
                                    />
                                  </td>
                                );
                              }

                              const isActiveCell = activeCell?.rowId === row.rowId && activeCell?.header === header;
                              
                              return (
                                <td
                                  key={header}
                                  className={`border border-gray-300 px-2 py-1 border-b sm:whitespace-nowrap cursor-pointer ${
                                    isActiveCell ? 'bg-yellow-100' : ''
                                  }`}
                                  onClick={() => {
                                    setEditingValue(displayValue);
                                    setActiveCell({ rowId: row.rowId, header });
                                    setEditingCell({ rowId: row.rowId, header });
                                  }}
                                >
                                  {isPhoneField ? formatPhoneDisplay(displayValue) : displayValue}
                                </td>
                              );
                            })}
                          </tr>
                          );
                        })}
                        {virtualBottomSpacerHeight > 0 && (
                          <tr aria-hidden="true">
                            <td
                              colSpan={courierHeaders.length + 1}
                              style={{ height: `${virtualBottomSpacerHeight}px`, padding: 0, border: 0 }}
                            />
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
        </section>

        {/* 기능 설명 섹션 레이아웃 */}
        <section className="relative pt-4 pb-4">
          <div
            className={`grid grid-cols-1 gap-2 lg:gap-3 ${
              trialMode && !landingEmbed ? 'sm:grid-cols-2 lg:grid-cols-4' : 'lg:grid-cols-3'
            }`}
          >
            {/* 카드 1: 업로드 엑셀 양식 */}
            <button
              type="button"
              onClick={handleOpenCourierTemplateModal}
              data-ex-tooltip={trialMode ? '기존 택배사에 업로드하는 엑셀파일을 등록하세요.\u000a그양식대로 주문정리가 됩니다' : undefined}
              className={`${trialMode ? 'ex-tooltip-target' : ''} h-[120px] bg-gray-200 border border-gray-300 rounded-xl p-5 flex flex-col justify-center transition-colors hover:bg-gray-100`}
            >
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100">
                  <Truck className="w-5 h-5 text-gray-500" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 text-center">
                  {trialMode ? '업로드 엑셀 양식 등록' : '물류센터 업로드 양식 등록'}
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center">
                {trialMode ? (
                  <>
                    실제 사용 중인 주문 업로드 엑셀 양식이 있으면 등록해 주세요.
                    <br />
                    등록하신 열 구성 그대로 맞춰 집니다.
                  </>
                ) : (
                  <>
                    실제 물류센터 업로드에 사용하는 엑셀 양식을 등록해주세요.
                    <br />
                    등록하신 양식 그대로 자동 설정됩니다.
                  </>
                )}
              </p>
            </button>

            {trialMode && !landingEmbed && (
              <button
                type="button"
                onClick={handleOpenUserCustomFormatFlow}
                data-ex-tooltip={
                  '주문 파일의 열 이름과 순서를 직접 정해 출력 양식을 만듭니다.\u000a업로드용 엑셀 파일이 없을 때도 사용할 수 있습니다'
                }
                className="ex-tooltip-target h-[120px] rounded-xl border border-gray-300 bg-gray-200 p-5 flex flex-col justify-center transition-colors hover:bg-gray-100"
              >
                <div className="flex items-center justify-center gap-3 mb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                    <ArrowRightLeft className="h-5 w-5 text-gray-500" />
                  </div>
                  <h3 className="text-center text-sm font-semibold text-gray-900">
                    사용자 지정양식 만들기
                  </h3>
                </div>
                <p className="mt-1 text-center text-xs leading-relaxed text-gray-500">
                  주문 파일 헤더를 직접 연결해
                  <br />
                  원하는 열 이름·순서로 만듭니다.
                </p>
              </button>
            )}

            {/* 카드 2: 고정입력 */}
            <button
              type="button"
              onClick={handleOpenSenderModal}
              data-ex-tooltip={trialMode ? '보내는사람/기타정보 등 반복값을 미리 채울수 있습니다' : undefined}
              className={`${trialMode ? 'ex-tooltip-target' : ''} h-[120px] bg-gray-200 border border-gray-300 rounded-xl p-5 flex flex-col justify-center transition-colors hover:bg-gray-100`}
            >
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100">
                  <Search className="w-5 h-5 text-gray-500" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 text-center">
                  고정 입력 정보 설정
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center">
                보내는 사람 정보 등 모든 주문에 공통으로 적용되는 값을
                <br />
                미리 등록하여 매번 입력하는 번거로움을 줄일 수 있습니다.
              </p>
            </button>

            {/* 카드 3: 파일 다운로드 (체험판도 카드 1·2와 동일 톤 — 강조색으로 ‘만 사용 가능’ 오해 방지) */}
            <button
              type="button"
              onClick={handleDownloadPreview}
              disabled={downloadStatus === "processing"}
              data-ex-tooltip={
                trialMode
                  ? '미리보기에 보이는 그대로의 정보값으로 업로드용 엑셀파일로 저장됩니다'
                  : undefined
              }
              className={`${trialMode ? 'ex-tooltip-target' : ''} h-[120px] bg-gray-200 border border-gray-300 rounded-xl p-5 flex flex-col justify-center transition-colors hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100">
                  <ArrowDown className="w-5 h-5 text-gray-500" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 text-center">
                  {trialMode ? '엑셀 파일 다운로드' : '물류센터 업로드 파일 다운로드'}
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center">
                {trialMode ? (
                  <>
                    정식 서비스에서는 이 단계에서 엑셀을 받을 수 있습니다.
                    <br />
                    체험판은 취지상 다운로드 없이, 클릭 시 안내만 표시됩니다.
                  </>
                ) : (
                  <>
                    변환이 완료된 주문 데이터를
                    <br />
                    물류센터 업로드용 파일로 내려받는 단계입니다.
                  </>
                )}
              </p>
            </button>
          </div>

          <WorkspaceFormStatusBanner
            isChecking={isFormStatusChecking}
            templateHeaderNames={activeTemplateHeaderNames}
            fixedHeaderOrder={FIXED_HEADER_ORDER}
            fixedHeaderValues={fixedHeaderValues}
            variant="emerald"
            templateKindLabel={hasDirectHeaderMappings(templateBridgeFile) ? '사용자 지정' : undefined}
            templateKindDescription={
              hasDirectHeaderMappings(templateBridgeFile)
                ? '사용자 지정양식 사용 중: 등록할 때 사용한 파일과 같은 헤더 구조에 맞춰 출력됩니다.'
                : undefined
            }
          />
          {isUsingDefaultCjTemplate && !isFormStatusChecking && (
            <DefaultCjTemplateNotice
              variant="logistics"
              onRegisterCustom={handleOpenCourierTemplateModal}
            />
          )}
          {selectedMappingSummary && (
            <div className="w-full mt-4">
              <p className="text-xs text-emerald-500 w-full whitespace-nowrap overflow-hidden text-ellipsis">
                <span className="trial-soft-chip inline-block py-0.5 px-2 rounded-md text-xs font-medium">
                  상품코드 매핑 :
                </span>{' '}
                {selectedMappingSummary}
              </p>
            </div>
          )}
        </section>
        </div>

      </main>

      {/* 물류 전용: 미리보기 코드매핑 (헤더별 마스터 → 모달 확인 시 일괄 반영) */}
      {showColumnCodeMappingModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
          onClick={handleCloseColumnCodeMappingModal}
          role="presentation"
        >
          <div
            className="flex max-h-[90vh] w-full max-w-[920px] flex-col rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="column-code-mapping-title"
          >
            <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-zinc-100 px-6 pb-4 pt-5 dark:border-zinc-800">
              <div className="min-w-0 space-y-2">
                <h2
                  id="column-code-mapping-title"
                  className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  코드매핑 설정
                </h2>
                <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  원본값(왼쪽)과 변환값(오른쪽)을 입력하면 미리보기에 변환값으로 적용됩니다.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">선택된 헤더</span>
                  <span className="inline-flex max-w-full items-center truncate rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    {columnMappingActiveHeader ?? '-'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseColumnCodeMappingModal}
                className="rounded-lg p-1.5 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="닫기"
              >
                <X className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
              </button>
            </div>

            <input
              ref={columnMappingModalFileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleColumnMappingExcelFileChange}
            />

            <div className="relative min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {columnCodeMappingModalView === 'excelGuide' ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-800/40">
                  <p className="mb-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {columnCodeMappingEditorMode === 'product' ? (
                      <>
                        아래 예시처럼 <strong>상품명·옵션명·상품코드</strong> 열로
                        엑셀을 만든 뒤 첨부하면, 변환값(상품코드) 칸에 채워집니다.
                      </>
                    ) : (
                      <>
                        아래 예시처럼 <strong>원본값</strong>과{' '}
                        <strong>변환값</strong> 두 열로 엑셀을 만든 뒤 첨부하면,
                        오른쪽 변환값 목록에 채워집니다.
                      </>
                    )}
                  </p>

                  <div className="mb-4 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                    <table className="w-full border-collapse text-sm">
                      <thead className="bg-zinc-50 dark:bg-zinc-800">
                        <tr>
                          {columnCodeMappingEditorMode === 'product' ? (
                            <>
                              <th className="border-b border-zinc-200 p-2.5 text-left text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
                                상품명
                              </th>
                              <th className="border-b border-zinc-200 p-2.5 text-left text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
                                옵션명
                              </th>
                              <th className="border-b border-zinc-200 p-2.5 text-left text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
                                상품코드
                              </th>
                            </>
                          ) : (
                            <>
                              <th className="w-1/2 border-b border-zinc-200 p-2.5 text-left text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
                                원본값
                              </th>
                              <th className="w-1/2 border-b border-zinc-200 p-2.5 text-left text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
                                변환값
                              </th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {columnCodeMappingEditorMode === 'product'
                          ? MAPPING_EXCEL_PRODUCT_FRUIT_EXAMPLES.map((row) => (
                              <tr
                                key={`${row.name}-${row.option}-${row.code}`}
                                className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                              >
                                <td className="p-2.5 text-xs text-zinc-800 dark:text-zinc-100">
                                  {row.name}
                                </td>
                                <td className="p-2.5 text-xs text-zinc-500 dark:text-zinc-400">
                                  {row.option || '—'}
                                </td>
                                <td className="p-2.5 text-xs text-zinc-800 dark:text-zinc-100">
                                  {row.code}
                                </td>
                              </tr>
                            ))
                          : MAPPING_EXCEL_SIMPLE_FRUIT_EXAMPLES.map((row) => (
                              <tr
                                key={row.original}
                                className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                              >
                                <td className="p-2.5 text-xs text-zinc-800 dark:text-zinc-100">
                                  {row.original}
                                </td>
                                <td className="p-2.5 text-xs text-zinc-800 dark:text-zinc-100">
                                  {row.converted}
                                </td>
                              </tr>
                            ))}
                      </tbody>
                    </table>
                  </div>

                  <ul className="mb-5 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {columnCodeMappingEditorMode === 'product' ? (
                      <>
                        <li>첫 줄에 상품명·옵션명·상품코드(또는 코드) 헤더를 넣어 주세요.</li>
                        <li>미리보기의 상품명·옵션과 엑셀 원본이 같아야 매핑됩니다.</li>
                      </>
                    ) : (
                      <>
                        <li>첫 줄에 원본값·변환값(또는 원본·코드) 헤더를 넣어 주세요.</li>
                        <li>
                          선택한 열(
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">
                            {columnMappingActiveHeader ?? '-'}
                          </span>
                          )의 셀 내용과 원본값이 같아야 매핑됩니다.
                        </li>
                      </>
                    )}
                    <li>헤더가 없어도 앞쪽 2~3열 순서로 읽을 수 있습니다.</li>
                  </ul>

                  <div className="flex flex-wrap items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setColumnCodeMappingModalView('editor')}
                      className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      편집으로 돌아가기
                    </button>
                    <button
                      type="button"
                      onClick={() => columnMappingModalFileRef.current?.click()}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                    >
                      파일 첨부하기
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setColumnCodeMappingModalView('excelGuide')}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
                    >
                      매핑 엑셀 추가
                    </button>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/80">
                    <tr>
                      <th className="w-1/3 border-b border-zinc-200 p-2.5 text-left text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
                        원본값
                      </th>
                      <th className="w-2/3 border-b border-zinc-200 p-2.5 text-left text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
                        변환값
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {columnCodeMappingEditorRows.map((r) => {
                      const displayTrimmed = String(r.displayKey ?? '').trim();
                      const canEditOriginal = Boolean(r.manualRow);

                      return (
                        <tr
                          key={r.id}
                          className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                        >
                          <td className="max-w-[280px] p-2 align-middle text-xs text-zinc-800 dark:text-zinc-100">
                            {canEditOriginal ? (
                              <input
                                className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-emerald-600 dark:focus:ring-emerald-950"
                                value={r.displayKey}
                                placeholder={
                                  columnCodeMappingEditorMode === 'product'
                                    ? '상품명 / 옵션명 입력'
                                    : '원본값 입력'
                                }
                                onChange={(e) => {
                                  const nextDisplayKey = e.target.value;
                                  const nextKey =
                                    columnCodeMappingEditorMode === 'product'
                                      ? parseProductDisplayKeyToInternalKey(
                                          nextDisplayKey,
                                        )
                                      : String(nextDisplayKey ?? '')
                                          .trim();

                                  setColumnCodeMappingEditorRows((prev) =>
                                    prev.map((row) =>
                                      row.id === r.id
                                        ? {
                                            ...row,
                                            displayKey: nextDisplayKey,
                                            key: nextKey,
                                          }
                                        : row,
                                    ),
                                  );

                                  const trimmedValue = String(r.value ?? '')
                                    .trim();

                                  if (columnCodeMappingEditorMode === 'product') {
                                    setColumnCodeMappingEditorMap((prev) => {
                                      const next = { ...prev };
                                      delete next[r.key];
                                      if (nextKey && trimmedValue) {
                                        next[nextKey] = trimmedValue;
                                      }
                                      return next;
                                    });
                                  } else {
                                    setColumnCodeMappingEditorSimpleMap(
                                      (prev) => {
                                        const next = { ...prev };
                                        delete next[r.key];
                                        if (trimmedValue) {
                                          next[nextKey] = trimmedValue;
                                        }
                                        return next;
                                      },
                                    );
                                  }
                                }}
                              />
                            ) : (
                              <div
                                data-ex-tooltip={
                                  trialMode
                                    ? displayTrimmed !== ''
                                      ? '코드매핑 원본값입니다.\u000a오른쪽에서 변환값을 지정하세요.'
                                      : '미리보기에서 가져온 값이 없습니다.\u000a변환값만 입력하거나 +행 추가로 원본을 입력하세요.'
                                    : undefined
                                }
                                className={`${trialMode ? 'ex-tooltip-target' : ''} min-h-[34px] rounded-lg px-2.5 py-1.5 text-xs whitespace-normal break-words ${
                                  displayTrimmed !== ''
                                    ? 'bg-zinc-50 text-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-100'
                                    : 'bg-zinc-50/80 italic text-zinc-400 dark:bg-zinc-800/40 dark:text-zinc-500'
                                }`}
                              >
                                {displayTrimmed !== ''
                                  ? r.displayKey
                                  : '(비어 있음)'}
                              </div>
                            )}
                          </td>
                          <td className="p-2 align-middle">
                            <input
                              className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-emerald-600 dark:focus:ring-emerald-950"
                              value={r.value}
                              onChange={(e) => {
                                const nextVal = e.target.value;
                                const trimmed = String(nextVal ?? '').trim();

                                // 우선 행의 value는 항상 저장(원본키가 비어도 입력 가능)
                                setColumnCodeMappingEditorRows((prev) =>
                                  prev.map((row) =>
                                    row.id === r.id
                                      ? { ...row, value: nextVal }
                                      : row,
                                  ),
                                );

                                // simple: 원본키가 빈 문자열('')이어도 "빈 셀 → 변환값" 매핑으로 저장
                                if (columnCodeMappingEditorMode === 'product') {
                                  if (!r.key) return;
                                  setColumnCodeMappingEditorMap((prev) => {
                                    const next = { ...prev };
                                    if (!trimmed) delete next[r.key];
                                    else next[r.key] = trimmed;
                                    return next;
                                  });
                                } else {
                                  setColumnCodeMappingEditorSimpleMap(
                                    (prev) => {
                                      const next = { ...prev };
                                      if (!trimmed) delete next[r.key];
                                      else next[r.key] = trimmed;
                                      return next;
                                    },
                                  );
                                }
                              }}
                              placeholder="코드를 입력하세요"
                            />
                          </td>
                        </tr>
                      );
                    })}

                    <tr>
                      <td colSpan={2} className="bg-zinc-50/50 p-2.5 dark:bg-zinc-900">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={handleAddColumnCodeMappingEditorRow}
                            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                          >
                            + 행 추가
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {columnCodeMappingDuplicatePopup && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/25 p-3">
                  <div className="w-full max-w-[520px] rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="flex items-start justify-between gap-3 border-b border-zinc-100 p-4 dark:border-zinc-800">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          원본값 중복 안내
                        </div>
                        <div className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                          원본값이 여러 번 정의되어 있습니다. 아래의 변환값으로 적용됩니다. 확인해주세요.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-lg p-1 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        onClick={() => setColumnCodeMappingDuplicatePopup(null)}
                      >
                        <X className="h-4 w-4 text-zinc-500 dark:text-zinc-300" />
                      </button>
                    </div>
                    <div className="max-h-[240px] overflow-auto p-4">
                      <div className="space-y-2">
                        {columnCodeMappingDuplicatePopup.items.map((it) => (
                          <div
                            key={it.key}
                            className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-100"
                          >
                            {it.displayKey}({it.count}건) → {it.lastValue || '-'}
                          </div>
                        ))}
                        {columnCodeMappingDuplicatePopup.moreCount > 0 && (
                          <div className="text-xs text-zinc-500">
                            …외 {columnCodeMappingDuplicatePopup.moreCount}건
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-end border-t border-zinc-100 p-4 dark:border-zinc-800">
                      <button
                        type="button"
                        onClick={() => setColumnCodeMappingDuplicatePopup(null)}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                      >
                        확인
                      </button>
                    </div>
                  </div>
                </div>
              )}
                </>
              )}
            </div>

            <div className="flex flex-shrink-0 flex-col gap-2.5 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
              {columnCodeMappingModalView === 'editor' ? (
                <>
                  {columnCodeMappingSavedMessage ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                      {columnCodeMappingSavedMessage}
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSaveColumnCodeMappingForReuse}
                        className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        변환값 저장
                      </button>
                      <button
                        type="button"
                        onClick={handleEnableColumnAutoApply}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
                      >
                        다음부터 자동 적용
                      </button>
                      {isActiveHeaderAutoApplyEnabled ? (
                        <button
                          type="button"
                          onClick={handleCancelColumnAutoApply}
                          className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-500 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                          자동 적용 취소
                        </button>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleCancelColumnCodeMappingModal}
                        className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60"
                      >
                        적용 되돌리기
                      </button>
                      <button
                        type="button"
                        onClick={handleCloseColumnCodeMappingModal}
                        className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        닫기
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyColumnCodeMappingFromEditor}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                      >
                        미리보기에 적용
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={handleCancelColumnCodeMappingModal}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60"
                  >
                    적용 되돌리기
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseColumnCodeMappingModal}
                    className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    닫기
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isCourierTemplateModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseCourierTemplateModal}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-[900px] h-[90vh] max-h-[90vh] sm:h-[798px] sm:max-h-[798px] flex flex-col p-4 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                업로드 양식 등록 선택
              </h2>
              <button
                onClick={handleCloseCourierTemplateModal}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              </button>
            </div>

            <div className="space-y-2 mb-6 overflow-y-auto flex-1 min-h-0">
              <div className="w-full px-4 py-4 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800">
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                  {trialMode
                    ? '이미 쓰고 계신 주문 업로드 엑셀이 있으신가요?'
                    : '이미 사용 중인 물류센터 업로드 파일이 있으신가요?'}
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">
                  {trialMode ? (
                    <>
                      실제 업로드에 쓰는 엑셀을 등록하면,
                      <br />
                      그 열 구성 그대로 맞춰 집니다.
                      <br />
                      양식이 여러 개면 추가로 등록해 목록에서 관리·선택할 수 있습니다.
                    </>
                  ) : (
                    <>
                      지금 물류센터에 올리는 업로드 엑셀을 등록하면,
                      <br />
                      그 양식 그대로 자동 설정됩니다.
                      <br />
                      물류센터·양식이 여러 개면 추가로 등록해 목록에서 관리·선택할 수 있습니다.
                    </>
                  )}
                </p>
                <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-[13px] leading-relaxed text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                  {trialMode
                    ? '내 업로드 파일: 물류사나 물류센터에서 안내받은 “주문 업로드용 엑셀 파일” 또는 실제 물류 프로그램에 첨부하는 “엑셀파일”입니다.'
                    : '내 업로드 파일: 계약 물류사나 물류센터에서 안내받은 “업로드용 엑셀 파일” 또는 실제 물류 프로그램에 첨부하는 “엑셀파일”입니다.'}
                </p>
                <input
                  ref={courierFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleTemplateFileInputChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={handleTemplateFileClick}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11 rounded-lg font-medium text-sm"
                >
                  내 업로드 파일 등록하기
                </button>
                <button
                  type="button"
                  onClick={handleOpenUserCustomFormatFlow}
                  className={
                    landingEmbed
                      ? 'mt-2 h-11 w-full rounded-lg border border-gray-300 bg-gray-100 font-medium text-sm text-gray-800 hover:bg-gray-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700'
                      : 'mt-2 h-11 w-full rounded-lg border border-emerald-200 bg-emerald-50 font-medium text-sm text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/70'
                  }
                >
                  사용자 지정양식 만들기
                </button>
                <p
                  className={
                    landingEmbed
                      ? 'mt-2 rounded-lg bg-gray-100 px-3 py-2 text-[13px] leading-relaxed text-gray-600 dark:bg-zinc-800/60 dark:text-zinc-300'
                      : 'mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] leading-relaxed text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                  }
                >
                  사용자 지정양식: 주문 파일 헤더를 직접 연결해 거래처 제출용, 자체 관리용 등
                  원하는 열 순서로 만드는 다운로드 엑셀 양식입니다.
                </p>
                {registrationSuccessMessage && (
                  <p className="mt-2 text-xs text-green-600 dark:text-green-400">
                    {registrationSuccessMessage}
                  </p>
                )}
              </div>

              {Array.isArray(recentExcelFormats) && recentExcelFormats.length > 0 && (
                <div className="space-y-2 mt-4">
                  <button
                    onClick={() => setShowRecentTemplate(!showRecentTemplate)}
                    className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-800 text-left hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                  >
                    <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
                      등록된 양식
                      {recentExcelFormats.length > 0 ? ` (${recentExcelFormats.length})` : ''}
                    </span>
                  </button>

                  {showRecentTemplate &&
                    recentExcelFormats.map((format, index) => {
                      const savedDate = new Date(format.createdAt);
                      const dateStr = `${savedDate.getFullYear()}-${String(savedDate.getMonth() + 1).padStart(
                        2,
                        '0',
                      )}-${String(savedDate.getDate()).padStart(2, '0')} ${String(savedDate.getHours()).padStart(
                        2,
                        '0',
                      )}:${String(savedDate.getMinutes()).padStart(2, '0')}`;

                      const isEditing = editingFormatId === format.id;
                      const directBridgeFile = hasDirectHeaderMappings(format.bridgeFile)
                        ? format.bridgeFile
                        : null;
                      const isDirectFileFormat = Boolean(directBridgeFile);
                      const defaultDisplayName =
                        recentExcelFormats.length > 1 ? `등록된 엑셀 양식 ${index + 1}` : '등록된 엑셀 양식';
                      const displayName = resolveUserCustomFormatDisplayName(
                        format.displayName,
                        defaultDisplayName,
                      );
                      const directMappingEntries = directBridgeFile
                        ? format.columnOrder.map((outputHeader) => ({
                            outputHeader,
                            sourceHeader: directBridgeFile.directHeaderMappings[outputHeader] ?? '',
                          }))
                        : [];

                      return (
                        <div
                          key={`${format.id}-${index}`}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-3 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 sm:px-4"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 pt-0.5">
                              <input
                                type="radio"
                                name="selectedFormat"
                                checked={tempSelectedFormatId === format.id}
                                onChange={() => handleTemplateSelect(format.id)}
                                className="w-4 h-4 text-emerald-600 border-gray-300 dark:border-gray-600 dark:bg-zinc-800"
                              />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex-1 min-w-0">
                                  {isEditing ? (
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-nowrap">
                                      <input
                                        type="text"
                                        value={editingDisplayName}
                                        onChange={(e) => setEditingDisplayName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            handleConfirmEditName(format.id);
                                          } else if (e.key === 'Escape') {
                                            handleCancelEditName();
                                          }
                                        }}
                                        autoFocus
                                        className="w-full min-w-0 rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:min-w-[240px]"
                                        placeholder="양식 이름을 입력하세요"
                                      />
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleConfirmEditName(format.id);
                                        }}
                                        className="rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700 sm:whitespace-nowrap"
                                      >
                                        확인
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleCancelEditName();
                                        }}
                                        className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-900 sm:whitespace-nowrap"
                                      >
                                        취소
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="block break-keep text-sm font-bold leading-relaxed text-zinc-900 dark:text-zinc-100">
                                        {displayName}
                                      </span>
                                      {isDirectFileFormat && (
                                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                                          이 파일 헤더 전용
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-left sm:flex-shrink-0 sm:justify-end sm:gap-2">
                                  {!isEditing && (
                                    <>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleStartEditName(format);
                                        }}
                                        disabled={isProtectedFormat(format, trialMode)}
                                        data-ex-tooltip={
                                          trialMode && isTrialDefaultProtectedFormat(format)
                                            ? '체험용 예시 양식 이름은 변경할 수 없습니다.'
                                            : undefined
                                        }
                                        className={`${trialMode && isTrialDefaultProtectedFormat(format) ? 'ex-tooltip-target' : ''} rounded border border-zinc-300 px-2 py-1 text-xs transition-colors dark:border-zinc-700 ${
                                          isProtectedFormat(format, trialMode)
                                            ? 'text-zinc-400 cursor-not-allowed opacity-60'
                                            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                                        }`}
                                      >
                                        이름 변경하기
                                      </button>
                                      {isProtectedFormat(format, trialMode) ? (
                                        <span
                                          data-ex-tooltip="체험용 예시 양식은 삭제할 수 없습니다."
                                          className="ex-tooltip-target cursor-default px-2 py-1 text-xs text-zinc-400"
                                        >
                                          삭제 불가
                                        </span>
                                      ) : (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteFormat(format.id);
                                          }}
                                          className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700"
                                        >
                                          삭제
                                        </button>
                                      )}
                                    </>
                                  )}
                                  <span className="text-xs text-gray-500 dark:text-gray-400 sm:ml-1">{dateStr}</span>
                                </div>
                              </div>

                              <div
                                className={`h-[22px] ${
                                  tempSelectedFormatId === format.id ? 'visible' : 'invisible'
                                }`}
                              >
                                <div className="text-xs text-green-600 dark:text-green-400 mt-0.5 mb-1">
                                  ✔ 이 양식이 사용됩니다
                                </div>
                              </div>

                              <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                                {isDirectFileFormat ? (
                                  <div className="space-y-2">
                                    <div className="rounded-md bg-amber-50 px-2 py-1 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                      이 양식은 등록할 때 사용한 주문파일의 원본 헤더와 연결됩니다. 다른 구조의 파일에는 값이 비어 보일 수 있습니다.
                                    </div>
                                    <div className="grid gap-1 sm:grid-cols-2">
                                      {directMappingEntries.map((entry, idx) => (
                                        <div
                                          key={`${entry.outputHeader}-${idx}`}
                                          className="rounded border border-amber-100 bg-white px-2 py-1 dark:border-amber-900 dark:bg-zinc-900"
                                        >
                                          <div className="font-semibold text-zinc-700 dark:text-zinc-200">
                                            {idx + 1}. 출력: {entry.outputHeader || '(빈 헤더)'}
                                          </div>
                                          <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                                            원본: {entry.sourceHeader || '새 헤더(빈 값)'}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : Array.isArray(format.columnOrder) && format.columnOrder.length > 0 ? (
                                  <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto pr-1 sm:max-h-none sm:overflow-visible sm:pr-0">
                                    {format.columnOrder.map((headerName, idx) => (
                                      <span
                                        key={`${headerName}-${idx}`}
                                        className="inline-flex max-w-full items-center break-keep rounded bg-zinc-100 px-2 py-0.5 leading-relaxed text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                                      >
                                        {headerName || '(빈 헤더)'}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-zinc-400 dark:text-zinc-500">헤더 정보 없음</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800 flex-shrink-0">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                등록된 양식은 브라우저에 안전하게 저장되며, 이 페이지에서만 사용됩니다.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCloseCourierTemplateModal}
                  className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCourierTemplateModal}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm text-white font-medium"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <UploadTemplateChangeReuploadModal
        open={isTemplateChangeReuploadModalOpen}
        onClose={() => setIsTemplateChangeReuploadModalOpen(false)}
        bodyExtra={
          trialMode
            ? '텍스트·이미지로 넣으신 주문이 있었다면, 해당 입력도 다시 진행해 주세요.'
            : undefined
        }
      />

      <DirectMappingEditorModal
        open={directMappingModalOpen}
        accent="emerald"
        sourceHeaders={directMappingSourceHeaders}
        sourceSamples={directMappingSourceSamples}
        renameValues={directMappingRenameValues}
        outputOrder={directMappingOutputOrder}
        customHeaderInputOpen={directMappingCustomHeaderInputOpen}
        newHeaderInput={directMappingNewHeaderInput}
        draggingSourceIndex={directMappingDraggingSourceIndex}
        dragOverOrderIndex={directMappingDragOverOrderIndex}
        onClose={() => {
          setDirectMappingModalOpen(false);
          setDirectMappingConfirmModalOpen(false);
          setDirectMappingPendingColumns([]);
        }}
        onRenameChange={handleDirectMappingRenameChange}
        onAddSourceToOutput={handleAddDirectMappingSourceToOutput}
        onRemoveOutputHeader={handleRemoveDirectMappingOutputHeader}
        onMoveOutputHeader={handleMoveDirectMappingOutputHeader}
        onCustomHeaderInputOpen={setDirectMappingCustomHeaderInputOpen}
        onNewHeaderInputChange={setDirectMappingNewHeaderInput}
        onAddCustomHeader={handleAddDirectMappingCustomHeader}
        onDragStart={handleDirectMappingDragStart}
        onDragOver={handleDirectMappingDragOver}
        onDrop={handleDirectMappingDrop}
        onDragLeave={() => setDirectMappingDragOverOrderIndex(null)}
        onDragEnd={handleDirectMappingDragEnd}
        onCreateFormat={handleCreateDirectMappingFormat}
        getOutputHeaderName={getDirectMappingOutputHeaderName}
      />

      <DirectMappingConfirmModal
        open={directMappingConfirmModalOpen}
        accent="emerald"
        pendingColumns={directMappingPendingColumns}
        isRegistering={isDirectMappingRegistering}
        onClose={() => setDirectMappingConfirmModalOpen(false)}
        onConfirm={handleConfirmDirectMappingFormat}
      />

      <DirectMappingSampleFileModal
        open={directMappingSampleFileModalOpen}
        accent="emerald"
        onClose={() => setDirectMappingSampleFileModalOpen(false)}
        onFileProcess={handleDirectMappingSampleFileProcess}
        onSuccess={handleDirectMappingSampleFileSuccess}
      />

      {/* 더미 없음 안내 모달 */}
      {isEmptyDataModalOpen && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseEmptyDataModal}
        >
          <div 
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-[600px] flex flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                이 파일로는 정보를 어디에 넣어야 할지 알기 어려워요
              </h2>
              <button
                onClick={handleCloseEmptyDataModal}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              </button>
            </div>

            {/* 모달 내용 */}
            <div className="flex-1 overflow-y-auto mb-6">
              {/* 안내 텍스트 */}
              <div className="mb-4">
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
                  아래 예시처럼 연락처·주소·상품 등등 입력되거나 모든 항목을 채울 필요는 없지만
                  <br />
                  꼭 입력이 필요한곳은 위치 확인이 가능하도록 표시된 상태로 저장한 뒤 다시 업로드해 주세요.
                  <br />
                  <br />
                  {trialMode
                    ? '💡 최근에 쓰시던 주문 업로드 엑셀이 있으면 그대로 올려 주셔도 됩니다. 양식 등록 용도이며 고객 정보는 저장·사용되지 않습니다'
                    : '💡 최근에 실제 주문이 들어온 물류센터 업로드 엑셀 파일이 있다면 그 파일을 그대로 올려주셔도 됩니다. 양식 등록 용도이며 고객 정보는 저장·사용되지 않습니다'}
                </p>
              </div>

              {/* 엑셀 템플릿 예시 이미지 */}
              <div className="mb-4">
                <img 
                  src="/excel-template-example.jpg" 
                  alt="엑셀 템플릿 예시"
                  className="w-full border rounded-md"
                />
              </div>

              {/* 안내 문구 */}
              <div className="mb-4 text-center">
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  ⬆ 위 예시처럼 주문 정보가 들어갈 위치에  입력 → 저장 → 다시 업로드
                </p>
              </div>
            </div>

            {/* 모달 하단 버튼 */}
            <div className="flex gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex-shrink-0">
              <button
                onClick={handleCloseEmptyDataModal}
                className="flex-1 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-100 h-11 rounded-lg font-medium transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 기본 CJ 양식 안내 모달 (본페이지·로그인) */}
      {isTemplateOnboardingModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseTemplateOnboardingModal}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-[620px] flex flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                {DEFAULT_CJ_INTRO_COPY.modalTitle}
              </h2>
              <button
                onClick={handleCloseTemplateOnboardingModal}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="안내 닫기"
              >
                <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              </button>
            </div>

            <div className="mb-5">
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">
                {DEFAULT_CJ_INTRO_COPY.modalBodyLogistics}
              </p>
            </div>

            <label className="mb-5 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 select-none">
              <input
                type="checkbox"
                checked={dontShowTemplateGuideForWeek}
                onChange={(e) => setDontShowTemplateGuideForWeek(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              7일 동안 보지 않기
            </label>

            <div className="flex gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <button
                onClick={handleCloseTemplateOnboardingModal}
                className="flex-1 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {DEFAULT_CJ_INTRO_COPY.continueButton}
              </button>
              <button
                onClick={handleGoTemplateRegistrationFromOnboarding}
                className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm text-white font-medium"
              >
                {DEFAULT_CJ_INTRO_COPY.registerButton}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 업로드 양식 없음 안내 모달 */}
      {isNoTemplateModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseNoTemplateModal}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-[600px] flex flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                {trialMode ? '업로드 엑셀 양식 등록 필요' : '물류센터 업로드 양식 등록 필요'}
              </h2>
              <button
                onClick={handleCloseNoTemplateModal}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              </button>
            </div>

            {/* 모달 내용 */}
            <div className="flex-1 overflow-y-auto mb-6">
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
                {noTemplateModalType === 'fixed-input'
                  ? trialMode
                    ? '업로드 엑셀 양식을 먼저 등록해야 고정 입력 설정이 가능합니다.'
                    : '물류센터 업로드 양식을 먼저 등록해야 고정 입력 설정이 가능합니다.'
                  : trialMode
                    ? '업로드 엑셀 양식을 먼저 등록해야 주문 변환이 가능합니다.'
                    : '물류센터 업로드 양식을 먼저 등록해야 물류 주문 변환이 가능합니다.'}
              </p>
            </div>

            {/* 모달 하단 버튼 */}
            <div className="flex gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex-shrink-0">
              <button
                onClick={handleCloseNoTemplateModal}
                className="flex-1 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                닫기
              </button>
              <button
                onClick={handleOpenCourierTemplateFromNoTemplateModal}
                className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm text-white font-medium"
              >
                {trialMode ? '업로드 엑셀 양식 등록하기' : '물류센터 업로드 양식 등록하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 고정 입력 정보 설정 모달 — 배경 클릭·뒤 페이지 조작 차단 (묶음배송 모달과 동일) */}
      <WorkspaceBlockingModalOverlay
        open={isSenderModalOpen}
        aria-labelledby="fixed-input-modal-title"
        themeWrapperClassName={landingEmbed ? 'blue-unified-theme' : ''}
      >
          <div
            className={`${trialMode ? 'trial-sender-modal' : ''} bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-[1482px] h-[88vh] sm:h-[84vh] flex flex-col p-4 sm:p-6`}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
              <h2
                id="fixed-input-modal-title"
                className="text-xl font-semibold text-zinc-900 dark:text-zinc-100"
              >
                고정 입력 정보 설정
              </h2>
              <button
                onClick={handleCloseSenderModal}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              </button>
            </div>

            {/* 통합 안내 문구 */}
            <div className="mb-6 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                모든 주문에 공통으로 쓸 보내는 사람, 물류센터 운임 등을 설정합니다.
                <br />
                주문에 값이 있으면 그 값을 우선하고, 비어 있는 항목에만 고정 입력이 적용됩니다.
                <br />
                <span className="block text-xs text-zinc-500 dark:text-zinc-400 mt-1.5">
                  (예:{' '}
                  <span className="inline-flex flex-wrap items-center gap-x-5 gap-y-1">
                    <span>‘배송 전 연락 주세요’ 있음 → 유지</span>
                    <span aria-hidden="true" className="text-zinc-400">
                      ·
                    </span>
                    <span>없음 → 고정 ‘문 앞에 두세요’</span>
                  </span>
                  )
                </span>
                <br />
                고정 입력은 선택 기능이며, 모든 주문에 동일한 정보가 있을 때만 설정하면 됩니다.
              </p>
            </div>

            {/* 모달 내용 */}
            <div className="flex-1 overflow-y-auto min-h-[400px] pb-2">

              {/* 고정 입력 버튼 영역 */}
              <div className="flex flex-wrap gap-5 mb-6 max-h-[280px] overflow-y-auto">
                {isValidCourierTemplate(courierUploadTemplate) && FIXED_HEADER_ORDER.length > 0 ? (
                  FIXED_HEADER_ORDER.map((headerName, mapIndex) => {
                    // FIXED_HEADER_ORDER의 헤더명으로 courierUploadTemplate.headers에서 헤더와 인덱스 찾기
                    const headerIndex = courierUploadTemplate?.headers?.findIndex(h => h.name === headerName) ?? -1;
                    if (headerIndex === -1) return null;
                    const header = courierUploadTemplate?.headers?.[headerIndex];
                    if (!header) return null;
                    
                    const index = headerIndex;
                    const isEditing = editingHeaderIndex === index;
                    // 값 가져오기: headerInputValues 우선, 없으면 fixedHeaderValues에서
                    const savedValue = fixedHeaderValues[headerName] || '';
                    const inputValue = headerInputValues[index] !== undefined ? headerInputValues[index] : savedValue;
                    // 실제 입력값이 있는지 확인 (공백 제외)
                    const savedValueTrimmed = fixedHeaderValues[headerName]?.trim() || '';
                    const inputValueTrimmed = headerInputValues[index]?.trim() || '';
                    const hasValue = savedValueTrimmed !== '' || (headerInputValues[index] !== undefined && inputValueTrimmed !== '');

                    if (isEditing) {
                      // 입력 모드 UI
                      return (
                        <div
                          key={`${headerName}-${mapIndex}`}
                          className="flex items-center gap-2 px-5 py-2 border-2 border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800"
                        >
                          <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => {
                              setHeaderInputValues(prev => ({
                                ...prev,
                                [index]: e.target.value
                              }));
                            }}
                            className="flex-1 min-w-[120px] px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                            placeholder="입력"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                // 확인 버튼 클릭과 동일한 동작
                                const headerName = header.name;
                                const inputValue = headerInputValues[index] || '';
                                setFixedHeaderValues((prev) =>
                                  patchFixedHeaderEntry(
                                    prev,
                                    headerName,
                                    inputValue,
                                    templateBridgeFile,
                                  ),
                                );
                                setEditingHeaderIndex(null);
                              } else if (e.key === 'Escape') {
                                // 취소 버튼 클릭과 동일한 동작
                                setEditingHeaderIndex(null);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              // 확인: 입력 모드 종료 및 fixedHeaderValues에 저장
                              const headerName = header.name;
                              const inputValue = headerInputValues[index] || '';
                              setFixedHeaderValues((prev) =>
                                patchFixedHeaderEntry(
                                  prev,
                                  headerName,
                                  inputValue,
                                  templateBridgeFile,
                                ),
                              );
                              setEditingHeaderIndex(null);
                            }}
                            className={`${trialMode ? 'trial-modal-primary' : ''} px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium transition-colors`}
                          >
                            확인
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              // 취소: 입력 모드 종료, 입력값 복원
                              setEditingHeaderIndex(null);
                            }}
                            className="px-3 py-1 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-100 rounded text-sm font-medium transition-colors"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              // 삭제: fixedHeaderValues에서 해당 key 제거, headerInputValues에서 해당 항목 제거
                              const headerName = header.name;
                              setFixedHeaderValues((prev) =>
                                deleteFixedHeaderEntry(
                                  prev,
                                  headerName,
                                  templateBridgeFile,
                                ),
                              );
                              setHeaderInputValues(prev => {
                                const newValues = { ...prev };
                                delete newValues[index];
                                return newValues;
                              });
                            }}
                            className="px-3 py-1 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-100 rounded text-sm font-medium transition-colors"
                          >
                            삭제
                          </button>
                        </div>
                      );
                    }

                    // 일반 모드 UI
                    return (
                      <button
                        key={`${headerName}-${mapIndex}`}
                        type="button"
                        className={`px-6 py-2 rounded-lg font-medium cursor-pointer flex flex-col items-center transition-colors relative ${
                          hasValue
                            ? `${trialMode ? 'trial-modal-soft-selected' : 'bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50'} border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100`
                            : 'border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                        }`}
                        onClick={() => {
                          // 입력 모드로 전환
                          setEditingHeaderIndex(index);
                          // 기존 입력값이 없으면 fixedHeaderValues에서 복원하거나 빈 문자열로 초기화
                          if (headerInputValues[index] === undefined) {
                            const savedValue = fixedHeaderValues[headerName] || '';
                            setHeaderInputValues(prev => ({
                              ...prev,
                              [index]: savedValue
                            }));
                          }
                        }}
                      >
                        {hasValue && (
                          <div className={`${trialMode ? 'trial-modal-check-dot' : ''} absolute -top-1.5 -right-1.5 w-5 h-5 bg-emerald-500 dark:bg-emerald-600 rounded-full flex items-center justify-center border-2 border-white dark:border-zinc-900 shadow-sm`}>
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                        {hasValue ? (
                          <>
                            <span className="text-base">{inputValue}</span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                              (표기: {header.name})
                            </span>
                          </>
                        ) : (
                          <span className="text-base">{header.name}</span>
                        )}
                      </button>
                    );
                  }).filter(Boolean)
                ) : (
                  <div className="text-zinc-500 dark:text-zinc-400 text-sm w-full">
                    등록된 업로드 양식이 없습니다.
                  </div>
                )}
              </div>
              
              {/* 고정 입력 안내 영역 */}
              {isValidCourierTemplate(courierUploadTemplate) && FIXED_HEADER_ORDER.some(headerName => fixedHeaderValues[headerName] && fixedHeaderValues[headerName].trim() !== '') && (
                <div className="mt-4 mb-2 p-4 bg-zinc-50 dark:bg-zinc-800/30 rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">
                    현재 설정된 고정 입력 값
                  </h3>
                  <div className="space-y-1.5 mb-3">
                    {FIXED_HEADER_ORDER
                      .filter(headerName => fixedHeaderValues[headerName] && fixedHeaderValues[headerName].trim() !== '')
                      .map((headerName, index) => (
                        <div key={`${headerName}-${index}`} className="text-xs text-zinc-600 dark:text-zinc-400">
                          • {headerName}: {fixedHeaderValues[headerName]}
                        </div>
                      ))}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-500">
                    {trialMode
                      ? '설정된 고정 입력 값은 저장하고 닫기 시 미리보기·변환 결과에 반영됩니다. 엑셀 다운로드는 정식 서비스에서 이용할 수 있습니다.'
                      : '설정된 고정 입력 값은 저장하고 닫기 시 미리보기에 반영되며, 다운로드 파일에도 동일하게 적용됩니다.'}
                  </p>
                </div>
              )}
            </div>

            {/* 모달 하단 버튼 */}
            <div className="flex shrink-0 justify-end border-t border-zinc-200 p-6 dark:border-zinc-800">
              <button
                type="button"
                onClick={handleCloseSenderModal}
                className={`${trialMode ? 'trial-modal-primary' : ''} rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700`}
              >
                저장하고 닫기
              </button>
            </div>
          </div>
      </WorkspaceBlockingModalOverlay>

      {/* 텍스트 물류 주문 변환 안내 모달 */}
      {showTextConvertModal && (
        <div 
          className="fixed inset-0 bg-black/35 flex items-center justify-center z-[9999] p-4 transition-opacity duration-300 ease-out"
          onClick={() => setShowTextConvertModal(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-lg w-full max-w-[468px] p-6 transition-all duration-300 ease-out"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold mb-6 text-gray-900">자동 변환 안내</h3>
            <div className="space-y-4 mb-8">
              <p className="text-base font-medium text-gray-900 leading-relaxed">
                주문정보로 변환하여 주문목록에 추가하겠습니다.
              </p>
              <div className="space-y-3 pl-1">
                <p className="text-sm text-gray-600 leading-relaxed">
                  변환 완료 후 내용을 한 번 더 확인해주세요 ·
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">
                  주문목록에서 수정 가능합니다 ·
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex items-center px-4 py-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={dontShowToday}
                  onChange={(e) => setDontShowToday(e.target.checked)}
                  className="mr-2 w-4 h-4"
                />
                오늘은 보지 않기
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowTextConvertModal(false);
                    setDontShowToday(false); // 모달 닫을 때 체크박스 초기화
                  }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={executeTextConvert}
                  className="px-4 py-2 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors"
                >
                  주문목록으로 추가
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {excelUnlockUi}

      <RequiresAccountOrderModal
        open={requiresAccountModalOpen}
        onClose={() => setRequiresAccountModalOpen(false)}
      />

      <TextConvertResultReviewModal
        isOpen={textConvertReviewModal !== null}
        originalText={textConvertReviewModal?.originalText ?? ''}
        rows={textConvertReviewModal?.rows ?? []}
        pointsPending={textConvertPointsPending}
        onConfirm={handleTextConvertReviewConfirm}
        onApply={handleTextConvertReviewApply}
      />

      <NormalizeQualityNoticeModal
        isOpen={qualityNoticeModal !== 'hidden'}
        variant={qualityNoticeModal === 'hidden' ? 'network' : qualityNoticeModal}
        onClose={() => setQualityNoticeModal('hidden')}
      />

      {/* 스크린샷 물류 주문 변환 모달 */}
      {showScreenshotModal && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          onClick={handleScreenshotModalClose}
        >
          <div 
            className="w-full max-w-[600px] rounded-xl border border-zinc-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">
                {trialMode ? '스크린샷으로 주문 변환' : '스크린샷 물류 주문 변환'}
              </h3>
              <button
                onClick={handleScreenshotModalClose}
                className="rounded-lg p-1 transition-colors hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            {/* 안내 문구 */}
            <div className="mb-6">
              <p className="mb-2 text-sm leading-relaxed text-gray-700">
                주문 화면을 먼저 캡처하세요.
              </p>
              <p className="text-sm leading-relaxed text-gray-700">
                PrintScreen 또는 캡처 도구를 사용한 뒤
              </p>
              <p className="text-sm leading-relaxed text-gray-700">
                Ctrl + V 또는 마우스 우클릭 → 붙여넣기 하세요.
              </p>
            </div>

            {/* 붙여넣기 영역 */}
            <div
              ref={screenshotPasteAreaRef}
              tabIndex={0}
              contentEditable={screenshotStage === 'idle' ? "true" : "false"}
              suppressContentEditableWarning={true}
              onPaste={handlePaste}
              onInput={handleInput}
              onKeyDown={(e) => {
                // idle이 아니면 모든 키 입력 방지
                if (screenshotStage !== 'idle') {
                  e.preventDefault();
                  return;
                }
                // 텍스트 입력 방지 (이미지만 허용)
                if (e.key.toLowerCase() !== 'v' || !(e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                }
              }}
              className={`mb-4 min-h-[300px] w-full cursor-pointer rounded-lg border-2 border-dashed p-6 transition-colors ${
                screenshotStage === 'processing'
                  ? landingEmbed
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-emerald-500 bg-emerald-50'
                  : landingEmbed
                    ? 'border-gray-300 bg-gray-50 hover:border-blue-400'
                    : 'border-gray-300 bg-gray-50 hover:border-emerald-400'
              }`}
              style={{ outline: 'none', userSelect: 'none' }}
            >
              {screenshotStage === 'idle' ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <Upload className="mb-4 h-12 w-12 text-gray-400" />
                  <p className="mb-2 text-sm font-medium text-gray-700">
                    이미지를 붙여넣으세요
                  </p>
                  <p className="text-xs text-gray-500">
                    Ctrl + V 또는 우클릭 → 붙여넣기
                  </p>
                </div>
              ) : screenshotImagePreview ? (
                <div className="relative flex h-full flex-col items-center justify-center">
                  <img
                    src={screenshotImagePreview}
                    alt="붙여넣은 이미지"
                    className="mb-4 max-h-[400px] max-w-full rounded-lg shadow-md"
                  />
                  {screenshotStage === 'processing' ? (
                    <div
                      className={`flex items-center gap-2 ${
                        landingEmbed ? 'text-blue-600' : 'text-emerald-600'
                      }`}
                    >
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-sm font-medium">주문 데이터를 정리중입니다...</span>
                    </div>
                  ) : screenshotStage === 'completed' ? (
                    <div className="flex flex-col items-center gap-2 mt-2">
                      <div className="flex items-center gap-2 text-green-600">
                        <Check className="w-5 h-5" />
                        <span className="text-sm font-medium">스크린샷을 확인하였습니다</span>
                      </div>
                      <p className="text-xs text-gray-600">
                        주문정보를 처리하기 위해 텍스트로 변환하고 있습니다
                      </p>
                      <p className="text-xs text-gray-600">
                        텍스트 완성이 되면 오른쪽{' '}
                        <span className="font-semibold text-emerald-600">
                          {trialMode ? '텍스트로 주문 변환' : '텍스트 물류 주문 변환'}
                        </span>{' '}
                        버튼을 눌러주세요
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* 에러 메시지 */}
            {errorMessageTextImage && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{errorMessageTextImage}</p>
              </div>
            )}

            {/* 하단 버튼 */}
            <div className="flex justify-end gap-3">
              <button
                onClick={handleScreenshotModalClose}
                className={`px-4 py-2 text-sm border border-gray-300 rounded transition-colors ${
                  screenshotStage === 'processing'
                    ? 'hover:bg-red-50 border-red-300 text-red-600'
                    : 'hover:bg-gray-100'
                }`}
              >
                {screenshotStage === 'processing' ? '처리 중단' : '취소'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 텍스트 정리 중 모달 */}
      {showTextProcessingModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4"
        >
          <div 
            className="bg-white rounded-lg shadow-lg w-full max-w-[500px] p-6"
          >
            <div className="flex flex-col items-center justify-center text-center">
              {screenshotStage === 'processing' ? (
                <>
                  <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mb-4" />
                  <p className="text-lg font-semibold text-gray-900 mb-2">
                    {textProcessingSource === 'screenshot' 
                      ? '스크린샷에서 텍스트를 정리중입니다'
                      : '이미지 파일에서 텍스트를 정리중입니다'}
                  </p>
                  <p className="text-sm text-gray-600">
                    텍스트정리가 완료되면 텍스트변환버튼을 눌러 주문목록으로 추가하세요
                  </p>
                </>
              ) : screenshotStage === 'completed' ? (
                <>
                  <Check className="w-12 h-12 text-green-500 mb-4" />
                  <p className="text-lg font-semibold text-gray-900 mb-2">
                    텍스트로 변환이 완료되었습니다
                  </p>
                  <p className="text-sm text-gray-600 mb-4">
                    텍스트 변환하기 버튼을 눌러주세요
                  </p>
                  <button
                    onClick={() => setShowTextProcessingModal(false)}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                  >
                    확인
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {trialMode && isDesktopHoverDevice && (
        <div
          className={`ex-floating-tooltip ${floatingTooltip.visible ? 'is-visible' : ''} ${
            floatingTooltip.visible && floatingTooltip.text.includes('\n')
              ? 'ex-floating-tooltip--multiline'
              : ''
          }`}
          style={{
            left: `${floatingTooltip.x}px`,
            top: `${floatingTooltip.y}px`,
          }}
          aria-hidden="true"
        >
          {floatingTooltip.text}
        </div>
      )}

      {/* 다운로드 상태 모달 */}
      {downloadStatus !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-[400px] p-6 text-center">

            {downloadStatus === "processing" && (
              <>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700 mx-auto mb-4" />
                <p className="font-semibold">파일 생성 중입니다...</p>
                <p className="text-sm text-gray-500 mt-2">
                  잠시만 기다려주세요.
                </p>
              </>
            )}

            {downloadStatus === "done" && (
              <>
                <p className="text-lg font-semibold mb-3">
                  다운로드 완료
                </p>
                <p className="text-sm text-gray-700 mb-2">
                  {downloadModalFileName}
                </p>
                <p className="text-xs text-gray-500">
                  파일은 다운로드 폴더에서 확인하실 수 있습니다.
                </p>
              </>
            )}

          </div>
        </div>
      )}

    </div>
    </>
  );
}

