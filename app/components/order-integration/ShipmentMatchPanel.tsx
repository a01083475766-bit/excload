'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Upload } from 'lucide-react';
import { OrderIntegrationProvider } from '@prisma/client';

import {
  MAX_SHIPMENT_UPLOAD_FILE_BYTES,
} from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
import type { CourierDownloadBundleListItem } from '@/app/lib/order-integration/courier-download/persist-courier-download-bundle';
import type { ManualRegistrationRow } from '@/app/lib/order-integration/courier-download/manual-registration-view';
import type { CourierDownloadBundleOrderRow } from '@/app/lib/order-integration/courier-download/list-courier-download-bundle-orders';
import {
  resolveSelectedDownloadBundleId,
  shouldApplyCourierDownloadBundleListRefresh,
  type CourierDownloadBundleListRefreshSignal,
} from '@/app/lib/order-integration/courier-download/courier-download-bundle-list-refresh';
import {
  SelectedCourierDownloadOrdersPanel,
  type SelectedCourierDownloadOrdersStatus,
} from '@/app/components/order-integration/SelectedCourierDownloadOrdersPanel';
import { CourierDownloadWorkHistoryPanel } from '@/app/components/order-integration/CourierDownloadWorkHistoryPanel';
import { CourierDownloadBundleFilePicker } from '@/app/components/order-integration/CourierDownloadBundleFilePicker';
import {
  buildShipmentMatchPanelViewStateFromConfirmResponse,
  buildShipmentMatchPanelViewStateFromDetailResponse,
  buildShipmentMatchPanelViewStateFromExcludeResponse,
  buildShipmentMatchPanelViewStateFromLinkResponse,
  buildShipmentMatchPanelViewStateFromUpload,
  canShowShipmentMatchConfirmButton,
  canShowShipmentMatchExcludeButton,
  canShowShipmentMatchLinkButton,
  isShipmentMatchPanelRowConfirmed,
  isShipmentMatchPanelRowExcluded,
  isShipmentMatchPanelRowManuallyLinked,
  isShipmentMatchPanelBatchReady,
  type ShipmentMatchPanelViewState,
} from '@/app/lib/order-integration/shipments/adapt-shipment-upload-batch-detail-for-ui';
import type { LinkableOrderListItem } from '@/app/lib/order-integration/shipments/load-linkable-orders-for-shipment-upload-batch';
import {
  downloadShipmentUploadExportFile,
  fetchShipmentUploadBatchDetail,
  fetchShipmentUploadLinkableOrders,
  postShipmentUploadMatchConfirm,
  postShipmentUploadMatchEdit,
  postShipmentUploadMatchExclude,
  postShipmentUploadMatchLink,
  postShipmentUploadTransmit,
  postShipmentUploadTransmissionsVerify,
} from '@/app/lib/order-integration/shipments/shipment-match-panel-confirm-client';
import type { ShipmentUploadPersistSuccessResponse } from '@/app/lib/order-integration/shipments/upload-and-persist-shipment-file';
import {
  buildRecentTransmitGuidance,
  buildRecentTransmitResultView,
  collectVerifiableAttemptIds,
  filterRecentTransmitResults,
  formatRecentTransmitCarrierCell,
  mergeVerificationIntoRecentTransmitView,
  outcomeLabel,
  RECENT_TRANSMIT_COMMON_HINT,
  verificationStatusLabel,
  type RecentTransmitResultView,
} from '@/app/lib/order-integration/transmission/recent-transmit-result-view';
import {
  SHIPMENT_MATCH_TABS,
  buildShipmentMatchSummaryCards,
  filterShipmentMatchDisplayRows,
  getEmptyOrderSnapshotMessage,
  getShipmentMatchStatusMeta,
  mapShipmentMatchFetchError,
  resolveProviderLabel,
  type ShipmentMatchTabId,
} from '@/app/lib/order-integration/shipments/shipment-match-ui';
import type { ShipmentMatchPanelDisplayRow } from '@/app/lib/order-integration/shipments/adapt-shipment-upload-batch-detail-for-ui';
import { ExcloudConfirmDialog } from '@/app/components/ExcloudConfirmDialog';
import {
  LIVE_TRANSMIT_AREA_WARNING,
  LIVE_TRANSMIT_BUTTON_LABEL,
  LIVE_TRANSMIT_FINAL_CONFIRM_LABEL,
  LIVE_TRANSMIT_IN_PROGRESS_LABEL,
  MOCK_TRANSMIT_BUTTON_LABEL,
  decideRealTransmitClick,
  resolveIntegrationAccountIdForLiveTransmitConfirm,
  shouldExecuteLiveTransmitAfterConfirm,
  type SmartstoreLiveTransmitConfirmOrderInput,
  type SmartstoreLiveTransmitConfirmView,
} from '@/app/lib/order-integration/transmission/smartstore-live-transmit-confirm';

/** select: '' = 미선택(업로드 불가), 'none' = 해당 다운로드 없음, id = Bundle */
const DOWNLOAD_BUNDLE_NONE = 'none';

const ACCEPTED_EXTENSIONS = '.csv,.xlsx,.xls';
const TABLE_HEADERS = [
  '선택',
  '전송',
  '상태',
  '쇼핑몰',
  '쇼핑몰 주문번호',
  '엑클로드 관리번호',
  '수취인',
  '전화번호',
  '주소',
  '상품요약',
  '택배사',
  '송장번호',
  '매칭 사유',
  '원본 행',
  '연결',
  '확정',
  '제외',
  '수정',
] as const;

function formatOrderedAt(iso: string | null): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
}

