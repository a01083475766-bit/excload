'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import {
  Truck,
  Search,
  ArrowDown,
  Link2,
  Upload,
  CalendarDays,
  Coins,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Package,
  Trash2,
  Send,
} from 'lucide-react';
import { useUserStore } from '@/app/store/userStore';
import { useExcelFileUnlock } from '@/app/hooks/useExcelFileUnlock';
import { ExcelUnlockCancelledError } from '@/app/lib/excel/protected-file-types';
import { extractTextFromImage } from '@/app/unified-input/adapters/ImageToTextAdapter';
import {
  OrderConvertPreviewTableRow,
  type PreviewRowWithId,
} from '@/app/order-convert/OrderConvertPreviewTableRow';
import {
  BundleShippingModal,
  type BundleShippingApplyPayload,
  type BundleShippingApplySummary,
} from '@/app/order-convert/BundleShippingModal';
import {
  countBundleShippingDuplicateRows,
  detectBundleShippingGroups,
} from '@/app/order-convert/bundle-shipping-utils';
import {
  TextConvertResultReviewModal,
  buildTextConvertReviewRows,
  type TextConvertReviewRow,
} from '@/app/components/TextConvertResultReviewModal';
import { useWorkerSortedRows } from '@/app/hooks/useWorkerSortedRows';
import type { TemplateBridgeFile } from '@/app/pipeline/template/types';
import {
  buildPreviewDownloadAoA,
  buildPreviewDownloadFileName,
  createPreviewDownloadWorkbook,
} from '@/app/lib/excel/preview-download-xlsx';
import {
  convertExcelBufferToHubPreview,
  convertOrderStandardRowsToHubPreview,
  convertTextToHubPreview,
  deductHubConvertPoints,
  loadHubFixedHeaderValues,
  loadHubTemplateBridge,
} from '@/app/lib/order-integration/order-integration-hub-convert';
import { consumeHubPendingFetchTransfer } from '@/app/lib/order-integration/hub-pending-fetch-transfer';
import type { HubPendingFetchTransfer } from '@/app/lib/order-integration/hub-pending-fetch-transfer';
import { HUB_SALES_CHANNEL_IMAGE } from '@/app/lib/order-integration/hub-sales-channel';
import { OrderIntegrationFixedInputModal } from '@/app/components/order-integration/OrderIntegrationFixedInputModal';
import { OrderIntegrationTemplateModal } from '@/app/components/order-integration/OrderIntegrationTemplateModal';
import { OrderIntegrationScreenshotModal } from '@/app/components/order-integration/OrderIntegrationScreenshotModal';
import { OrderIntegrationTextProcessingModal } from '@/app/components/order-integration/OrderIntegrationTextProcessingModal';
import { UploadTemplateChangeReuploadModal } from '@/app/components/UploadTemplateChangeReuploadModal';
import { ExcloudConfirmDialog } from '@/app/components/ExcloudConfirmDialog';
import {
  extractNonEmptyHeaderNames,
  loadCourierUploadTemplate,
} from '@/app/lib/courier-upload-template-storage';
import { usePreviewWorkspaceSession } from '@/app/hooks/usePreviewWorkspaceSession';
import { clearPreviewWorkspace } from '@/app/lib/preview-workspace-session';
import {
  EXCLOAD_PREVIEW_TOOL_BTN,
} from '@/app/lib/ui/excload-preview-ui';

const PREVIEW_TOOL_BTN = EXCLOAD_PREVIEW_TOOL_BTN;
const PREVIEW_BATCH_SIZE = 100;

/** Strict Mode 리마운트 대비: 소비한 주문조회 전달분 */
let pendingFetchSessionCache: HubPendingFetchTransfer | null = null;
let pendingFetchApplied = false;
let pendingFetchInFlight = false;

const HUB_WORKSPACE_PAGE = 'order-integration' as const;

/**
 * 쇼핑몰주문연동 허브 — 미연동 몰 파일·텍스트 변환 + 미리보기.
 * 택배변환과 동일 파이프라인·양식 키(ORDER_CONVERT_KEYS)를 사용합니다.
 */
