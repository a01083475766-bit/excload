'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Upload } from 'lucide-react';
import { OrderIntegrationProvider } from '@prisma/client';

import {
  MAX_SHIPMENT_UPLOAD_FILE_BYTES,
} from '@/app/lib/order-integration/shipments/match-uploaded-shipment-file';
import {
  buildShipmentMatchPanelViewStateFromConfirmResponse,
  buildShipmentMatchPanelViewStateFromExcludeResponse,
  buildShipmentMatchPanelViewStateFromUpload,
  canShowShipmentMatchConfirmButton,
  canShowShipmentMatchExcludeButton,
  isShipmentMatchPanelRowConfirmed,
  isShipmentMatchPanelRowExcluded,
  type ShipmentMatchPanelViewState,
} from '@/app/lib/order-integration/shipments/adapt-shipment-upload-batch-detail-for-ui';
import {
  fetchShipmentUploadBatchDetail,
  postShipmentUploadMatchConfirm,
  postShipmentUploadMatchExclude,
} from '@/app/lib/order-integration/shipments/shipment-match-panel-confirm-client';
import type { ShipmentUploadPersistSuccessResponse } from '@/app/lib/order-integration/shipments/upload-and-persist-shipment-file';
import {
  SHIPMENT_MATCH_TABS,
  buildShipmentMatchSummaryCards,
  filterShipmentMatchDisplayRows,
  getEmptyOrderSnapshotMessage,
  getShipmentMatchStatusMeta,
  mapShipmentMatchFetchError,
  type ShipmentMatchTabId,
} from '@/app/lib/order-integration/shipments/shipment-match-ui';
import type { ShipmentMatchPanelDisplayRow } from '@/app/lib/order-integration/shipments/adapt-shipment-upload-batch-detail-for-ui';

const ACCEPTED_EXTENSIONS = '.csv,.xlsx,.xls';
const TABLE_HEADERS = [
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
  '확정',
  '제외',
] as const;

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

export default function ShipmentMatchPanel() {
  const { status: sessionStatus } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const inputClass =
    'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100';

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
    return getEmptyOrderSnapshotMessage(viewState.ordersLoadedCount, viewState.summary.totalRows);
  }, [viewState]);

  const assignSelectedFile = useCallback((file: File | null) => {
    setSelectedFile(file);
    setViewState(null);
    setErrorMessage(null);
    setRowActionError(null);
    setActiveTab('all');
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

    setIsSubmitting(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
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
    } catch {
      setErrorMessage('네트워크 오류가 발생했습니다. 연결 상태를 확인한 뒤 다시 시도해주세요.');
      setViewState(null);
    } finally {
      setIsSubmitting(false);
    }
  }, [batchId, integrationAccountId, provider, selectedFile, sessionStatus]);

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

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-10 sm:px-6">
      <Link
        href="/order/integration"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" />
        주문연동으로 돌아가기
      </Link>

      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">송장파일 매칭</h1>

      <section className={`mt-4 rounded-xl border px-4 py-3 text-sm ${statusBannerClass('info')}`}>
        <p>택배사 프로그램에서 받은 송장파일을 업로드하면 기존 주문과 송장번호를 매칭합니다.</p>
        <p className="mt-1 font-medium">아직 쇼핑몰에 송장전송되지 않습니다.</p>
        <p className="mt-1">
          업로드한 매칭 결과는 저장되며, 다음 단계에서 확정·송장전송을 진행합니다.
        </p>
      </section>

      {sessionStatus === 'unauthenticated' ? (
        <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('error')}`}>
          로그인이 필요합니다. 로그인한 뒤 송장파일 매칭을 이용할 수 있습니다.
        </p>
      ) : null}

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">송장파일 업로드</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          지원 형식: csv, xlsx, xls · 최대 {formatFileSize(MAX_SHIPMENT_UPLOAD_FILE_BYTES)}
        </p>

        <div
          className={`mt-4 rounded-xl border-2 border-dashed p-6 transition-colors ${
            isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
              : selectedFile
                ? 'border-blue-300 bg-blue-50/60 dark:border-blue-700 dark:bg-blue-950/20'
                : 'border-zinc-300 bg-zinc-50 hover:border-blue-400 dark:border-zinc-600 dark:bg-zinc-900/60'
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
            className="flex cursor-pointer flex-col items-center gap-2 text-center"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <Upload className="h-8 w-8 text-zinc-400" />
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              파일을 선택하거나 이 영역에 끌어다 놓으세요
            </p>
            {selectedFile ? (
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                선택됨: {selectedFile.name} ({formatFileSize(selectedFile.size)})
              </p>
            ) : (
              <p className="text-xs text-zinc-500">csv, xlsx, xls</p>
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
              쇼핑몰(provider)
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                className={`${inputClass} mt-1`}
              >
                <option value="">전체</option>
                {Object.values(OrderIntegrationProvider).map((value) => (
                  <option key={value} value={value}>
                    {value}
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

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={isSubmitting || sessionStatus !== 'authenticated'}
          className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          송장파일 매칭하기
        </button>
      </section>

      {errorMessage ? (
        <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('error')}`}>
          {errorMessage}
        </p>
      ) : null}

      {rowActionError ? (
        <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${statusBannerClass('error')}`}>
          {rowActionError}
        </p>
      ) : null}

      {viewState ? (
        <section className="mt-6 space-y-4">
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

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() => {
                  if (card.tabId) setActiveTab(card.tabId);
                }}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-3 text-left transition hover:border-blue-400 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-blue-500"
              >
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{card.label}</p>
                <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{card.count}</p>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {SHIPMENT_MATCH_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

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
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta.badgeClass}`}
                          >
                            {statusMeta.label}
                          </span>
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
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