function statusBannerClass(kind: 'success' | 'error' | 'info'): string {
  if (kind === 'success') {
    return 'border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-100';
  }
  if (kind === 'error') {
    return 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100';
  }
  return 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export type ShipmentMatchPanelProps = {
  /**
   * 주문연동 허브 하단 임베드용.
   * true면 뒤로가기·페이지 타이틀을 숨기고 패딩을 허브에 맞춥니다.
   */
  embedded?: boolean;
  /**
   * Hub에서 Bundle 생성 성공 시 nonce 증가 + selectBundleId 전달.
   * 인증 최초 GET과 별도로 목록을 다시 조회하고 신규 Bundle을 선택합니다.
   */
  downloadBundleListRefresh?: CourierDownloadBundleListRefreshSignal | null;
};

export default function ShipmentMatchPanel({
  embedded = false,
  downloadBundleListRefresh = null,
}: ShipmentMatchPanelProps) {
  const { status: sessionStatus } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastHandledBundleRefreshNonceRef = useRef(0);
  const downloadBundleListFetchGenRef = useRef(0);
  const selectedBundleOrdersFetchGenRef = useRef(0);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showAdvancedScope, setShowAdvancedScope] = useState(false);
  const [provider, setProvider] = useState('');
  const [integrationAccountId, setIntegrationAccountId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewState, setViewState] = useState<ShipmentMatchPanelViewState | null>(null);
  const [activeTab, setActiveTab] = useState<ShipmentMatchTabId>('all');
  const [confirmingMatchId, setConfirmingMatchId] = useState<string | null>(null);
  const [excludingMatchId, setExcludingMatchId] = useState<string | null>(null);
  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const [linkPanelMatchId, setLinkPanelMatchId] = useState<string | null>(null);
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [linkableOrders, setLinkableOrders] = useState<LinkableOrderListItem[]>([]);
  const [selectedLinkOrderId, setSelectedLinkOrderId] = useState<string | null>(null);
  const [isLoadingLinkableOrders, setIsLoadingLinkableOrders] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [linkPanelError, setLinkPanelError] = useState<string | null>(null);
  const [isDownloadingExport, setIsDownloadingExport] = useState(false);
  const [exportDownloadError, setExportDownloadError] = useState<string | null>(null);
  const [selectedTransmitMatchIds, setSelectedTransmitMatchIds] = useState<string[]>([]);
  const [transmitMessage, setTransmitMessage] = useState<string | null>(null);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [liveTransmitConfirmView, setLiveTransmitConfirmView] =
    useState<SmartstoreLiveTransmitConfirmView | null>(null);
  const liveTransmitInFlightRef = useRef(false);
  const [recentTransmitView, setRecentTransmitView] = useState<RecentTransmitResultView | null>(null);
  const [recentTransmitFilter, setRecentTransmitFilter] = useState<'all' | 'failed'>('all');
  const [isVerifyingTransmit, setIsVerifyingTransmit] = useState(false);
  const [verifyTransmitMessage, setVerifyTransmitMessage] = useState<string | null>(null);
  const [downloadBundles, setDownloadBundles] = useState<CourierDownloadBundleListItem[]>([]);
  const [selectedDownloadBundleId, setSelectedDownloadBundleId] = useState('');
  const [selectedBundleOrdersStatus, setSelectedBundleOrdersStatus] =
    useState<SelectedCourierDownloadOrdersStatus | null>(null);
  const [selectedBundleOrders, setSelectedBundleOrders] = useState<CourierDownloadBundleOrderRow[]>([]);
  const [manualRegistrationRows, setManualRegistrationRows] = useState<ManualRegistrationRow[]>([]);
  const [manualRegistrationSummary, setManualRegistrationSummary] = useState<{
    ready: number;
    needsTrackingLink: number;
    needsMallOrderInfo: number;
  } | null>(null);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editTrackingNumber, setEditTrackingNumber] = useState('');
  const [editCarrierCode, setEditCarrierCode] = useState('');
  const [editCarrierName, setEditCarrierName] = useState('');

  const inputClass =
    'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100';

  const loadDownloadBundles = useCallback(
    async (mode: 'initial' | 'refresh', preferredBundleId?: string | null) => {
      const fetchGen = ++downloadBundleListFetchGenRef.current;
      try {
        const res = await fetch('/api/order/integration/orders/courier-download-bundles');
        const json = (await res.json().catch(() => null)) as
          | { success?: boolean; bundles?: CourierDownloadBundleListItem[] }
          | null;
        if (fetchGen !== downloadBundleListFetchGenRef.current) return;
        if (!res.ok || !json?.success || !Array.isArray(json.bundles)) return;
        setDownloadBundles(json.bundles);
        setSelectedDownloadBundleId((current) =>
          resolveSelectedDownloadBundleId({
            mode,
            bundles: json.bundles!,
            currentSelectedId: current,
            preferredBundleId,
          }),
        );
      } catch {
        /* ignore list load errors — upload can still proceed with "none" */
      }
    },
    [],
  );

  useEffect(() => {
    if (sessionStatus !== 'authenticated') {
      setDownloadBundles([]);
      setSelectedDownloadBundleId('');
      setSelectedBundleOrdersStatus(null);
      setSelectedBundleOrders([]);
      lastHandledBundleRefreshNonceRef.current = 0;
      downloadBundleListFetchGenRef.current += 1;
      selectedBundleOrdersFetchGenRef.current += 1;
      return;
    }

    void loadDownloadBundles('initial');
  }, [sessionStatus, loadDownloadBundles]);

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    if (
      !shouldApplyCourierDownloadBundleListRefresh(
        downloadBundleListRefresh,
        lastHandledBundleRefreshNonceRef.current,
      )
    ) {
      return;
    }
    lastHandledBundleRefreshNonceRef.current = downloadBundleListRefresh.nonce;
    void loadDownloadBundles('refresh', downloadBundleListRefresh.selectBundleId);
  }, [sessionStatus, downloadBundleListRefresh, loadDownloadBundles]);

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;

    const bundleId = selectedDownloadBundleId.trim();
    if (!bundleId || bundleId === DOWNLOAD_BUNDLE_NONE) {
      selectedBundleOrdersFetchGenRef.current += 1;
      setSelectedBundleOrdersStatus(null);
      setSelectedBundleOrders([]);
      return;
    }

    let cancelled = false;
    const fetchGen = ++selectedBundleOrdersFetchGenRef.current;
    setSelectedBundleOrders([]);
    setSelectedBundleOrdersStatus('loading');

    void (async () => {
      try {
        const res = await fetch(
          `/api/order/integration/orders/courier-download-bundles/${encodeURIComponent(bundleId)}/orders`,
        );
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          orders?: CourierDownloadBundleOrderRow[];
          orderCount?: number;
        } | null;
        if (cancelled || fetchGen !== selectedBundleOrdersFetchGenRef.current) return;
        if (res.status === 404) {
          setSelectedBundleOrders([]);
          setSelectedBundleOrdersStatus('expired');
          return;
        }
        if (!res.ok || !json?.success || !Array.isArray(json.orders)) {
          setSelectedBundleOrders([]);
          setSelectedBundleOrdersStatus('error');
          return;
        }
        setSelectedBundleOrders(json.orders);
        setSelectedBundleOrdersStatus(json.orders.length === 0 ? 'empty' : 'ready');
      } catch {
        if (cancelled || fetchGen !== selectedBundleOrdersFetchGenRef.current) return;
        setSelectedBundleOrders([]);
        setSelectedBundleOrdersStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionStatus, selectedDownloadBundleId]);

  const loadManualRegistration = useCallback(async (uploadBatchId: string) => {
    try {
      const res = await fetch(
        `/api/order/integration/shipments/uploads/${encodeURIComponent(uploadBatchId)}/manual-registration`,
      );
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        rows?: ManualRegistrationRow[];
        summary?: {
          ready: number;
          needsTrackingLink: number;
          needsMallOrderInfo: number;
        };
      } | null;
      if (!res.ok || !json?.success) {
        setManualRegistrationRows([]);
        setManualRegistrationSummary(null);
        return;
      }
      setManualRegistrationRows(Array.isArray(json.rows) ? json.rows : []);
      setManualRegistrationSummary(json.summary ?? null);
    } catch {
      setManualRegistrationRows([]);
      setManualRegistrationSummary(null);
    }
  }, []);

  const summaryCards = useMemo(
    () => (viewState ? buildShipmentMatchSummaryCards(viewState.summary) : []),
    [viewState],
  );

  const filteredRows = useMemo((): ShipmentMatchPanelDisplayRow[] => {
    if (!viewState) return [];
    return filterShipmentMatchDisplayRows(
      viewState.displayRows,
      activeTab,
    ) as ShipmentMatchPanelDisplayRow[];
  }, [activeTab, viewState]);

  const emptySnapshotMessage = useMemo(() => {
    if (!viewState) return null;
    return getEmptyOrderSnapshotMessage(viewState.ordersLoadedCount, viewState.summary.totalRows, {
      emptyReason: viewState.ordersEmptyReason,
      bundleExpired: viewState.ordersBundle?.expired,
    });
  }, [viewState]);

  const isBatchReady = useMemo(
    () => (viewState ? isShipmentMatchPanelBatchReady(viewState) : false),
    [viewState],
  );

  const toggleTransmitSelection = useCallback((matchId: string) => {
    setSelectedTransmitMatchIds((current) =>
      current.includes(matchId) ? current.filter((id) => id !== matchId) : [...current, matchId],
    );
  }, []);

  const assignSelectedFile = useCallback((file: File | null) => {
    setSelectedFile(file);
    setViewState(null);
    setErrorMessage(null);
    setRowActionError(null);
    setActiveTab('all');
    setExportDownloadError(null);
    setSelectedTransmitMatchIds([]);
    setTransmitMessage(null);
    setRecentTransmitView(null);
    setRecentTransmitFilter('all');
    setVerifyTransmitMessage(null);
  }, []);

  const handleFileSelection = useCallback(
    (file: File | null) => {
      if (!file) return;

      const lowerName = file.name.toLowerCase();
      const supported = ['.csv', '.xlsx', '.xls'].some((ext) => lowerName.endsWith(ext));
      if (!supported) {
        setErrorMessage('지원하지 않는 파일 형식입니다. csv, xlsx, xls 파일만 업로드할 수 있습니다.');
        assignSelectedFile(null);
        return;
      }

      if (file.size > MAX_SHIPMENT_UPLOAD_FILE_BYTES) {
        setErrorMessage('파일이 너무 큽니다. 5MB 이하 파일을 업로드해주세요.');
        assignSelectedFile(null);
        return;
      }

      assignSelectedFile(file);
    },
    [assignSelectedFile],
  );

  const handleSubmit = useCallback(async () => {
    if (sessionStatus !== 'authenticated') {
      setErrorMessage('로그인이 필요합니다. 다시 로그인한 뒤 시도해주세요.');
      return;
    }

    if (!selectedFile) {
      setErrorMessage('송장파일을 선택해주세요.');
      return;
    }

    if (!selectedDownloadBundleId) {
      setErrorMessage(
        '이 송장파일이 나온 택배양식 다운로드를 선택하거나, 「해당 다운로드 없음」을 선택해주세요.',
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append(
      'downloadBundleId',
      selectedDownloadBundleId === DOWNLOAD_BUNDLE_NONE ? DOWNLOAD_BUNDLE_NONE : selectedDownloadBundleId,
    );
    if (provider.trim()) formData.append('provider', provider.trim());
    if (integrationAccountId.trim()) {
      formData.append('integrationAccountId', integrationAccountId.trim());
    }
    if (batchId.trim()) formData.append('batchId', batchId.trim());

    try {
      const uploadResponse = await fetch('/api/order/integration/shipments/uploads', {
        method: 'POST',
        body: formData,
      });

      const uploadJson = (await uploadResponse.json().catch(() => null)) as
        | ShipmentUploadPersistSuccessResponse
        | { error?: string }
        | null;

      if (!uploadResponse.ok) {
        const errorBody =
          uploadJson && typeof uploadJson === 'object' && 'error' in uploadJson
            ? { error: uploadJson.error }
            : null;
        setErrorMessage(mapShipmentMatchFetchError(uploadResponse.status, errorBody));
        setViewState(null);
        return;
      }

      if (
        !uploadJson ||
        !('success' in uploadJson) ||
        !uploadJson.success ||
        !uploadJson.uploadBatch?.id
      ) {
        setErrorMessage('파일을 읽는 중 문제가 발생했습니다. 파일 형식을 확인해주세요.');
        setViewState(null);
        return;
      }

      const savedBatchId = uploadJson.uploadBatch.id;
      const detailResult = await fetchShipmentUploadBatchDetail(savedBatchId);

      if (!detailResult.ok) {
        setErrorMessage(detailResult.error);
        setViewState(null);
        return;
      }

      setViewState(buildShipmentMatchPanelViewStateFromUpload(uploadJson, detailResult.body));
      setActiveTab('all');
      await loadManualRegistration(savedBatchId);
    } catch {
      setErrorMessage('네트워크 오류가 발생했습니다. 연결 상태를 확인한 뒤 다시 시도해주세요.');
      setViewState(null);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    batchId,
    integrationAccountId,
    loadManualRegistration,
    provider,
    selectedDownloadBundleId,
    selectedFile,
    sessionStatus,
  ]);

  const handleConfirmMatch = useCallback(
    async (matchId: string) => {
      if (!viewState || sessionStatus !== 'authenticated') {
        setRowActionError('로그인이 필요합니다. 다시 로그인한 뒤 시도해주세요.');
        return;
      }

      setConfirmingMatchId(matchId);
      setRowActionError(null);

      try {
        const result = await postShipmentUploadMatchConfirm(viewState.uploadBatchId, matchId);
        if (!result.ok) {
          setRowActionError(result.error);
          return;
        }

        setViewState(buildShipmentMatchPanelViewStateFromConfirmResponse(result.body, viewState));
      } catch {
        setRowActionError('매칭 확정 중 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      } finally {
        setConfirmingMatchId(null);
      }
    },
    [sessionStatus, viewState],
  );

  const handleExcludeMatch = useCallback(
    async (matchId: string) => {
      if (!viewState || sessionStatus !== 'authenticated') {
        setRowActionError('로그인이 필요합니다. 다시 로그인한 뒤 시도해주세요.');
        return;
      }

      setExcludingMatchId(matchId);
      setRowActionError(null);

      try {
        const result = await postShipmentUploadMatchExclude(viewState.uploadBatchId, matchId);
        if (!result.ok) {
          setRowActionError(result.error);
          return;
        }

        setViewState(buildShipmentMatchPanelViewStateFromExcludeResponse(result.body, viewState));
      } catch {
        setRowActionError('제외 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      } finally {
        setExcludingMatchId(null);
      }
    },
    [sessionStatus, viewState],
  );

  const closeLinkPanel = useCallback(() => {
    setLinkPanelMatchId(null);
    setLinkSearchQuery('');
    setLinkableOrders([]);
    setSelectedLinkOrderId(null);
    setLinkPanelError(null);
    setIsLoadingLinkableOrders(false);
    setIsLinking(false);
  }, []);

  const loadLinkableOrders = useCallback(
    async (query: string) => {
      if (!viewState) return;

      setIsLoadingLinkableOrders(true);
      setLinkPanelError(null);

      try {
        const result = await fetchShipmentUploadLinkableOrders(viewState.uploadBatchId, {
          q: query.trim() || null,
          limit: 30,
        });
        if (!result.ok) {
          setLinkPanelError(result.error);
          setLinkableOrders([]);
          setSelectedLinkOrderId(null);
          return;
        }

        setLinkableOrders(result.body.orders);
        const firstSelectable = result.body.orders.find((order) => !order.usedInShipmentMatch);
        setSelectedLinkOrderId(firstSelectable?.id ?? null);
      } catch {
        setLinkPanelError('연결 가능한 주문 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        setLinkableOrders([]);
        setSelectedLinkOrderId(null);
      } finally {
        setIsLoadingLinkableOrders(false);
      }
    },
    [viewState],
  );

  const handleOpenLinkPanel = useCallback(
    (matchId: string) => {
      setLinkPanelMatchId(matchId);
      setLinkSearchQuery('');
      setLinkableOrders([]);
      setSelectedLinkOrderId(null);
      setLinkPanelError(null);
      void loadLinkableOrders('');
    },
    [loadLinkableOrders],
  );

  const handleLinkMatch = useCallback(async () => {
    if (!viewState || !linkPanelMatchId || !selectedLinkOrderId || sessionStatus !== 'authenticated') {
      setLinkPanelError('연결할 주문을 선택해 주세요.');
      return;
    }

    setIsLinking(true);
    setLinkPanelError(null);
    setRowActionError(null);

    try {
      const result = await postShipmentUploadMatchLink(
        viewState.uploadBatchId,
        linkPanelMatchId,
        selectedLinkOrderId,
      );
      if (!result.ok) {
        setLinkPanelError(
          result.error || '주문 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.',
        );
        return;
      }

      setViewState(buildShipmentMatchPanelViewStateFromLinkResponse(result.body, viewState));
      closeLinkPanel();
    } catch {
      setLinkPanelError('주문 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsLinking(false);
    }
  }, [closeLinkPanel, linkPanelMatchId, selectedLinkOrderId, sessionStatus, viewState]);

  const handleDownloadExport = useCallback(async () => {
    if (!viewState || sessionStatus !== 'authenticated' || !isBatchReady) {
      return;
    }

    setIsDownloadingExport(true);
    setExportDownloadError(null);

    try {
      const result = await downloadShipmentUploadExportFile(viewState.uploadBatchId, {
        format: 'xlsx',
      });
      if (!result.ok) {
        setExportDownloadError(
          result.error || '파일 다운로드에 실패했습니다. 잠시 후 다시 시도해 주세요.',
        );
      }
    } catch {
      setExportDownloadError('파일 다운로드에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsDownloadingExport(false);
    }
  }, [isBatchReady, sessionStatus, viewState]);

  const openEditPanel = useCallback((row: ShipmentMatchPanelDisplayRow) => {
    if (!row.matchId) return;
    setEditingMatchId(row.matchId);
    setEditTrackingNumber(row.trackingNumberValue ?? '');
    setEditCarrierCode(row.carrierCode ?? '');
    setEditCarrierName(row.carrierName ?? '');
    setRowActionError(null);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!viewState || !editingMatchId || sessionStatus !== 'authenticated') return;
    const result = await postShipmentUploadMatchEdit(viewState.uploadBatchId, editingMatchId, {
      trackingNumber: editTrackingNumber,
      carrierCode: editCarrierCode || null,
      carrierName: editCarrierName || null,
    });
    if (!result.ok) {
      setRowActionError(result.error);
      return;
    }
    setViewState(buildShipmentMatchPanelViewStateFromDetailResponse(result.body, viewState));
    setEditingMatchId(null);
  }, [editCarrierCode, editCarrierName, editTrackingNumber, editingMatchId, sessionStatus, viewState]);

  const handleTransmit = useCallback(
    async (mode: 'dry-run' | 'mock' | 'real') => {
      if (!viewState || sessionStatus !== 'authenticated' || selectedTransmitMatchIds.length === 0) {
        setTransmitMessage('전송할 행을 선택해주세요.');
        return;
      }
      if (mode === 'real' && liveTransmitInFlightRef.current) {
        return;
      }
      if (mode === 'real') {
        liveTransmitInFlightRef.current = true;
      }
      setIsTransmitting(true);
      setTransmitMessage(null);
      setVerifyTransmitMessage(null);
      try {
        const result = await postShipmentUploadTransmit(
          viewState.uploadBatchId,
          { matchIds: selectedTransmitMatchIds, retryFailed: true },
          { dryRun: mode === 'dry-run', mock: mode === 'mock' },
        );
        if (!result.ok) {
          setTransmitMessage(result.error);
          return;
        }
        setTransmitMessage(
          mode === 'real'
            ? '실제 전송 처리 완료'
            : mode === 'mock'
              ? 'Mock 테스트 전송 처리 완료'
              : 'Dry-run 처리 완료',
        );
        if (mode !== 'dry-run') {
          const nextView = buildRecentTransmitResultView({
            body: result.body,
            completedAt: new Date().toISOString(),
            displayRows: viewState.displayRows,
          });
          setRecentTransmitView(nextView);
          setRecentTransmitFilter('all');
        } else {
          setRecentTransmitView(null);
        }
        const detail = await fetchShipmentUploadBatchDetail(viewState.uploadBatchId);
        if (detail.ok) {
          setViewState(buildShipmentMatchPanelViewStateFromDetailResponse(detail.body, viewState));
        }
      } finally {
        if (mode === 'real') {
          liveTransmitInFlightRef.current = false;
          setLiveTransmitConfirmView(null);
        }
        setIsTransmitting(false);
      }
    },
    [selectedTransmitMatchIds, sessionStatus, viewState],
  );

  const buildSelectedLiveTransmitOrders = useCallback((): SmartstoreLiveTransmitConfirmOrderInput[] => {
    if (!viewState) return [];
    const selected = new Set(selectedTransmitMatchIds);
    return viewState.displayRows
      .filter((row) => row.matchId && selected.has(row.matchId))
      .map((row) => ({
        matchId: row.matchId as string,
        provider: row.providerLabel,
        mallOrderNo: row.mallOrderNo,
        carrierName: row.carrierName,
        carrierCode: row.carrierCode,
        trackingNumberMasked: row.trackingNumberMasked,
        hasTrackingNumber: row.hasTrackingNumber === true,
        transmissionStatus: row.transmissionStatus,
        matchStatus: row.matchStatus,
        remainQuantity: row.remainQuantity ?? null,
      }));
  }, [selectedTransmitMatchIds, viewState]);

  const handleRealTransmitClick = useCallback(() => {
    if (!viewState || sessionStatus !== 'authenticated') {
      setTransmitMessage('전송할 행을 선택해주세요.');
      return;
    }
    if (isTransmitting || liveTransmitInFlightRef.current) {
      return;
    }
    const selected = new Set(selectedTransmitMatchIds);
    const selectedRows = viewState.displayRows.filter(
      (row) => row.matchId && selected.has(row.matchId),
    );
    const resolvedAccountId = resolveIntegrationAccountIdForLiveTransmitConfirm({
      batchIntegrationAccountId: viewState.integrationAccountId,
      selectedRowIntegrationAccountIds: selectedRows.map((row) => row.integrationAccountId),
    });
    const decision = decideRealTransmitClick({
      selectedOrders: buildSelectedLiveTransmitOrders(),
      batchProvider: viewState.batchProvider,
      integrationAccountId: resolvedAccountId,
      accountDisplayName: null,
      isMockMode: false,
    });
    if (decision.action === 'noop') {
      setTransmitMessage(decision.reason);
      return;
    }
    if (decision.action === 'transmit-direct') {
      void handleTransmit('real');
      return;
    }
    // SMARTSTORE: 확인창만 열고 API는 호출하지 않음
    setLiveTransmitConfirmView(decision.view);
    setTransmitMessage(null);
  }, [
    buildSelectedLiveTransmitOrders,
    handleTransmit,
    isTransmitting,
    selectedTransmitMatchIds,
    sessionStatus,
    viewState,
  ]);

  const handleLiveTransmitConfirmCancel = useCallback(() => {
    if (isTransmitting || liveTransmitInFlightRef.current) return;
    setLiveTransmitConfirmView(null);
  }, [isTransmitting]);

  const handleLiveTransmitFinalConfirm = useCallback(() => {
    if (!liveTransmitConfirmView) return;
    if (
      !shouldExecuteLiveTransmitAfterConfirm({
        canConfirmFinal: liveTransmitConfirmView.canConfirmFinal,
        isMockMode: false,
        isTransmitting: isTransmitting || liveTransmitInFlightRef.current,
      })
    ) {
      return;
    }
    void handleTransmit('real');
  }, [handleTransmit, isTransmitting, liveTransmitConfirmView]);

  const verifiableAttemptIds = useMemo(
    () => (recentTransmitView ? collectVerifiableAttemptIds(recentTransmitView.results) : []),
    [recentTransmitView],
  );

  const filteredRecentTransmitRows = useMemo(
    () =>
      recentTransmitView
        ? filterRecentTransmitResults(recentTransmitView.results, recentTransmitFilter)
        : [],
    [recentTransmitFilter, recentTransmitView],
  );

  const handleVerifyTransmitStatus = useCallback(async () => {
    if (!viewState || sessionStatus !== 'authenticated' || !recentTransmitView) return;
    if (verifiableAttemptIds.length === 0) {
      setVerifyTransmitMessage('확인할 쿠팡·스마트스토어 성공 건이 없습니다.');
      return;
    }
    setIsVerifyingTransmit(true);
    setVerifyTransmitMessage(null);
    try {
      const result = await postShipmentUploadTransmissionsVerify(viewState.uploadBatchId, {
        attemptIds: verifiableAttemptIds,
      });
      if (!result.ok) {
        setVerifyTransmitMessage(result.error);
        return;
      }
      setRecentTransmitView(mergeVerificationIntoRecentTransmitView(recentTransmitView, result.body));
      setVerifyTransmitMessage('상태 확인을 완료했습니다.');
    } finally {
      setIsVerifyingTransmit(false);
    }
  }, [recentTransmitView, sessionStatus, verifiableAttemptIds, viewState]);

  const shellClass = embedded
    ? 'w-full'
    : 'mx-auto max-w-5xl px-4 py-6 pb-10 sm:px-6';

  return (
    <div className={shellClass}>
      {!embedded ? (
        <>
          <Link
            href="/order/integration"
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <ArrowLeft className="h-4 w-4" />
            주문연동으로 돌아가기
          </Link>

          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">송장파일 매칭</h1>
        </>
      ) : null}

      {sessionStatus === 'unauthenticated' ? (
        <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('error')}`}>
          로그인이 필요합니다. 로그인한 뒤 송장파일 매칭을 이용할 수 있습니다.
        </p>
      ) : null}

      {embedded ? (
        <div className="mb-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/40">
          <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">처리 흐름</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-xs leading-snug text-zinc-700 dark:text-zinc-200">
            <span className="font-medium">주문조회</span>
            <span className="text-zinc-400" aria-hidden>
              →
            </span>
            <span className="font-medium">미리보기 확인</span>
            <span className="text-zinc-400" aria-hidden>
              →
            </span>
            <span className="font-medium">택배양식 다운로드</span>
            <span className="text-zinc-400" aria-hidden>
              →
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-1.5 py-0.5 dark:border-zinc-600 dark:bg-zinc-950">
              <span
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-white dark:bg-zinc-200 dark:text-zinc-900"
                aria-label="1"
              >
                1
              </span>
              <span className="font-medium">택배사 업로드</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-1.5 py-0.5 dark:border-zinc-600 dark:bg-zinc-950">
              <span
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-white dark:bg-zinc-200 dark:text-zinc-900"
                aria-label="2"
              >
                2
              </span>
              <span className="font-medium">택배사 송장파일 다운로드</span>
            </span>
            <span className="text-zinc-400" aria-hidden>
              →
            </span>
            <span className="font-semibold text-blue-700 dark:text-blue-300">
              송장 매칭·쇼핑몰 전송
            </span>
            <span className="text-zinc-400" aria-hidden>
              →
            </span>
            <span className="font-medium">쇼핑몰 전송</span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            아래 업로드는 매칭 단계입니다. 쇼핑몰 전송은 매칭·확정 후 별도로 실행합니다. (메뉴
            「송장파일변환」과 다름)
          </p>
        </div>
      ) : null}

      <section
        className={`${embedded ? 'mt-0' : 'mt-6'} rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {embedded ? '송장 매칭·쇼핑몰 전송' : '택배사 송장파일 업로드'}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            지원 형식: csv, xlsx, xls · 최대 {formatFileSize(MAX_SHIPMENT_UPLOAD_FILE_BYTES)}
          </p>
        </div>

        <div
          className={`mt-3 rounded-lg border border-dashed transition-colors ${
            embedded ? 'px-4 py-10 sm:py-12' : 'p-4'
          } ${
            isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
              : selectedFile
                ? 'border-blue-400 bg-blue-50/60 dark:border-blue-700 dark:bg-blue-950/20'
                : 'border-zinc-300 bg-zinc-50 hover:border-zinc-400 dark:border-zinc-600 dark:bg-zinc-900/60'
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            const file = event.dataTransfer.files?.[0] ?? null;
            handleFileSelection(file);
          }}
        >
          <div
            role="button"
            tabIndex={0}
            className="flex cursor-pointer flex-col items-center gap-1.5 text-center"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <Upload className="h-6 w-6 text-zinc-400" />
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              택배사에서 받은 송장번호 파일을 선택하거나 이 영역에 끌어다 놓으세요
            </p>
            {selectedFile ? (
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                선택됨: {selectedFile.name} ({formatFileSize(selectedFile.size)})
              </p>
            ) : (
              <p className="text-xs text-zinc-500">(송장번호 필수) · csv, xlsx, xls</p>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              handleFileSelection(file);
              event.target.value = '';
            }}
          />
        </div>

        <button
          type="button"
          className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300"
          onClick={() => setShowAdvancedScope((open) => !open)}
        >
          {showAdvancedScope ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          매칭 범위 설정 (선택)
        </button>

        {showAdvancedScope ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block text-xs text-zinc-600 dark:text-zinc-300">
              쇼핑몰
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                className={`${inputClass} mt-1`}
              >
                <option value="">전체</option>
                {Object.values(OrderIntegrationProvider).map((value) => (
                  <option key={value} value={value}>
                    {resolveProviderLabel(value) ?? value}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-zinc-600 dark:text-zinc-300">
              연동 계정 ID
              <input
                value={integrationAccountId}
                onChange={(event) => setIntegrationAccountId(event.target.value)}
                className={`${inputClass} mt-1`}
                placeholder="integrationAccountId"
              />
            </label>
            <label className="block text-xs text-zinc-600 dark:text-zinc-300">
              배치 ID
              <input
                value={batchId}
                onChange={(event) => setBatchId(event.target.value)}
                className={`${inputClass} mt-1`}
                placeholder="batchId"
              />
            </label>
          </div>
        ) : null}

        <CourierDownloadBundleFilePicker
          bundles={downloadBundles}
          selectedBundleId={selectedDownloadBundleId}
          onSelect={setSelectedDownloadBundleId}
          disabled={sessionStatus !== 'authenticated' || isSubmitting}
        />

        {selectedBundleOrdersStatus ? (
          <SelectedCourierDownloadOrdersPanel
            status={selectedBundleOrdersStatus}
            orders={selectedBundleOrders}
          />
        ) : null}

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={
            isSubmitting ||
            sessionStatus !== 'authenticated' ||
            !selectedDownloadBundleId
          }
          className="mt-3 inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          송장파일 매칭하기
        </button>

        {sessionStatus === 'authenticated' ? (
          <CourierDownloadWorkHistoryPanel
            bundles={downloadBundles}
            selectedBundleId={selectedDownloadBundleId}
            onSelectForMatching={(bundleId) => setSelectedDownloadBundleId(bundleId)}
            onBundlesChanged={() => {
              void loadDownloadBundles('refresh');
            }}
            disabled={isSubmitting}
          />
        ) : null}
      </section>

      {!embedded ? (
        <section className={`mt-3 rounded-lg border px-3 py-2.5 text-sm ${statusBannerClass('info')}`}>
          <p>택배사 프로그램에서 받은 송장파일을 업로드하면 기존 주문과 송장번호를 매칭합니다.</p>
          <p className="mt-1 font-medium">아직 쇼핑몰에 송장전송되지 않습니다.</p>
          <p className="mt-1">
            업로드한 매칭 결과는 저장되며, 아래에서 확정·송장전송을 진행합니다.
          </p>
        </section>
      ) : null}

      {errorMessage ? (
        <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('error')}`}>
          {errorMessage}
        </p>
      ) : null}

      {rowActionError ? (
        <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('error')}`}>
          {rowActionError}
        </p>
      ) : null}

      {exportDownloadError ? (
        <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('error')}`}>
          {exportDownloadError}
        </p>
      ) : null}

      {viewState ? (
        <section className={`${embedded ? 'mt-3' : 'mt-6'} space-y-3`}>
          <div className={`rounded-lg border px-3 py-2 text-sm ${statusBannerClass('success')}`}>
            <p>
              파일 <strong>{viewState.file.name}</strong> · {viewState.parse.rowCount}행 읽음 · 주문
              스냅샷 {viewState.ordersLoadedCount}건 로드
            </p>
            <p className="mt-1 text-xs">
              저장된 업로드 배치 ID: <span className="font-mono">{viewState.uploadBatchId}</span>
            </p>
            {viewState.parse.warningCount > 0 ? (
              <p className="mt-1 text-xs">파싱 경고 {viewState.parse.warningCount}건이 있습니다.</p>
            ) : null}
          </div>

          {emptySnapshotMessage ? (
            <p className={`rounded-lg border px-3 py-2 text-sm ${statusBannerClass('info')}`}>
              {emptySnapshotMessage}
            </p>
          ) : null}

          {manualRegistrationRows.length > 0 || manualRegistrationSummary ? (
            <div className="rounded-md border border-zinc-200 bg-white px-2.5 py-2 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                  수동 등록 안내
                </span>
                {manualRegistrationSummary ? (
                  <span className="text-xs text-zinc-600 dark:text-zinc-300">
                    준비됨 {manualRegistrationSummary.ready} · 송장 연결 필요{' '}
                    {manualRegistrationSummary.needsTrackingLink} · 확인 필요{' '}
                    {manualRegistrationSummary.needsMallOrderInfo}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                엑셀·텍스트로 내려받은 주문입니다. 몰 관리자에 직접 등록하세요. API 전송 대상이 아닙니다.
              </p>
              {manualRegistrationRows.length > 0 ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-700">
                        <th className="px-1.5 py-1 font-medium">상태</th>
                        <th className="px-1.5 py-1 font-medium">출처</th>
                        <th className="px-1.5 py-1 font-medium">쇼핑몰</th>
                        <th className="px-1.5 py-1 font-medium">주문번호</th>
                        <th className="px-1.5 py-1 font-medium">택배사</th>
                        <th className="px-1.5 py-1 font-medium">송장번호</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manualRegistrationRows.map((row) => (
                        <tr
                          key={row.workItemId}
                          className="border-b border-zinc-100 dark:border-zinc-800"
                        >
                          <td className="px-1.5 py-1 text-zinc-800 dark:text-zinc-100">
                            {row.statusLabel}
                          </td>
                          <td className="px-1.5 py-1 text-zinc-600 dark:text-zinc-300">
                            {row.inputSource}
                          </td>
                          <td className="px-1.5 py-1 text-zinc-800 dark:text-zinc-100">
                            {row.sourceMallLabel}
                          </td>
                          <td className="px-1.5 py-1 font-mono text-zinc-800 dark:text-zinc-100">
                            {row.mallOrderNo || '-'}
                          </td>
                          <td className="px-1.5 py-1 text-zinc-600 dark:text-zinc-300">
                            {row.carrierName || '-'}
                          </td>
                          <td className="px-1.5 py-1 font-mono text-zinc-800 dark:text-zinc-100">
                            {row.trackingNumber || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}

          <section
            className={`rounded-lg border px-3 py-3 ${
              isBatchReady
                ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
                : 'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/60'
            }`}
          >
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              쇼핑몰 업로드용 파일
            </h3>
            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
              {isBatchReady
                ? '모든 송장 매칭 처리가 완료되었습니다. 쇼핑몰 관리자에 업로드할 파일을 다운로드할 수 있습니다.'
                : '확정, 제외, 주문 연결을 모두 완료하면 업로드용 파일을 다운로드할 수 있습니다.'}
            </p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              이 파일은 쇼핑몰에 직접 전송되지 않습니다. 다운로드 후 각 쇼핑몰 관리자에서 업로드해
              주세요.
            </p>
            <button
              type="button"
              onClick={() => void handleDownloadExport()}
              disabled={!isBatchReady || isDownloadingExport || sessionStatus !== 'authenticated'}
              className="mt-3 inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDownloadingExport ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {isDownloadingExport ? '파일 준비 중…' : '쇼핑몰 업로드용 엑셀 다운로드'}
            </button>
          </section>

          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() => {
                  if (card.tabId) setActiveTab(card.tabId);
                }}
                className={`rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-left transition dark:border-zinc-700 dark:bg-zinc-900 ${
                  card.tabId && activeTab === card.tabId
                    ? 'border-blue-500 ring-1 ring-blue-500'
                    : 'hover:border-zinc-300'
                }`}
              >
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{card.label}</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {card.count}
                </p>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SHIPMENT_MATCH_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium transition ${
                  activeTab === tab.id
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                쇼핑몰 전송 · 선택 {selectedTransmitMatchIds.length}건
              </span>
              <button
                type="button"
                onClick={() => void handleTransmit('dry-run')}
                disabled={isTransmitting || selectedTransmitMatchIds.length === 0}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
              >
                Dry-run
              </button>
              <button
                type="button"
                onClick={() => void handleTransmit('mock')}
                disabled={isTransmitting || selectedTransmitMatchIds.length === 0}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-sky-300 bg-sky-50 px-3 text-xs font-semibold text-sky-900 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
              >
                {MOCK_TRANSMIT_BUTTON_LABEL}
              </button>
              <button
                type="button"
                onClick={handleRealTransmitClick}
                disabled={isTransmitting || selectedTransmitMatchIds.length === 0}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-red-300 bg-red-50 px-3 text-xs font-semibold text-red-800 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
              >
                {LIVE_TRANSMIT_BUTTON_LABEL}
              </button>
              {isTransmitting ? <Loader2 className="h-4 w-4 animate-spin text-zinc-500" /> : null}
              {transmitMessage ? (
                <span className="text-xs text-zinc-600 dark:text-zinc-300">{transmitMessage}</span>
              ) : null}
            </div>
            <p className="text-[11px] leading-snug text-red-700 dark:text-red-300">
              {LIVE_TRANSMIT_AREA_WARNING}
            </p>
            {viewState.batchProvider === 'SMARTSTORE' ||
            viewState.batchProvider === '스마트스토어' ? (
              <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                남은 발송 수량은 주문조회·택배양식 다운로드 저장 시점 기준입니다. 값이 없으면
                주문을 다시 조회하고 택배양식을 새로 다운로드하세요.
              </p>
            ) : null}
          </div>

          {recentTransmitView ? (
            <div className="rounded-md border border-zinc-200 bg-white px-2.5 py-2 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                  방금 전송 결과
                </span>
                <span className="text-xs text-zinc-600 dark:text-zinc-300">
                  대상 {recentTransmitView.summary.requested}건 · 성공{' '}
                  {recentTransmitView.summary.success} · 실패 {recentTransmitView.summary.failed} ·
                  제외 {recentTransmitView.summary.skipped}
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {new Date(recentTransmitView.completedAt).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRecentTransmitFilter('all')}
                    className={`inline-flex h-7 items-center rounded-md border px-2 text-xs font-medium transition ${
                      recentTransmitFilter === 'all'
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200'
                    }`}
                  >
                    전체 보기
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecentTransmitFilter('failed')}
                    className={`inline-flex h-7 items-center rounded-md border px-2 text-xs font-medium transition ${
                      recentTransmitFilter === 'failed'
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200'
                    }`}
                  >
                    실패만 보기
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleVerifyTransmitStatus()}
                    disabled={
                      isVerifyingTransmit || isTransmitting || verifiableAttemptIds.length === 0
                    }
                    className="inline-flex h-7 items-center rounded-md border border-zinc-300 bg-white px-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
                  >
                    {isVerifyingTransmit ? '확인 중…' : '상태 다시 확인'}
                  </button>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                {buildRecentTransmitGuidance(recentTransmitView.summary)}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                {RECENT_TRANSMIT_COMMON_HINT} 전송 성공·불확실(UNCERTAIN)한 쿠팡·스마트스토어
                건을 확인할 수 있습니다. 반영 대기·송장 불일치 시 자동 재전송하지 마세요.
              </p>
              {verifyTransmitMessage ? (
                <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                  {verifyTransmitMessage}
                </p>
              ) : null}
              <div className="mt-2 overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-700">
                <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
                  <thead className="bg-zinc-50 dark:bg-zinc-950">
                    <tr>
                      {['결과', '쇼핑몰', '주문번호', '택배사·송장번호', '처리 결과', '쇼핑몰 반영'].map(
                        (header) => (
                          <th
                            key={header}
                            className="whitespace-nowrap px-2.5 py-1.5 text-left text-[11px] font-semibold text-zinc-600 dark:text-zinc-300"
                          >
                            {header}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
                    {filteredRecentTransmitRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-2.5 py-4 text-center text-xs text-zinc-500 dark:text-zinc-400"
                        >
                          표시할 전송 결과가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredRecentTransmitRows.map((row) => (
                        <tr key={`${row.matchId}-${row.attemptId ?? 'na'}`}>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-100">
                            {outcomeLabel(row.outcome)}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-200">
                            {row.providerLabel}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-200">
                            {row.mallOrderNo ?? '-'}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-200">
                            {formatRecentTransmitCarrierCell(row)}
                          </td>
                          <td className="max-w-[16rem] px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-200">
                            <span className="line-clamp-2" title={row.message}>
                              {row.message}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-200">
                            {verificationStatusLabel(row.verificationStatus, {
                              confirmedItems: row.confirmedItems,
                              totalItems: row.totalItems,
                            })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  {TABLE_HEADERS.map((header) => (
                    <th
                      key={header}
                      className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-300"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={TABLE_HEADERS.length}
                      className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
                    >
                      표시할 매칭 결과가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, index) => {
                    const statusMeta = getShipmentMatchStatusMeta(row.matchStatus);
                    return (
                      <tr key={`${row.shipmentRowIndex}-${row.matchStatus}-${index}`}>
                        <td className="whitespace-nowrap px-3 py-2">
                          {row.matchId && row.hasLinkedOrder ? (
                            <input
                              type="checkbox"
                              checked={selectedTransmitMatchIds.includes(row.matchId)}
                              onChange={() => toggleTransmitSelection(row.matchId!)}
                              aria-label="전송 행 선택"
                            />
                          ) : (
                            <span className="text-xs text-zinc-400">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta.badgeClass}`}
                          >
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-700 dark:text-zinc-200">
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-semibold dark:bg-zinc-800">
                            {row.transmissionStatus ?? '-'}
                          </span>
                          {row.transmissionErrorMessage ? (
                            <span className="ml-1 text-red-600 dark:text-red-300">
                              {row.transmissionErrorMessage}
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-800 dark:text-zinc-200">
                          {row.providerLabel ?? '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-800 dark:text-zinc-200">
                          {row.mallOrderNo ?? '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-800 dark:text-zinc-200">
                          {row.excloadOrderNo ?? '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-800 dark:text-zinc-200">
                          {row.receiverName ?? '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-800 dark:text-zinc-200">
                          {row.receiverPhoneMasked ?? '-'}
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2 text-zinc-800 dark:text-zinc-200">
                          {row.receiverAddressMasked ?? '-'}
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-2 text-zinc-800 dark:text-zinc-200">
                          {row.productSummary ?? '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-800 dark:text-zinc-200">
                          {row.carrierName ?? '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-800 dark:text-zinc-200">
                          {row.trackingNumberMasked ?? '-'}
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2 text-zinc-800 dark:text-zinc-200">
                          {row.matchReason}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-800 dark:text-zinc-200">
                          {row.shipmentRowIndex + 1}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {isShipmentMatchPanelRowManuallyLinked(row) ? (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                              연결됨
                            </span>
                          ) : canShowShipmentMatchLinkButton(row) ? (
                            <button
                              type="button"
                              onClick={() => handleOpenLinkPanel(row.matchId!)}
                              className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/60"
                            >
                              주문 연결
                            </button>
                          ) : (
                            <span className="text-xs text-zinc-400">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {isShipmentMatchPanelRowConfirmed(row) ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800 dark:bg-green-950 dark:text-green-200">
                              확정됨
                            </span>
                          ) : canShowShipmentMatchConfirmButton(row) ? (
                            <button
                              type="button"
                              onClick={() => void handleConfirmMatch(row.matchId!)}
                              disabled={confirmingMatchId === row.matchId}
                              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {confirmingMatchId === row.matchId ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : null}
                              확정
                            </button>
                          ) : (
                            <span className="text-xs text-zinc-400">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {isShipmentMatchPanelRowExcluded(row) ? (
                            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                              제외됨
                            </span>
                          ) : canShowShipmentMatchExcludeButton(row) ? (
                            <button
                              type="button"
                              onClick={() => void handleExcludeMatch(row.matchId!)}
                              disabled={excludingMatchId === row.matchId}
                              className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            >
                              {excludingMatchId === row.matchId ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : null}
                              {excludingMatchId === row.matchId ? '제외 중…' : '제외'}
                            </button>
                          ) : (
                            <span className="text-xs text-zinc-400">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {row.matchId && row.transmissionStatus !== 'SENT' ? (
                            <button
                              type="button"
                              onClick={() => openEditPanel(row)}
                              className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            >
                              수정
                            </button>
                          ) : (
                            <span className="text-xs text-zinc-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {editingMatchId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipment-edit-panel-title"
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <h3 id="shipment-edit-panel-title" className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                송장정보 수정
              </h3>
            </div>
            <div className="space-y-3 px-4 py-4">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                송장번호
                <input
                  value={editTrackingNumber}
                  onChange={(event) => setEditTrackingNumber(event.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                택배사 코드
                <input
                  value={editCarrierCode}
                  onChange={(event) => setEditCarrierCode(event.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                택배사명
                <input
                  value={editCarrierName}
                  onChange={(event) => setEditCarrierName(event.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => setEditingMatchId(null)}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleSaveEdit()}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {linkPanelMatchId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipment-link-panel-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <h3
                id="shipment-link-panel-title"
                className="text-base font-bold text-zinc-900 dark:text-zinc-100"
              >
                연결할 주문 선택
              </h3>
            </div>

            <div className="space-y-4 overflow-y-auto px-4 py-4">
              <div className="flex gap-2">
                <input
                  value={linkSearchQuery}
                  onChange={(event) => setLinkSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void loadLinkableOrders(linkSearchQuery);
                    }
                  }}
                  placeholder="주문번호, 이름, 전화번호 일부로 검색"
                  className={`${inputClass} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => void loadLinkableOrders(linkSearchQuery)}
                  disabled={isLoadingLinkableOrders}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  검색
                </button>
              </div>

              {linkPanelError ? (
                <p className={`rounded-lg border px-3 py-2 text-sm ${statusBannerClass('error')}`}>
                  {linkPanelError}
                </p>
              ) : null}

              {isLoadingLinkableOrders ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  주문 목록을 불러오는 중…
                </div>
              ) : linkableOrders.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  연결할 주문을 찾지 못했습니다.
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
                  {linkableOrders.map((order) => {
                    const isUsed = order.usedInShipmentMatch;
                    const isSelected = selectedLinkOrderId === order.id;
                    return (
                      <li key={order.id}>
                        <label
                          className={`flex cursor-pointer gap-3 px-3 py-3 transition ${
                            isUsed
                              ? 'cursor-not-allowed bg-zinc-50 opacity-70 dark:bg-zinc-950/40'
                              : isSelected
                                ? 'bg-blue-50 dark:bg-blue-950/30'
                                : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
                          }`}
                        >
                          <input
                            type="radio"
                            name="linkable-order"
                            value={order.id}
                            checked={isSelected}
                            disabled={isUsed}
                            onChange={() => setSelectedLinkOrderId(order.id)}
                            className="mt-1"
                          />
                          <div className="min-w-0 flex-1 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                {resolveProviderLabel(order.provider) ?? order.provider}
                              </span>
                              {isUsed ? (
                                <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                                  이미 사용됨
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                              엑클로드 관리번호: {order.excloadOrderNo}
                            </p>
                            <p className="text-xs text-zinc-600 dark:text-zinc-300">
                              쇼핑몰 주문번호: {order.mallOrderNo}
                            </p>
                            <p className="text-xs text-zinc-600 dark:text-zinc-300">
                              수취인: {order.recipientName ?? '-'} · {order.recipientPhone ?? '-'}
                            </p>
                            <p className="truncate text-xs text-zinc-600 dark:text-zinc-300">
                              주소: {order.address ?? '-'}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                              주문일: {formatOrderedAt(order.orderedAt)}
                            </p>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <button
                type="button"
                onClick={closeLinkPanel}
                disabled={isLinking}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleLinkMatch()}
                disabled={
                  isLinking ||
                  isLoadingLinkableOrders ||
                  !selectedLinkOrderId ||
                  linkableOrders.some(
                    (order) => order.id === selectedLinkOrderId && order.usedInShipmentMatch,
                  )
                }
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLinking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isLinking ? '연결 중…' : '이 주문에 연결'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ExcloudConfirmDialog
        open={liveTransmitConfirmView != null}
        title="스마트스토어 실제 전송 확인"
        variant="danger"
        cancelLabel="취소"
        confirmLabel={
          isTransmitting ? LIVE_TRANSMIT_IN_PROGRESS_LABEL : LIVE_TRANSMIT_FINAL_CONFIRM_LABEL
        }
        confirmDisabled={!liveTransmitConfirmView?.canConfirmFinal}
        busy={isTransmitting}
        panelClassName="max-w-[560px]"
        onCancel={handleLiveTransmitConfirmCancel}
        onConfirm={handleLiveTransmitFinalConfirm}
        description={
          liveTransmitConfirmView ? (
            <>
              <p>
                쇼핑몰: {liveTransmitConfirmView.mallLabel} · 계정:{' '}
                {liveTransmitConfirmView.accountLabel}
              </p>
              <p>전송 대상 주문 수: {liveTransmitConfirmView.orderCount}건</p>
              <ul className="max-h-48 space-y-2 overflow-y-auto rounded border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-xs text-zinc-700">
                {liveTransmitConfirmView.orders.map((order) => (
                  <li key={order.matchId} className="border-b border-zinc-200 pb-2 last:border-0 last:pb-0">
                    <div>주문번호: {order.maskedMallOrderNo}</div>
                    <div>택배사: {order.carrierLabel}</div>
                    <div>송장번호: {order.maskedTrackingNumber}</div>
                    <div>{order.remainQuantity.label}</div>
                    <div>{order.duplicatePrecheck.label}</div>
                  </li>
                ))}
              </ul>
              {liveTransmitConfirmView.blockReasons.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4 text-xs text-red-700">
                  {liveTransmitConfirmView.blockReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
              {liveTransmitConfirmView.warnings.map((warning) => (
                <p key={warning} className="text-xs font-medium text-red-800">
                  {warning}
                </p>
              ))}
              <p className="text-xs text-zinc-600">{liveTransmitConfirmView.serverRecheckNotice}</p>
              <p className="text-xs text-zinc-500">{liveTransmitConfirmView.snapshotRemainHint}</p>
            </>
          ) : null
        }
      />
    </div>
  );
}