export default function OrderIntegrationHub() {
  const user = useUserStore((state) => state.user);
  const fetchUser = useUserStore((state) => state.fetchUser);
  const userId = user?.userId ?? null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRowsRef = useRef<PreviewRowWithId[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [textOrder, setTextOrder] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [hubNotice, setHubNotice] = useState<string | null>(null);
  const [hubError, setHubError] = useState<string | null>(null);

  const [previewRows, setPreviewRows] = useState<PreviewRowWithId[]>([]);
  const [courierHeaders, setCourierHeaders] = useState<string[]>([]);
  const [templateBridgeFile, setTemplateBridgeFile] = useState<TemplateBridgeFile | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [newRowIds, setNewRowIds] = useState<Set<string>>(new Set());
  const [userOverrides, setUserOverrides] = useState<Record<string, Record<string, string>>>({});
  const [editingCell, setEditingCell] = useState<{ rowId: string; header: string } | null>(null);
  const [activeCell, setActiveCell] = useState<{ rowId: string; header: string } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [sortConfig, setSortConfig] = useState<{
    header: string;
    direction: 'asc' | 'desc';
  } | null>(null);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [renderedRowCount, setRenderedRowCount] = useState(PREVIEW_BATCH_SIZE);

  const [busy, setBusy] = useState<'file' | 'text' | 'download' | 'fetch' | null>(null);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [fixedInputOpen, setFixedInputOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateReuploadOpen, setTemplateReuploadOpen] = useState(false);
  const [screenshotModalOpen, setScreenshotModalOpen] = useState(false);
  const [textProcessingOpen, setTextProcessingOpen] = useState(false);
  const [textProcessingStage, setTextProcessingStage] = useState<'processing' | 'completed'>(
    'processing',
  );
  const [textProcessingSource, setTextProcessingSource] = useState<'screenshot' | 'imageFile'>(
    'screenshot',
  );
  const nextTextSalesChannelRef = useRef<string | null>(null);
  const ocrCancelledRef = useRef(false);
  const [activeTemplateHeaderCount, setActiveTemplateHeaderCount] = useState(0);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPreviewResetModalOpen, setIsPreviewResetModalOpen] = useState(false);

  const [isBundleShippingModalOpen, setIsBundleShippingModalOpen] = useState(false);
  const [dismissedBundleGroupKeys, setDismissedBundleGroupKeys] = useState<string[]>([]);
  const [bundleShippingButtonAcked, setBundleShippingButtonAcked] = useState(false);
  const [bundleApplyUndo, setBundleApplyUndo] = useState<{
    snapshot: {
      previewRows: PreviewRowWithId[];
      userOverrides: Record<string, Record<string, string>>;
      dismissedBundleGroupKeys: string[];
    };
    summary: BundleShippingApplySummary;
  } | null>(null);

  const [textConvertReviewModal, setTextConvertReviewModal] = useState<{
    originalText: string;
    rows: TextConvertReviewRow[];
  } | null>(null);

  const { unlockExcelFile, excelUnlockUi } = useExcelFileUnlock();

  previewRowsRef.current = previewRows;

  const refreshActiveTemplateStatus = useCallback(() => {
    const template = loadCourierUploadTemplate(userId);
    setActiveTemplateHeaderCount(extractNonEmptyHeaderNames(template).length);
  }, [userId]);

  const refreshTemplateBridge = useCallback(() => {
    try {
      const bridge = loadHubTemplateBridge(userId);
      setTemplateBridgeFile(bridge);
      return bridge;
    } catch {
      setTemplateBridgeFile(null);
      return null;
    }
  }, [userId]);

  useEffect(() => {
    refreshActiveTemplateStatus();
    refreshTemplateBridge();
  }, [refreshActiveTemplateStatus, refreshTemplateBridge]);

  const showNotice = (message: string) => {
    setHubError(null);
    setHubNotice(message);
  };

  const showError = (message: string) => {
    setHubNotice(null);
    setHubError(message);
  };

  const markNewRows = useCallback((rowIds: string[]) => {
    setNewRowIds((prev) => {
      const next = new Set(prev);
      rowIds.forEach((id) => next.add(id));
      return next;
    });
    window.setTimeout(() => {
      setNewRowIds((prev) => {
        const next = new Set(prev);
        rowIds.forEach((id) => next.delete(id));
        return next;
      });
    }, 3000);
  }, []);

  const resetBundleShippingUi = useCallback(() => {
    setIsBundleShippingModalOpen(false);
    setDismissedBundleGroupKeys([]);
    setBundleShippingButtonAcked(false);
    setBundleApplyUndo(null);
  }, []);

  const appendPreview = useCallback(
    (rows: PreviewRowWithId[], headers: string[], bridge?: TemplateBridgeFile | null) => {
      setCourierHeaders(headers);
      if (bridge) setTemplateBridgeFile(bridge);
      setPreviewRows((prev) => [...rows, ...prev]);
      markNewRows(rows.map((row) => row.rowId));
    },
    [markNewRows],
  );

  const tryApplyPendingFetch = useCallback(async () => {
    const fromStorage = consumeHubPendingFetchTransfer();
    if (fromStorage) {
      pendingFetchSessionCache = fromStorage;
      pendingFetchApplied = false;
    }
    const pending =
      fromStorage ??
      (!pendingFetchApplied && pendingFetchSessionCache ? pendingFetchSessionCache : null);
    if (!pending || pendingFetchApplied || pendingFetchInFlight) return;

    pendingFetchInFlight = true;
    setBusy('fetch');
    setStatusLabel('주문조회 결과를 미리보기에 담는 중…');
    try {
      const bridge = refreshTemplateBridge();
      if (!bridge) {
        throw new Error('택배 업로드 양식이 없습니다. 먼저 양식을 등록해 주세요.');
      }
      const fixedHeaderValues = loadHubFixedHeaderValues(userId);
      const result = await convertOrderStandardRowsToHubPreview({
        rows: pending.rows,
        templateBridgeFile: bridge,
        fixedHeaderValues,
      });
      pendingFetchApplied = true;
      pendingFetchSessionCache = null;
      appendPreview(result.previewRows, result.courierHeaders, bridge);
      const mallLabel =
        pending.mallSummaries.length > 0
          ? pending.mallSummaries.map((m) => `${m.name} ${m.count}건`).join(', ')
          : null;
      showNotice(
        mallLabel
          ? `주문조회 → 미리보기 ${result.previewRows.length.toLocaleString()}건 추가 (${mallLabel})`
          : `주문조회 → 미리보기 ${result.previewRows.length.toLocaleString()}건이 추가되었습니다.`,
      );
    } catch (error) {
      showError(error instanceof Error ? error.message : '주문조회 결과를 담지 못했습니다.');
    } finally {
      pendingFetchInFlight = false;
      setBusy(null);
      setStatusLabel(null);
    }
  }, [appendPreview, refreshTemplateBridge, userId]);

  usePreviewWorkspaceSession({
    pageKey: HUB_WORKSPACE_PAGE,
    enabled: true,
    storageUserId: userId,
    previewRows,
    userOverrides,
    courierHeaders,
    sortConfig,
    setPreviewRows,
    setUserOverrides,
    setCourierHeaders,
    setSortConfig,
    fallbackCourierHeaders: templateBridgeFile?.courierHeaders ?? [],
    getFallbackCourierHeaders: () => {
      try {
        return loadHubTemplateBridge(userId).courierHeaders;
      } catch {
        return templateBridgeFile?.courierHeaders ?? [];
      }
    },
    selectedFileName: selectedFiles[0]?.name ?? null,
    uploadedFileMeta: selectedFiles.map((file) => ({
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      type: file.type,
    })),
    textInput: textOrder,
    inputSourceType: null,
    sessionInputCounts: {},
    setSelectedFileName: () => {},
    setUploadedFileMeta: () => {},
    setTextInput: setTextOrder,
    setInputSourceType: () => {},
    setSessionInputCounts: () => {},
    onRestoreSettled: () => {
      void tryApplyPendingFetch();
    },
  });

  const openTextReview = (
    originalText: string,
    rows: PreviewRowWithId[],
    bridge: TemplateBridgeFile,
  ) => {
    setTextConvertReviewModal({
      originalText,
      rows: buildTextConvertReviewRows(
        rows.map((r) => r.rowId),
        rows.map((r) => r.data),
        bridge.courierHeaders,
        bridge.mappedBaseHeaders,
      ),
    });
  };

  const onFilesChosen = (files: FileList | File[]) => {
    const list = Array.from(files).filter((file) => {
      const name = file.name.toLowerCase();
      return (
        name.endsWith('.xlsx') ||
        name.endsWith('.xls') ||
        name.endsWith('.jpg') ||
        name.endsWith('.jpeg') ||
        name.endsWith('.png') ||
        name.endsWith('.gif') ||
        name.endsWith('.webp')
      );
    });
    if (list.length === 0) {
      showError('엑셀(.xlsx/.xls) 또는 이미지 파일만 선택할 수 있습니다.');
      return;
    }
    if (!user) {
      showError('로그인이 필요합니다.');
      return;
    }
    if (busy) {
      showError('다른 변환이 진행 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    setSelectedFiles(list);
    setHubError(null);
    setHubNotice(null);
    void convertFiles(list);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files?.length) {
      onFilesChosen(event.dataTransfer.files);
    }
  };

  const convertFiles = async (files: File[]) => {
    if (files.length === 0) return;

    setBusy('file');
    setHubError(null);
    setHubNotice(null);

    try {
      const bridge = loadHubTemplateBridge(userId);
      setTemplateBridgeFile(bridge);
      const fixed = loadHubFixedHeaderValues(userId);
      let added = 0;
      const imageFiles = files.filter((file) => {
        const name = file.name.toLowerCase();
        return (
          name.endsWith('.jpg') ||
          name.endsWith('.jpeg') ||
          name.endsWith('.png') ||
          name.endsWith('.gif') ||
          name.endsWith('.webp') ||
          file.type.startsWith('image/')
        );
      });
      const excelFiles = files.filter((file) => {
        const name = file.name.toLowerCase();
        return name.endsWith('.xlsx') || name.endsWith('.xls');
      });

      for (const file of excelFiles) {
        setStatusLabel(`${file.name} 엑셀 변환 중…`);
        let buffer: ArrayBuffer;
        try {
          buffer = await unlockExcelFile(file);
        } catch (error) {
          if (error instanceof ExcelUnlockCancelledError) continue;
          throw error;
        }
        const result = await convertExcelBufferToHubPreview({
          buffer,
          templateBridgeFile: bridge,
          fixedHeaderValues: fixed,
          sourceFileName: file.name,
          onStage2ChunkProgress: (completed, total) => {
            if (total > 1) setStatusLabel(`서버 변환 ${completed}/${total}`);
          },
        });
        appendPreview(result.previewRows, result.courierHeaders, bridge);
        added += result.previewRows.length;
      }

      setSelectedFiles([]);
      setStatusLabel(null);

      if (imageFiles.length > 0) {
        setBusy(null);
        await runImageOcrToTextInput(imageFiles, 'imageFile');
        if (added > 0) {
          showNotice(
            `엑셀 ${added.toLocaleString()}건 미리보기 반영 · 이미지는 텍스트 칸에 넣었습니다. 확인 후 「텍스트 주문 변환」을 눌러 주세요.`,
          );
        }
        return;
      }

      showNotice(`변환 완료 · 미리보기에 ${added.toLocaleString()}건이 추가되었습니다.`);
    } catch (error) {
      setStatusLabel(null);
      showError(error instanceof Error ? error.message : '파일 변환 중 오류가 발생했습니다.');
    } finally {
      setBusy(null);
    }
  };

  const runImageOcrToTextInput = async (
    files: File[],
    source: 'screenshot' | 'imageFile',
  ) => {
    if (!user) {
      showError('로그인이 필요합니다.');
      return;
    }
    ocrCancelledRef.current = false;
    setTextProcessingSource(source);
    setTextProcessingStage('processing');
    setTextProcessingOpen(true);
    setHubError(null);

    try {
      const texts: string[] = [];
      for (const file of files) {
        if (ocrCancelledRef.current) return;
        const ocrText = await extractTextFromImage(file);
        if (ocrText.trim()) texts.push(ocrText.trim());
      }
      if (ocrCancelledRef.current) return;

      if (texts.length === 0) {
        setTextProcessingOpen(false);
        showError('이미지에서 텍스트를 읽지 못했습니다.');
        return;
      }

      const merged = texts.join('\n\n');
      setTextOrder(merged);
      nextTextSalesChannelRef.current = HUB_SALES_CHANNEL_IMAGE;
      setTextProcessingStage('completed');
      showNotice('텍스트 칸에 반영했습니다. 내용을 확인·수정한 뒤 「텍스트 주문 변환」을 눌러 주세요.');
    } catch (error) {
      if (ocrCancelledRef.current) return;
      setTextProcessingOpen(false);
      showError(error instanceof Error ? error.message : '이미지 처리 중 오류가 발생했습니다.');
    }
  };

  const handleScreenshotImage = (blob: Blob) => {
    const file = new File([blob], 'screenshot.png', { type: 'image/png' });
    void runImageOcrToTextInput([file], 'screenshot');
  };

  const handleTextConvert = async () => {
    if (busy || !textOrder.trim()) return;
    if (!user) {
      showError('로그인이 필요합니다.');
      return;
    }
    if (user.points < 1) {
      showError('사용량이 부족합니다.');
      return;
    }

    setBusy('text');
    setHubError(null);
    setHubNotice(null);
    setStatusLabel('주문 텍스트 분석 중…');

    try {
      const bridge = loadHubTemplateBridge(userId);
      setTemplateBridgeFile(bridge);
      const fixed = loadHubFixedHeaderValues(userId);
      const trimmed = textOrder.trim();
      const salesChannelFallback =
        nextTextSalesChannelRef.current?.trim() || undefined;
      nextTextSalesChannelRef.current = null;
      const result = await convertTextToHubPreview({
        text: trimmed,
        templateBridgeFile: bridge,
        fixedHeaderValues: fixed,
        salesChannelFallback,
        onStage2ChunkProgress: (completed, total) => {
          if (total > 1) setStatusLabel(`서버 변환 ${completed}/${total}`);
        },
      });

      const pointsOk = await deductHubConvertPoints(Math.max(1, trimmed.length), 'text');
      if (!pointsOk) {
        throw new Error('사용량 차감에 실패했습니다. 잔여 사용량을 확인해 주세요.');
      }
      void fetchUser();

      appendPreview(result.previewRows, result.courierHeaders, bridge);
      setTextOrder('');
      setStatusLabel(null);
      showNotice(
        `텍스트 변환 완료 · 미리보기에 ${result.previewRows.length.toLocaleString()}건이 추가되었습니다.`,
      );
      openTextReview(trimmed, result.previewRows, bridge);
    } catch (error) {
      setStatusLabel(null);
      showError(error instanceof Error ? error.message : '텍스트 변환 중 오류가 발생했습니다.');
    } finally {
      setBusy(null);
    }
  };

  const sortedRows = useWorkerSortedRows(previewRows, sortConfig, userOverrides);

  useEffect(() => {
    const totalRows = sortedRows.length;
    setRenderedRowCount((prev) => {
      if (totalRows === 0) return PREVIEW_BATCH_SIZE;
      if (isPreviewExpanded) return totalRows;
      if (prev >= PREVIEW_BATCH_SIZE) return Math.min(prev, totalRows);
      return Math.min(PREVIEW_BATCH_SIZE, totalRows);
    });
  }, [previewRows.length, courierHeaders.length, isPreviewExpanded, sortedRows.length]);

  const displayRows = useMemo(
    () => (isPreviewExpanded ? sortedRows : sortedRows.slice(0, renderedRowCount)),
    [isPreviewExpanded, sortedRows, renderedRowCount],
  );
  const hasMorePreviewRows = !isPreviewExpanded && sortedRows.length > renderedRowCount;

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
    () =>
      activeBundleShippingGroups
        .map((g) => g.key)
        .sort()
        .join('\u0001'),
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
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        for (const id of deletedSet) next.delete(id);
        return next;
      });
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
    setSelectedRowIds(new Set());
    setBundleApplyUndo(null);
    setBundleShippingButtonAcked(false);
  }, [bundleApplyUndo]);

  const commitCellEdit = useCallback((rowId: string, header: string, value: string) => {
    setUserOverrides((prev) => {
      const row = previewRowsRef.current.find((r) => r.rowId === rowId);
      const base = String(row?.data[header] ?? '');
      const currentOverride = prev[rowId]?.[header];
      const effective = currentOverride !== undefined ? String(currentOverride) : base;
      if (value === effective) return prev;
      return {
        ...prev,
        [rowId]: {
          ...(prev[rowId] ?? {}),
          [header]: value,
        },
      };
    });
  }, []);

  const handlePreviewCellClickStartEdit = useCallback(
    (rowId: string, header: string, displayValue: string) => {
      setEditingValue(displayValue);
      setActiveCell({ rowId, header });
      setEditingCell({ rowId, header });
    },
    [],
  );

  const handlePreviewEditingInputChange = useCallback((v: string) => {
    setEditingValue(v);
  }, []);

  const handlePreviewFinishEditUi = useCallback(() => {
    setEditingCell(null);
    setActiveCell(null);
  }, []);

  const handleDownload = async () => {
    if (busy || previewRows.length === 0 || courierHeaders.length === 0) return;
    if (!user) {
      showError('로그인이 필요합니다.');
      return;
    }

    setBusy('download');
    setHubError(null);
    try {
      const aoa = buildPreviewDownloadAoA(courierHeaders, sortedRows, userOverrides);
      const wb = createPreviewDownloadWorkbook(aoa);
      const fileName = buildPreviewDownloadFileName(new Date(), '엑클로드주문연동');
      const pointsOk = await deductHubConvertPoints(1000, 'download');
      if (!pointsOk) {
        throw new Error('사용량 차감에 실패했습니다. 잔여 사용량을 확인해 주세요.');
      }
      void fetchUser();
      XLSX.writeFile(wb, fileName);
      clearPreviewWorkspace(HUB_WORKSPACE_PAGE, userId);
      clearPreview({ silent: true });
      showNotice(`다운로드 완료 · ${fileName}`);
    } catch (error) {
      showError(error instanceof Error ? error.message : '다운로드 중 오류가 발생했습니다.');
    } finally {
      setBusy(null);
    }
  };

  const clearPreview = (options?: { keepHeaders?: boolean; silent?: boolean }) => {
    clearPreviewWorkspace(HUB_WORKSPACE_PAGE, userId);
    setPreviewRows([]);
    if (!options?.keepHeaders) {
      setCourierHeaders([]);
    }
    setSelectedRowIds(new Set());
    setNewRowIds(new Set());
    setUserOverrides({});
    setEditingCell(null);
    setActiveCell(null);
    setSortConfig(null);
    setIsPreviewExpanded(false);
    setRenderedRowCount(PREVIEW_BATCH_SIZE);
    setSelectedFiles([]);
    setTextOrder('');
    resetBundleShippingUi();
    setIsPreviewResetModalOpen(false);
    if (!options?.silent) {
      showNotice('미리보기를 비웠습니다.');
    }
  };

  const deleteSelectedRows = () => {
    if (selectedRowIds.size === 0) return;
    setPreviewRows((prev) => prev.filter((row) => !selectedRowIds.has(row.rowId)));
    setUserOverrides((prev) => {
      const next = { ...prev };
      for (const id of selectedRowIds) delete next[id];
      return next;
    });
    setSelectedRowIds(new Set());
    setIsDeleteModalOpen(false);
  };

  const previewEmpty = previewRows.length === 0;

  return (
    <div className="bg-zinc-50 pb-4 pt-1.5 dark:bg-black">
      {excelUnlockUi}
      <main className="mx-auto max-w-[1200px] px-3 sm:px-5 lg:px-8">
        <section className="relative pb-3 pt-1">
          <div className="relative mb-2 flex min-h-[38px] w-full items-center justify-center">
            <h1 className="px-2 text-center text-lg font-semibold text-gray-900 sm:px-[212px] sm:text-xl dark:text-zinc-100">
              쇼핑몰주문연동
            </h1>
            <div className="mt-2 flex w-full justify-center sm:absolute sm:right-0 sm:top-1/2 sm:mt-0 sm:w-[200px] sm:-translate-y-1/2 sm:justify-end">
              <Link
                href="/order/integration/connect"
                className="flex h-[38px] w-full max-w-[200px] items-center justify-center gap-1.5 rounded-lg border-2 border-blue-600 bg-white px-3 text-sm font-semibold text-blue-700 shadow-md transition hover:bg-blue-50 dark:border-blue-400 dark:bg-zinc-900 dark:text-blue-300 dark:hover:bg-zinc-800"
                title="쇼핑몰 API 키 등록·테스트"
              >
                <Link2 className="h-4 w-4 shrink-0" aria-hidden />
                쇼핑몰 연동 설정
              </Link>
            </div>
          </div>

          <p className="mb-3 px-2 text-center text-sm leading-relaxed text-gray-600 dark:text-zinc-400">
            API로 연동된 쇼핑몰은 「주문조회 하기」에서 조회한 뒤 미리보기에 담을 수 있고, 아직
            연동되지 않은 쇼핑몰은 이 화면에서 엑셀·텍스트로 변환해 택배 업로드 양식으로 정리합니다.
          </p>

          <div className="flex flex-col gap-2 lg:gap-3">
            <div className="flex w-full flex-col items-stretch gap-2 sm:h-[38px] sm:flex-row sm:items-center sm:gap-2">
              <Link
                href="/order/integration/fetch"
                className="flex h-[38px] w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white shadow-md transition hover:bg-green-700 sm:w-[200px]"
              >
                <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
                주문조회 하기
              </Link>

              {/* 좌 200 + 우 200 기준, sm+에서 가운데 ~200–800px — 안내를 이 슬롯에 두어 세로 출렁임 방지 */}
              <div
                className={`flex min-w-0 items-center overflow-hidden sm:h-[38px] sm:flex-1 ${
                  statusLabel || hubError || hubNotice
                    ? 'min-h-[38px] flex-1'
                    : 'max-sm:hidden'
                }`}
              >
                {statusLabel ? (
                  <div
                    className="flex h-[38px] w-full min-w-0 items-center gap-1.5 truncate rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-xs text-blue-900 sm:text-sm"
                    title={statusLabel}
                  >
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    <span className="min-w-0 truncate">{statusLabel}</span>
                  </div>
                ) : hubError ? (
                  <div
                    className="flex h-[38px] w-full min-w-0 items-center truncate rounded-lg border border-red-200 bg-red-50 px-2.5 text-xs text-red-800 sm:text-sm"
                    role="alert"
                    title={hubError}
                  >
                    <span className="min-w-0 truncate">{hubError}</span>
                  </div>
                ) : hubNotice ? (
                  <div
                    className="flex h-[38px] w-full min-w-0 items-center truncate rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs text-emerald-900 sm:text-sm"
                    role="status"
                    title={hubNotice}
                  >
                    <span className="min-w-0 truncate">{hubNotice}</span>
                  </div>
                ) : null}
              </div>

              <div className="flex h-[38px] w-full shrink-0 justify-center sm:w-[200px] sm:justify-end">
                {user ? (
                  <div className="flex h-[38px] w-full min-w-0 items-center justify-end gap-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-sky-600 px-3 text-white shadow-md sm:w-[200px]">
                    <Coins className="h-4 w-4 shrink-0" />
                    <span className="shrink-0 text-sm font-medium">잔여 사용량</span>
                    <span
                      className="min-w-0 truncate text-sm font-bold tabular-nums"
                      title={String(user.points)}
                    >
                      :{user.points.toLocaleString()}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="w-full rounded-xl border-2 border-blue-500 bg-white p-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
                <div className="flex w-full flex-col lg:w-1/2">
                  <div className="mb-2.5 flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="shrink-0 text-base font-semibold text-gray-900">파일선택</h3>
                    <p className="min-w-0 text-xs leading-relaxed text-gray-600">
                      주문엑셀·이미지 파일을 선택하거나 이 영역에 끌어다 놓아 주세요
                    </p>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    className={`flex h-[180px] w-full cursor-pointer flex-col overflow-hidden rounded-lg border-2 border-dashed bg-gray-50 p-4 transition-colors ${
                      dragOver
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    <div className="flex flex-1 flex-col items-center justify-center gap-2.5 text-center">
                      <Upload className="h-8 w-8 text-gray-400" />
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-gray-700">엑셀파일 · 이미지파일</p>
                        <p className="text-xs text-gray-500">클릭하거나 드래그하여 업로드하세요</p>
                        <p className="mt-1.5 text-xs text-gray-400">(xlsx, xls, jpg, png, gif)</p>
                      </div>
                      {selectedFiles.length > 0 ? (
                        <p className="mt-2 text-sm text-gray-600">
                          선택된 파일: {selectedFiles[0]?.name}
                          {selectedFiles.length > 1 ? ` 외 ${selectedFiles.length - 1}개` : ''}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.png,.jpg,.jpeg,.gif,.webp"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      if (event.target.files?.length) onFilesChosen(event.target.files);
                      event.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      if (!user) {
                        showError('로그인이 필요합니다.');
                        return;
                      }
                      setScreenshotModalOpen(true);
                    }}
                    className="mt-2.5 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    캡처화면 주문변환 (스크린샷 주문 변환)
                  </button>
                </div>

                <div className="flex min-h-0 w-full flex-col border-l-0 border-gray-200 pl-0 lg:w-1/2 lg:border-l lg:pl-5">
                  <div className="mb-2.5 flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="shrink-0 text-base font-semibold text-gray-900">텍스트 주문입력</h3>
                    <p className="min-w-0 text-xs leading-relaxed text-gray-600">
                      카카오톡·문자·주문페이지 등에서 받은 주문내용을 붙여넣어주세요
                    </p>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-2.5">
                    <textarea
                      value={textOrder}
                      onChange={(event) => setTextOrder(event.target.value)}
                      disabled={busy !== null}
                      placeholder={
                        '예) 홍길동 010-1234-5766   무선마우스 2개\n' +
                        '서울시 강남구 테헤란로 123  문앞에 놓아주세요'
                      }
                      className="min-h-[180px] w-full flex-1 basis-0 resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                    />
                    <button
                      type="button"
                      disabled={!textOrder.trim() || busy !== null}
                      onClick={() => void handleTextConvert()}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy === 'text' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      텍스트 주문 변환
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative pb-2 pt-1">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
              <h3 className="text-lg font-semibold text-gray-900">미리보기</h3>
              {!previewEmpty ? (
                <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-zinc-600">
                  {previewRows.length.toLocaleString()}건
                </span>
              ) : null}
            </div>
            <Link
              href="/order/integration/shipments"
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 self-start rounded-lg bg-blue-600 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:self-auto"
            >
              <Send className="h-3.5 w-3.5" aria-hidden />
              송장 매칭·전송
            </Link>
          </div>

          {!previewEmpty ? (
            <div className="mb-2.5 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white px-2.5 py-2 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <button
                  type="button"
                  className={PREVIEW_TOOL_BTN}
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
                  className={PREVIEW_TOOL_BTN}
                  onClick={() => setIsPreviewResetModalOpen(true)}
                  disabled={busy !== null}
                >
                  <RotateCcw className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
                  초기화
                </button>
                {selectedRowIds.size > 0 ? (
                  <button
                    type="button"
                    className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md bg-red-600 px-2.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => setIsDeleteModalOpen(true)}
                    disabled={busy !== null}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    선택 삭제 {selectedRowIds.size}
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
                      className={`${PREVIEW_TOOL_BTN} border border-zinc-200 bg-white`}
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

          {!previewEmpty ? (
            <p className="mb-2 text-xs leading-relaxed text-zinc-500">
              셀 클릭으로 수정 · 헤더 클릭으로 정렬 · 체크 후 선택 삭제
            </p>
          ) : null}

          {!previewEmpty && !isPreviewExpanded ? (
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

          {previewEmpty ? (
            <div className="flex h-[260px] items-center justify-center rounded-xl border border-gray-200 bg-gray-100 px-4 py-10 text-center">
              <p className="max-w-md text-sm leading-relaxed text-gray-500">
                파일·텍스트로 주문을 가져오면 변환 결과가 여기에 표시됩니다.
                <br />
                API 연동 몰은 「주문조회 하기」에서 조회 후 미리보기에 담을 수 있습니다.
              </p>
            </div>
          ) : (
            <div
              className={`overflow-auto rounded-xl border border-gray-200 bg-white preview-scrollbar preview-table-no-copy ${
                isPreviewExpanded ? 'max-h-[750px] h-auto' : 'h-[260px]'
              }`}
            >
              <table className="min-w-max border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-zinc-100">
                  <tr>
                    <th className="w-10 border-b border-zinc-200 px-2 py-2">
                      <input
                        type="checkbox"
                        checked={
                          previewRows.length > 0 &&
                          previewRows.every((row) => selectedRowIds.has(row.rowId))
                        }
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedRowIds(new Set(previewRows.map((row) => row.rowId)));
                          } else {
                            setSelectedRowIds(new Set());
                          }
                        }}
                        aria-label="전체 선택"
                      />
                    </th>
                    {courierHeaders.map((header) => (
                      <th
                        key={header}
                        className="cursor-pointer select-none whitespace-nowrap border-b border-zinc-200 px-2 py-2 font-semibold text-zinc-700"
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
                        <div className="flex items-center gap-1">
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
                          {sortConfig?.header === header ? (
                            <span
                              className={
                                sortConfig.direction === 'asc'
                                  ? 'text-xs text-blue-600'
                                  : 'text-xs text-red-600'
                              }
                            >
                              {sortConfig.direction === 'asc' ? '▲' : '▼'}
                            </span>
                          ) : null}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row) => (
                    <OrderConvertPreviewTableRow
                      key={row.rowId}
                      row={row}
                      courierHeaders={courierHeaders}
                      overridesForRow={userOverrides[row.rowId]}
                      isSelected={selectedRowIds.has(row.rowId)}
                      isNewRow={newRowIds.has(row.rowId)}
                      localEditingHeader={
                        editingCell?.rowId === row.rowId ? editingCell.header : null
                      }
                      localEditingValue={editingCell?.rowId === row.rowId ? editingValue : ''}
                      localActiveHeader={
                        activeCell?.rowId === row.rowId ? activeCell.header : null
                      }
                      onToggleSelect={(rowId, checked) => {
                        setSelectedRowIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(rowId);
                          else next.delete(rowId);
                          return next;
                        });
                      }}
                      onCellClickStartEdit={handlePreviewCellClickStartEdit}
                      onEditingInputChange={handlePreviewEditingInputChange}
                      onCommitEdit={commitCellEdit}
                      onFinishEditUi={handlePreviewFinishEditUi}
                      interactionEnabled
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="relative pb-4 pt-4">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-3 lg:gap-3">
            <button
              type="button"
              onClick={() => setTemplateModalOpen(true)}
              className="flex h-[120px] flex-col justify-center rounded-xl border border-gray-300 bg-gray-200 p-5 transition-colors hover:bg-gray-100"
            >
              <div className="mb-2 flex items-center justify-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                  <Truck className="h-5 w-5 text-gray-500" />
                </div>
                <h3 className="text-center text-sm font-semibold text-gray-900">
                  택배 업로드 양식 등록
                </h3>
              </div>
              <p className="mt-1 text-center text-xs text-gray-500">
                실제 택배사 업로드에 사용하는 엑셀 양식을 등록합니다.
                <br />
                택배주문변환과 같은 양식을 공유합니다.
              </p>
              {activeTemplateHeaderCount > 0 ? (
                <p className="mt-2 line-clamp-1 text-center text-[11px] text-green-700">
                  선택된 양식이 있습니다 (컬럼 {activeTemplateHeaderCount}개)
                </p>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => setFixedInputOpen(true)}
              className="flex h-[120px] flex-col justify-center rounded-xl border border-gray-300 bg-gray-200 p-5 transition-colors hover:bg-gray-100"
            >
              <div className="mb-2 flex items-center justify-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                  <Search className="h-5 w-5 text-gray-500" />
                </div>
                <h3 className="text-center text-sm font-semibold text-gray-900">
                  고정 입력 정보 설정
                </h3>
              </div>
              <p className="mt-1 text-center text-xs text-gray-500">
                보내는 사람 등 고정값을 설정합니다.
                <br />
                택배주문변환과 같은 값을 공유합니다.
              </p>
            </button>

            <button
              type="button"
              disabled={previewEmpty || busy !== null}
              onClick={() => void handleDownload()}
              className="flex h-[120px] flex-col justify-center rounded-xl border border-gray-300 bg-gray-200 p-5 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="mb-2 flex items-center justify-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                  {busy === 'download' ? (
                    <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                  ) : (
                    <ArrowDown className="h-5 w-5 text-gray-500" />
                  )}
                </div>
                <h3 className="text-center text-sm font-semibold text-gray-900">
                  택배 업로드 파일 다운로드
                </h3>
              </div>
              <p className="mt-1 text-center text-xs text-gray-500">
                미리보기 기준으로 택배사 업로드용 엑셀을
                <br />
                내려받습니다.
              </p>
            </button>
          </div>
        </section>
      </main>

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
        title={`선택한 ${selectedRowIds.size}개 항목을 삭제하시겠습니까?`}
        description="선택한 항목을 삭제하고, 나머지 데이터만 유지합니다."
        confirmLabel="삭제"
        variant="danger"
        onCancel={() => setIsDeleteModalOpen(false)}
        onConfirm={deleteSelectedRows}
      />

      <ExcloudConfirmDialog
        open={isPreviewResetModalOpen}
        title="미리보기 초기화"
        description={
          <>
            <p>첨부·주문 정보와 미리보기를 비우고 처음 화면 상태로 되돌립니다.</p>
            <p className="text-zinc-500">등록한 택배 양식·고정 입력은 그대로 둡니다.</p>
          </>
        }
        confirmLabel="초기화"
        variant="warning"
        onCancel={() => setIsPreviewResetModalOpen(false)}
        onConfirm={() => {
          setSelectedFiles([]);
          setTextOrder('');
          clearPreview();
        }}
      />

      <OrderIntegrationScreenshotModal
        open={screenshotModalOpen}
        onClose={() => setScreenshotModalOpen(false)}
        onImagePasted={handleScreenshotImage}
      />

      <OrderIntegrationTextProcessingModal
        open={textProcessingOpen}
        stage={textProcessingStage}
        source={textProcessingSource}
        onConfirmCompleted={() => setTextProcessingOpen(false)}
      />

      <TextConvertResultReviewModal
        isOpen={textConvertReviewModal !== null}
        originalText={textConvertReviewModal?.originalText ?? ''}
        rows={textConvertReviewModal?.rows ?? []}
        onConfirm={() => setTextConvertReviewModal(null)}
        onApply={(overrides) => {
          setUserOverrides((prev) => {
            const next = { ...prev };
            for (const [rowId, rowEdits] of Object.entries(overrides)) {
              next[rowId] = { ...(next[rowId] ?? {}), ...rowEdits };
            }
            return next;
          });
        }}
      />

      <OrderIntegrationFixedInputModal
        open={fixedInputOpen}
        userId={userId}
        previewRows={previewRows}
        onClose={() => setFixedInputOpen(false)}
        onSaved={(_fixed, nextPreviewRows) => {
          setPreviewRows(nextPreviewRows);
          showNotice('고정 입력 정보를 저장했습니다.');
        }}
      />

      <OrderIntegrationTemplateModal
        open={templateModalOpen}
        userId={userId}
        hasOrderWork={
          previewRows.length > 0 || selectedFiles.length > 0 || textOrder.trim().length > 0
        }
        onClose={() => {
          setTemplateModalOpen(false);
          refreshActiveTemplateStatus();
        }}
        onApplied={({ bridgeFile, shouldClearPreview }) => {
          refreshActiveTemplateStatus();
          setTemplateBridgeFile(bridgeFile);
          if (bridgeFile?.courierHeaders?.length) {
            setCourierHeaders(bridgeFile.courierHeaders);
          }
          if (shouldClearPreview) {
            setSelectedFiles([]);
            setTextOrder('');
            clearPreview({
              keepHeaders: Boolean(bridgeFile?.courierHeaders?.length),
              silent: true,
            });
            setTemplateReuploadOpen(true);
          } else {
            showNotice('택배 업로드 양식을 적용했습니다.');
          }
        }}
      />

      <UploadTemplateChangeReuploadModal
        open={templateReuploadOpen}
        onClose={() => setTemplateReuploadOpen(false)}
        bodyExtra="텍스트·이미지로 넣으신 주문이 있었다면, 해당 입력도 다시 진행해 주세요."
      />
    </div>
  );
}
