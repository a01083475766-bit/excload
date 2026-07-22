'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import type { OrderIntegrationMallId } from '@/app/lib/order-integration/malls';
import type { PublicConnectionHealthView } from '@/app/lib/order-integration/connection-health/public-health-view';
import {
  DEFAULT_HEALTH_CHECK_CONCURRENCY,
  MANUAL_RECHECK_MIN_INTERVAL_MS,
  orderAccountIdsForCheck,
  runWithConcurrency,
} from '@/app/lib/order-integration/connection-health/health-check-client';
import {
  getOrderFetchRangeError,
  isDateRangeSupportedMall,
  kstTodayDateString,
  MAX_FETCH_RANGE_DAYS,
  presetRangeDates,
} from '@/app/lib/order-integration/order-fetch-range';
import { buildOrderFetchRequestBody } from '@/app/lib/order-integration/order-fetch-request';
import { buildOrderFetchDemoResults } from '@/app/lib/order-integration/order-fetch-demo-fixture';
import {
  parseAuthorizationPeriodInput,
  resolveAuthorizationPeriodNotice,
  type AuthorizationPeriodLevel,
} from '@/app/lib/order-integration/authorization-period';
import type { StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import { writeHubPendingFetchTransfer } from '@/app/lib/order-integration/hub-pending-fetch-transfer';
import { useUserStore } from '@/app/store/userStore';
import {
  buildOrderFetchViewsFromStandardRows,
  type OrderFetchView,
} from '@/app/lib/order-integration/order-fetch-view';
import { mergeCoupangRefetchedOrdersIntoFetchResult } from '@/app/lib/coupang/coupang-acknowledgement';
import {
  applyUnconfirmedAddressChangeGuards,
  mergeSmartstoreRefetchedOrdersIntoFetchResult,
} from '@/app/lib/smartstore/smartstore-confirm';
import {
  collectSelectedSmartstoreConfirmProductOrderIds,
  isSmartstorePlaceOrderNotYetRow,
} from '@/app/lib/smartstore/smartstore-fetch-panel-logic';
import {
  EXCLOAD_ORDER_STATUS_LABEL,
  isClaimStatus,
  isShipmentTarget,
  matchesWorkTarget,
  ORDER_WORK_TARGET_LABEL,
  ORDER_WORK_TARGET_ORDER,
  type OrderWorkTarget,
} from '@/app/lib/order-integration/order-status';

type ConnectedMall = {
  mallId: OrderIntegrationMallId;
  name: string;
  accountId: string;
  accountName: string;
  status: string;
};

type MallFetchResult = {
  mallId: OrderIntegrationMallId;
  name: string;
  accountId: string;
  ok: boolean;
  message: string;
  rows: StandardOrderRow[];
  views: OrderFetchView[];
};

/** 최근 기간(빠른 조회) 프리셋. 스마트스토어는 이 값으로 계산한 표시 날짜를 그대로 전송한다. */
const DAY_PRESETS = [
  { days: 1, label: '오늘' },
  { days: 3, label: '최근 3일' },
  { days: 7, label: '최근 7일' },
  { days: 14, label: '최근 14일' },
  { days: 30, label: '최근 30일' },
] as const;

type DisplayRow = OrderFetchView & {
  mallId: OrderIntegrationMallId;
  mallName: string;
  accountId: string;
};

import {
  collectSelectedAcknowledgementBoxIds,
  isCoupangAcceptRow,
  isRowHubEligible,
} from '@/app/lib/coupang/coupang-fetch-panel-logic';

function rowKey(mallId: string, accountId: string, rowIndex: number): string {
  return `${mallId}:${accountId}:${rowIndex}`;
}

/** 필터형 버튼 공통 스타일 — 작고 일정한 높이, 선택 시에만 파란색 강조. */
const FILTER_BTN_BASE =
  'inline-flex h-8 items-center justify-center rounded-md border px-2.5 text-[13px] font-medium transition';

function mallChipClass(selected: boolean): string {
  return `${FILTER_BTN_BASE} ${
    selected
      ? 'border-blue-600 bg-blue-600 text-white'
      : 'border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50'
  }`;
}

/** 공통 입력창(검색어·날짜) 스타일 — 필터와 높이·테두리 통일. */
const FIELD_INPUT_BASE = 'h-8 rounded-md border border-zinc-300 px-2.5 text-sm';

function statusPillClass(view: OrderFetchView): string {
  if (isClaimStatus(view.status)) return 'bg-red-50 text-red-700 ring-red-200';
  if (isShipmentTarget(view)) return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (view.status === 'DELIVERING') return 'bg-amber-50 text-amber-700 ring-amber-200';
  if (view.status === 'DELIVERED' || view.status === 'PURCHASE_DECIDED')
    return 'bg-zinc-100 text-zinc-600 ring-zinc-200';
  return 'bg-blue-50 text-blue-700 ring-blue-200';
}

function formatDateTime(value: string): string {
  if (!value) return '-';
  const trimmed = value.replace('T', ' ');
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}`;
  return value;
}

function formatAmount(value: string): string {
  if (!value) return '-';
  const num = Number(value.replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(num) || num === 0) return value;
  return `${num.toLocaleString()}원`;
}

function extractStandardRows(data: unknown): StandardOrderRow[] {
  if (!data || typeof data !== 'object') return [];
  const file = (data as { orderStandardFile?: { rows?: unknown } }).orderStandardFile;
  if (!file || !Array.isArray(file.rows)) return [];
  return file.rows.filter(
    (row): row is StandardOrderRow =>
      Boolean(row) && typeof row === 'object' && !Array.isArray(row),
  ) as StandardOrderRow[];
}

function extractOrderViews(data: unknown, rows: StandardOrderRow[]): OrderFetchView[] {
  const raw = (data as { orderViews?: unknown })?.orderViews;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw as OrderFetchView[];
  }
  // 몰이 뷰를 주지 않으면 표준행에서 폴백 생성
  return buildOrderFetchViewsFromStandardRows(rows as Array<Record<string, unknown>>);
}

/**
 * 주문조회 — 연동된 몰만 표시.
 * 검색 조건(작업 대상·변경일 기준 기간·검색어) → 조건에 맞는 요약·표 → 선택 흐름.
 */
export default function OrderIntegrationFetchPanel() {
  const router = useRouter();
  const accountScope = useUserStore((state) => state.user?.userId ?? null);
  const [loadingMalls, setLoadingMalls] = useState(true);
  const [connectedMalls, setConnectedMalls] = useState<ConnectedMall[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedMallIds, setSelectedMallIds] = useState<Set<OrderIntegrationMallId>>(new Set());
  const [days, setDays] = useState(7);
  const [rangeMode, setRangeMode] = useState(false);
  const [startDate, setStartDate] = useState(() => presetRangeDates(7).start);
  const [endDate, setEndDate] = useState(() => presetRangeDates(7).end);
  const [workTarget, setWorkTarget] = useState<OrderWorkTarget>('SHIPMENT_TARGET');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advPaymentMeans, setAdvPaymentMeans] = useState('');
  const [advPhoneLast4, setAdvPhoneLast4] = useState('');
  const [advTracking, setAdvTracking] = useState<'ALL' | 'REGISTERED' | 'NONE'>('ALL');

  const [fetching, setFetching] = useState(false);
  const [sendingToHub, setSendingToHub] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [results, setResults] = useState<MallFetchResult[] | null>(null);
  /** 예시 미리보기(더미) — 허브 이관·실조회와 구분 */
  const [demoPreview, setDemoPreview] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());
  const [acknowledging, setAcknowledging] = useState(false);
  const [acknowledgeNotice, setAcknowledgeNotice] = useState<string | null>(null);
  const [acknowledgeItemMessages, setAcknowledgeItemMessages] = useState<
    Record<string, string>
  >({});
  const [confirmingPlaceOrders, setConfirmingPlaceOrders] = useState(false);
  const [confirmNotice, setConfirmNotice] = useState<string | null>(null);
  const [confirmItemMessages, setConfirmItemMessages] = useState<Record<string, string>>({});

  const selectedMallIdsRef = useRef(selectedMallIds);
  useEffect(() => {
    selectedMallIdsRef.current = selectedMallIds;
  }, [selectedMallIds]);
  const { healthByAccount, recheck } = useMallHealth(connectedMalls, selectedMallIdsRef);

  const allSelected =
    connectedMalls.length > 0 && selectedMallIds.size === connectedMalls.length;

  const loadConnected = useCallback(async () => {
    setLoadingMalls(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/order/integration/connected-malls', { cache: 'no-store' });
      const data = (await res.json()) as {
        success?: boolean;
        malls?: ConnectedMall[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || '연동 쇼핑몰 목록을 불러오지 못했습니다.');
      }
      const malls = data.malls ?? [];
      setConnectedMalls(malls);
      setSelectedMallIds(new Set(malls.map((m) => m.mallId)));
    } catch (error) {
      setConnectedMalls([]);
      setSelectedMallIds(new Set());
      setLoadError(error instanceof Error ? error.message : '목록 로드 실패');
    } finally {
      setLoadingMalls(false);
    }
  }, []);

  useEffect(() => {
    void loadConnected();
  }, [loadConnected]);

  const toggleAllMalls = () => {
    if (allSelected) {
      setSelectedMallIds(new Set());
      return;
    }
    setSelectedMallIds(new Set(connectedMalls.map((m) => m.mallId)));
  };

  const toggleMall = (mallId: OrderIntegrationMallId) => {
    setSelectedMallIds((prev) => {
      const next = new Set(prev);
      if (next.has(mallId)) next.delete(mallId);
      else next.add(mallId);
      return next;
    });
  };

  const applyPreset = (presetDays: number) => {
    const { start, end } = presetRangeDates(presetDays);
    setDays(presetDays);
    setRangeMode(false);
    setStartDate(start);
    setEndDate(end);
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    setRangeMode(true);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    setRangeMode(true);
  };

  const resetFilters = () => {
    setSelectedMallIds(new Set(connectedMalls.map((m) => m.mallId)));
    applyPreset(7);
    setWorkTarget('SHIPMENT_TARGET');
    setSearchTerm('');
    setShowAdvanced(false);
    setAdvPaymentMeans('');
    setAdvPhoneLast4('');
    setAdvTracking('ALL');
    setNotice(null);
    setResults(null);
    setDemoPreview(false);
    setSelectedRowKeys(new Set());
    setAcknowledgeNotice(null);
    setAcknowledgeItemMessages({});
  };

  const selectedMalls = useMemo(
    () => connectedMalls.filter((m) => selectedMallIds.has(m.mallId)),
    [connectedMalls, selectedMallIds],
  );

  /**
   * 선택된 모든 몰이 날짜 범위 조회를 지원할 때만 「기간 직접 선택」을 허용한다.
   * 지원 여부가 불명확한 몰이 섞이면 기존 최근 N일 방식만 사용한다(임의 근사 금지).
   */
  const selectedSupportsRange =
    selectedMalls.length > 0 && selectedMalls.every((m) => isDateRangeSupportedMall(m.mallId));

  useEffect(() => {
    if (!selectedSupportsRange && rangeMode) {
      const { start, end } = presetRangeDates(days);
      setStartDate(start);
      setEndDate(end);
      setRangeMode(false);
    }
  }, [selectedSupportsRange, rangeMode, days]);

  const todayDateString = useMemo(() => kstTodayDateString(), []);
  const rangeError = rangeMode ? getOrderFetchRangeError({ from: startDate, to: endDate }) : null;

  const onSearch = async () => {
    if (selectedMalls.length === 0) {
      setNotice('조회할 쇼핑몰을 선택해 주세요.');
      setResults(null);
      return;
    }

    const useRange = rangeMode && selectedSupportsRange;
    const sendsExactRange = selectedMalls.some((mall) => mall.mallId === 'smartstore');
    if (useRange || sendsExactRange) {
      const validationError = getOrderFetchRangeError({ from: startDate, to: endDate });
      if (validationError) {
        setNotice(validationError);
        setResults(null);
        return;
      }
    }

    setFetching(true);
    setNotice(null);
    setResults(null);
    setDemoPreview(false);
    setSelectedRowKeys(new Set());
    setAcknowledgeNotice(null);
    setAcknowledgeItemMessages({});

    const nextResults: MallFetchResult[] = [];

    for (const mall of selectedMalls) {
      try {
        const requestBody = buildOrderFetchRequestBody({
          mallId: mall.mallId,
          days,
          from: startDate,
          to: endDate,
        });
        const res = await fetch(`/api/order/integration/${mall.mallId}/fetch-orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          cache: 'no-store',
        });
        const data = (await res.json()) as {
          success?: boolean;
          count?: number;
          message?: string;
          error?: string;
        };
        if (!res.ok || data.success === false) {
          nextResults.push({
            mallId: mall.mallId,
            name: mall.name,
            accountId: mall.accountId,
            ok: false,
            message: data.error || data.message || '조회에 실패했습니다.',
            rows: [],
            views: [],
          });
          continue;
        }

        const rows = extractStandardRows(data);
        const views = extractOrderViews(data, rows);
        nextResults.push({
          mallId: mall.mallId,
          name: mall.name,
          accountId: mall.accountId,
          ok: true,
          message: data.message || `${rows.length}건`,
          rows,
          views,
        });
      } catch (error) {
        nextResults.push({
          mallId: mall.mallId,
          name: mall.name,
          accountId: mall.accountId,
          ok: false,
          message: error instanceof Error ? error.message : '조회 중 오류',
          rows: [],
          views: [],
        });
      }
    }

    setResults(nextResults);
    setFetching(false);
  };

  /** 실제 API 없이 결과 표 UI만 확인 (스마트스토어 2 + 쿠팡 2). */
  const onDemoPreview = () => {
    setFetching(false);
    setSelectedRowKeys(new Set());
    setDemoPreview(true);
    setResults(buildOrderFetchDemoResults());
    setNotice(
      '예시 미리보기입니다. 실제 주문이 아닙니다. 「미리보기에 담기」로 주문연동 화면에 어떻게 합쳐지는지 확인할 수 있습니다.',
    );
  };

  /** 조회된 모든 주문 뷰(몰 정보 포함) — 요약 계산용. */
  const allDisplayRows = useMemo<DisplayRow[]>(() => {
    if (!results) return [];
    return results.flatMap((mall) =>
      mall.views.map((view) => ({
        ...view,
        mallId: mall.mallId,
        mallName: mall.name,
        accountId: mall.accountId,
      })),
    );
  }, [results]);

  /** 작업 대상 + 검색어 + 상세조건 단일 필터. */
  const matchesAllFilters = useCallback(
    (row: DisplayRow) => {
      const term = searchTerm.trim().toLowerCase();
      const means = advPaymentMeans.trim().toLowerCase();
      const last4 = advPhoneLast4.replace(/\D/g, '').slice(-4);
      if (!matchesWorkTarget(workTarget, row)) return false;
      if (term) {
        const haystack = [
          row.orderNo,
          row.productOrderNo,
          row.productName,
          row.detail.sellerProductCode,
          row.detail.ordererName,
          row.receiverName,
        ]
          .join('\u0001')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (means && !row.paymentMeans.toLowerCase().includes(means)) return false;
      if (last4) {
        const phone = row.detail.receiverPhone.replace(/\D/g, '');
        if (!phone.endsWith(last4)) return false;
      }
      if (advTracking === 'REGISTERED' && !row.hasTracking) return false;
      if (advTracking === 'NONE' && row.hasTracking) return false;
      return true;
    },
    [workTarget, searchTerm, advPaymentMeans, advPhoneLast4, advTracking],
  );

  /** 작업 대상 + 검색어 + 상세조건 필터가 적용된 표시 행. */
  const filteredRows = useMemo<DisplayRow[]>(
    () => allDisplayRows.filter((row) => matchesAllFilters(row)),
    [allDisplayRows, matchesAllFilters],
  );

  /** 요약은 검색 조건(작업 대상·검색어·상세조건)이 반영된 filteredRows 기준. */
  const summary = useMemo(() => {
    const okMalls = results ? results.filter((r) => r.ok).length : 0;
    let shipment = 0;
    let delivering = 0;
    let claim = 0;
    for (const row of filteredRows) {
      if (isShipmentTarget(row)) shipment += 1;
      if (row.status === 'DELIVERING') delivering += 1;
      if (isClaimStatus(row.status)) claim += 1;
    }
    return {
      okMalls,
      total: filteredRows.length,
      shipment,
      delivering,
      claim,
      workTargetLabel: ORDER_WORK_TARGET_LABEL[workTarget],
    };
  }, [results, filteredRows, workTarget]);

  const filteredKeys = useMemo(
    () => filteredRows.map((row) => rowKey(row.mallId, row.accountId, row.rowIndex)),
    [filteredRows],
  );
  const allFilteredSelected =
    filteredKeys.length > 0 && filteredKeys.every((key) => selectedRowKeys.has(key));

  const toggleRowSelection = (key: string) => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const key of filteredKeys) next.delete(key);
      } else {
        for (const key of filteredKeys) next.add(key);
      }
      return next;
    });
  };

  const collectRows = useCallback(
    (predicate: (row: DisplayRow) => boolean) => {
      if (!results)
        return {
          rows: [] as StandardOrderRow[],
          summaries: [] as Array<{ mallId: string; name: string; count: number; accountId: string }>,
          sourceEntries: [] as Array<{ mallId: string; accountId: string }>,
        };
      const rows: StandardOrderRow[] = [];
      const sourceEntries: Array<{ mallId: string; accountId: string }> = [];
      const summaries: Array<{ mallId: string; name: string; count: number; accountId: string }> =
        [];
      for (const mall of results) {
        if (!mall.ok) continue;
        const pickedViews = mall.views.filter((view) =>
          predicate({
            ...view,
            mallId: mall.mallId,
            mallName: mall.name,
            accountId: mall.accountId,
          }),
        );
        const picked = pickedViews
          .map((view) => mall.rows[view.rowIndex])
          .filter((row): row is StandardOrderRow => Boolean(row));
        if (picked.length > 0) {
          rows.push(...picked);
          for (let i = 0; i < picked.length; i += 1) {
            sourceEntries.push({
              mallId: mall.mallId,
              accountId: mall.accountId,
            });
          }
          summaries.push({
            mallId: mall.mallId,
            name: mall.name,
            count: picked.length,
            accountId: mall.accountId,
          });
        }
      }
      return { rows, summaries, sourceEntries };
    },
    [results],
  );

  const sendToHub = (
    predicate: (row: DisplayRow) => boolean,
    emptyMessage: string,
  ) => {
    if (sendingToHub) return;
    if (!accountScope) {
      setNotice('로그인 정보를 확인할 수 없습니다. 새로고침 후 다시 시도해 주세요.');
      return;
    }
    const wrappedPredicate = (row: DisplayRow) => predicate(row) && isRowHubEligible(row);
    const matched = collectRows(predicate);
    const { rows, summaries, sourceEntries } = collectRows(wrappedPredicate);
    if (rows.length === 0) {
      setNotice(
        matched.rows.length > 0
          ? '담기 가능한 주문이 없습니다. 쿠팡은 상품준비중 처리·재조회가 완료된 주문만 담을 수 있습니다.'
          : emptyMessage,
      );
      return;
    }
    setSendingToHub(true);
    const result = writeHubPendingFetchTransfer({
      accountScope,
      rows,
      mallSummaries: summaries,
      sourceEntries,
    });
    if (!result.ok) {
      setNotice(
        result.reason === 'too_large'
          ? '한 번에 담을 주문이 너무 많습니다.\n주문을 나누어 선택한 뒤 다시 시도해 주세요.'
          : result.reason === 'source_mismatch'
            ? '주문 출처 정보가 맞지 않아 미리보기에 담지 못했습니다.\n다시 조회한 뒤 시도해 주세요.'
            : emptyMessage,
      );
      setSendingToHub(false);
      return;
    }
    router.push('/order/integration');
  };

  const sendSelectedToHub = () =>
    sendToHub(
      (row) => selectedRowKeys.has(rowKey(row.mallId, row.accountId, row.rowIndex)),
      '먼저 담을 주문을 선택해 주세요.',
    );

  const sendFilteredToHub = () =>
    sendToHub((row) => matchesAllFilters(row), '담을 조회 결과가 없습니다.');

  const labelCellClass =
    'w-[7.5rem] shrink-0 border-r border-zinc-200 bg-zinc-100 px-3 py-3 text-sm font-medium text-zinc-700 sm:w-28';
  const valueCellClass = 'min-w-0 flex-1 px-3 py-3';
  const selectedCount = selectedRowKeys.size;

  const selectedAcknowledgementBoxIds = useMemo(
    () => collectSelectedAcknowledgementBoxIds(filteredRows, selectedRowKeys, rowKey),
    [filteredRows, selectedRowKeys],
  );

  const hasCoupangAcceptRows = useMemo(
    () => allDisplayRows.some((row) => isCoupangAcceptRow(row)),
    [allDisplayRows],
  );

  const selectedSmartstoreConfirmProductOrderIds = useMemo(
    () => collectSelectedSmartstoreConfirmProductOrderIds(filteredRows, selectedRowKeys, rowKey),
    [filteredRows, selectedRowKeys],
  );

  const hasSmartstorePlaceOrderNotYetRows = useMemo(
    () => allDisplayRows.some((row) => isSmartstorePlaceOrderNotYetRow(row)),
    [allDisplayRows],
  );

  const runAcknowledgement = async () => {
    if (acknowledging || confirmingPlaceOrders) return;
    if (selectedAcknowledgementBoxIds.length === 0) {
      setAcknowledgeNotice('상품준비중 처리할 결제완료(발주 미확인) 주문을 선택해 주세요.');
      return;
    }
    const confirmed = window.confirm(
      `선택한 ${selectedAcknowledgementBoxIds.length}개 묶음배송을 상품준비중 처리합니다.\n계속하시겠습니까?`,
    );
    if (!confirmed) return;

    setAcknowledging(true);
    setAcknowledgeNotice(null);
    setAcknowledgeItemMessages({});

    try {
      const res = await fetch('/api/order/integration/coupang/acknowledge-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipmentBoxIds: selectedAcknowledgementBoxIds }),
        cache: 'no-store',
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        summary?: {
          requested: number;
          succeeded: number;
          failed: number;
          uncertain: number;
        };
        results?: Array<{
          shipmentBoxId: string;
          status: string;
          message: string;
        }>;
        patches?: Array<{
          shipmentBoxId: string;
          standardRows: StandardOrderRow[];
          views: OrderFetchView[];
        }>;
      };

      if (!res.ok || !data.success) {
        setAcknowledgeNotice(data.error || '상품준비중 처리에 실패했습니다.');
        return;
      }

      const itemMessages: Record<string, string> = {};
      for (const row of data.results ?? []) {
        itemMessages[row.shipmentBoxId] = row.message;
      }
      setAcknowledgeItemMessages(itemMessages);

      const summaryText = data.summary
        ? `성공 ${data.summary.succeeded}건 · 실패 ${data.summary.failed}건 · 확인 필요 ${data.summary.uncertain}건`
        : '처리가 완료되었습니다.';
      setAcknowledgeNotice(summaryText);

      if (data.patches?.length && results) {
        const patchByBox = new Map(data.patches.map((patch) => [patch.shipmentBoxId, patch]));
        setResults(
          results.map((mall) => {
            if (mall.mallId !== 'coupang' || !mall.ok) return mall;
            let rows = mall.rows;
            let views = mall.views;
            for (const patch of data.patches ?? []) {
              const merged = mergeCoupangRefetchedOrdersIntoFetchResult({
                rows,
                views,
                patches: [patch],
              });
              rows = merged.rows;
              views = merged.views;
            }
            void patchByBox;
            return { ...mall, rows, views };
          }),
        );
        setSelectedRowKeys(new Set());
      }
    } catch {
      setAcknowledgeNotice('상품준비중 처리 중 오류가 발생했습니다.');
    } finally {
      setAcknowledging(false);
    }
  };

  const runSmartstoreConfirm = async () => {
    if (confirmingPlaceOrders || acknowledging) return;
    if (selectedSmartstoreConfirmProductOrderIds.length === 0) {
      setConfirmNotice('발주확인할 스마트스토어 발주 미확인 주문을 선택해 주세요.');
      return;
    }
    const confirmed = window.confirm(
      `선택한 ${selectedSmartstoreConfirmProductOrderIds.length}건을 발주확인합니다.\n\n발주확인 후에는 구매자가 배송지를 변경할 수 없습니다.\n계속하시겠습니까?`,
    );
    if (!confirmed) return;

    setConfirmingPlaceOrders(true);
    setConfirmNotice(null);
    setConfirmItemMessages({});

    try {
      const res = await fetch('/api/order/integration/smartstore/confirm-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productOrderIds: selectedSmartstoreConfirmProductOrderIds }),
        cache: 'no-store',
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        summary?: {
          requested: number;
          confirmed: number;
          alreadyConfirmed: number;
          addressChanged: number;
          failed: number;
          uncertain: number;
        };
        results?: Array<{
          productOrderId: string;
          status: string;
          message: string;
          isReceiverAddressChanged?: boolean;
        }>;
        patches?: Array<{
          productOrderId: string;
          standardRows: StandardOrderRow[];
          views: OrderFetchView[];
        }>;
        addressChangedWarning?: string | null;
      };

      if (!res.ok || !data.success) {
        setConfirmNotice(data.error || '발주확인 처리에 실패했습니다.');
        return;
      }

      const itemMessages: Record<string, string> = {};
      for (const row of data.results ?? []) {
        itemMessages[row.productOrderId] = row.message;
      }
      setConfirmItemMessages(itemMessages);

      const summaryParts: string[] = [];
      if (data.summary) {
        summaryParts.push(`완료 ${data.summary.confirmed}건`);
        summaryParts.push(`이미 확인 ${data.summary.alreadyConfirmed}건`);
        summaryParts.push(`배송지 변경 ${data.summary.addressChanged}건`);
        summaryParts.push(`실패 ${data.summary.failed}건`);
        summaryParts.push(`확인 필요 ${data.summary.uncertain}건`);
      }
      const summaryText = summaryParts.length > 0 ? summaryParts.join(' · ') : '처리가 완료되었습니다.';
      const addressWarning = data.addressChangedWarning?.trim();
      setConfirmNotice(
        addressWarning ? `${summaryText}\n${addressWarning}` : summaryText,
      );

      const staleAddressProductOrderIds = (data.results ?? [])
        .filter((row) => row.isReceiverAddressChanged === true && row.status === 'UNCERTAIN')
        .map((row) => row.productOrderId);

      if (results && (data.patches?.length || staleAddressProductOrderIds.length > 0)) {
        setResults(
          results.map((mall) => {
            if (mall.mallId !== 'smartstore' || !mall.ok) return mall;
            let rows = mall.rows;
            let views = mall.views;
            for (const patch of data.patches ?? []) {
              const merged = mergeSmartstoreRefetchedOrdersIntoFetchResult({
                rows,
                views,
                patches: [patch],
              });
              rows = merged.rows;
              views = merged.views;
            }
            if (staleAddressProductOrderIds.length > 0) {
              const guarded = applyUnconfirmedAddressChangeGuards({
                rows,
                views,
                productOrderIds: staleAddressProductOrderIds,
              });
              rows = guarded.rows;
              views = guarded.views;
            }
            return { ...mall, rows, views };
          }),
        );
      }
      // 처리 직후 선택 해제 — 구주소·불확실 주문을 그대로 담기/다운로드하지 않도록 한다.
      setSelectedRowKeys(new Set());
    } catch {
      setConfirmNotice('발주확인 처리 중 오류가 발생했습니다.');
    } finally {
      setConfirmingPlaceOrders(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-3 pb-12 pt-1.5 sm:px-5 lg:px-8">
      <Link
        href="/order/integration"
        className="mb-3 inline-block text-sm text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline"
      >
        주문연동으로 돌아가기
      </Link>

      <header className="mb-6 border-b border-gray-200 pb-5">
        <h1 className="text-xl font-semibold text-gray-900">주문조회</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          연동이 완료된 쇼핑몰의 주문을 조회해 송장 작업으로 이어갈 수 있습니다.
          <br />
          조회는 <span className="font-medium">변경일(최종 변경 일시) 기준</span>이며, 조회 후
          「미리보기에 담기」로 택배 업로드 양식에 합칠 수 있습니다.
        </p>
      </header>

      {loadingMalls ? (
        <p className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          연동 쇼핑몰 불러오는 중…
        </p>
      ) : null}

      {loadError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {loadError}{' '}
          <button type="button" className="underline" onClick={() => void loadConnected()}>
            다시 시도
          </button>
        </div>
      ) : null}

      {!loadingMalls && connectedMalls.length === 0 && !loadError ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
          <p>아직 연동된 쇼핑몰이 없습니다.</p>
          <p className="mt-1">먼저 쇼핑몰 연동 설정에서 API 정보를 등록해 주세요.</p>
          <Link
            href="/order/integration/connect"
            className="mt-3 inline-block font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800"
          >
            쇼핑몰 연동 설정으로 이동
          </Link>
        </div>
      ) : null}

      {!loadingMalls && connectedMalls.length > 0 ? (
        <>
          <div className="overflow-hidden border border-zinc-300 bg-white">
            <div className="flex border-b border-zinc-200">
              <div className={labelCellClass}>제휴몰</div>
              <div className={valueCellClass}>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={toggleAllMalls}
                    className={`${mallChipClass(allSelected)} gap-1`}
                  >
                    {allSelected ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                    전체
                  </button>
                  {connectedMalls.map((mall) => {
                    const selected = selectedMallIds.has(mall.mallId);
                    return (
                      <button
                        key={mall.mallId}
                        type="button"
                        title={mall.accountName}
                        onClick={() => toggleMall(mall.mallId)}
                        className={`${mallChipClass(selected)} min-w-[5rem] gap-1`}
                      >
                        {selected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                        <span className="truncate">{mall.name}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 space-y-1 border-t border-zinc-100 pt-2">
                  {connectedMalls.map((mall) => (
                    <MallHealthRow
                      key={mall.accountId}
                      mall={mall}
                      entry={healthByAccount[mall.accountId]}
                      onRecheck={recheck}
                    />
                  ))}
                </div>
                {connectedMalls.some((mall) => selectedMallIds.has(mall.mallId)) ? (
                  <div className="mt-1 space-y-1">
                    {connectedMalls
                      .filter((mall) => selectedMallIds.has(mall.mallId))
                      .map((mall) => (
                        <MallHealthNotice
                          key={mall.accountId}
                          mall={mall}
                          entry={healthByAccount[mall.accountId]}
                          onRecheck={recheck}
                        />
                      ))}
                  </div>
                ) : null}
                {connectedMalls
                  .filter((mall) => mall.mallId === 'smartstore')
                  .map((mall) => (
                    <SmartstoreAuthorizationNotice
                      key={`authp-${mall.accountId}`}
                      mall={mall}
                      entry={healthByAccount[mall.accountId]}
                      selected={selectedMallIds.has(mall.mallId)}
                    />
                  ))}
              </div>
            </div>

            <div className="flex border-b border-zinc-200">
              <div className={labelCellClass}>작업 대상</div>
              <div className={`${valueCellClass} flex flex-wrap gap-1.5`}>
                {ORDER_WORK_TARGET_ORDER.map((target) => (
                  <button
                    key={target}
                    type="button"
                    onClick={() => setWorkTarget(target)}
                    className={mallChipClass(workTarget === target)}
                  >
                    {ORDER_WORK_TARGET_LABEL[target]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex border-b border-zinc-200">
              <div className={labelCellClass}>조회 기간</div>
              <div className={`${valueCellClass} space-y-2`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  {DAY_PRESETS.map((preset) => (
                    <button
                      key={preset.days}
                      type="button"
                      onClick={() => applyPreset(preset.days)}
                      className={mallChipClass(!rangeMode && days === preset.days)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-zinc-600">
                  <label className="inline-flex items-center gap-1.5">
                    시작일
                    <input
                      type="date"
                      value={startDate}
                      max={endDate || todayDateString}
                      disabled={!selectedSupportsRange}
                      onChange={(e) => handleStartDateChange(e.target.value)}
                      className={`${FIELD_INPUT_BASE} disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500`}
                    />
                  </label>
                  <span className="text-zinc-400">~</span>
                  <label className="inline-flex items-center gap-1.5">
                    종료일
                    <input
                      type="date"
                      value={endDate}
                      min={startDate || undefined}
                      max={todayDateString}
                      disabled={!selectedSupportsRange}
                      onChange={(e) => handleEndDateChange(e.target.value)}
                      className={`${FIELD_INPUT_BASE} disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500`}
                    />
                  </label>
                </div>

                {rangeError ? <p className="text-xs font-medium text-red-600">{rangeError}</p> : null}

                <p className="text-xs text-zinc-500">
                  {selectedSupportsRange
                    ? `시작일·종료일을 직접 바꾸면 그 기간의 주문을 조회합니다. 한 번에 최대 ${MAX_FETCH_RANGE_DAYS}일까지 선택할 수 있습니다. `
                    : ''}
                  쇼핑몰에 따라 주문한 날짜가 아니라 주문이 마지막으로 바뀐 날짜를 기준으로 조회될 수 있습니다.
                  {!selectedSupportsRange ? (
                    <span className="mt-0.5 block text-amber-700">
                      선택하신 쇼핑몰은 아직 날짜를 직접 지정하는 조회를 지원하지 않습니다. 위의 최근 기간 버튼(오늘·최근
                      7일 등)으로만 조회되며, 위 날짜는 실제 조회되는 기간을 보여주는 표시입니다.
                    </span>
                  ) : null}
                </p>
              </div>
            </div>

            <div className="flex border-b border-zinc-200">
              <div className={labelCellClass}>검색어</div>
              <div className={`${valueCellClass}`}>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="주문번호 · 상품주문번호 · 상품명 · 상품코드 · 주문자명 · 수취인명"
                  className={`${FIELD_INPUT_BASE} w-full`}
                />
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-700"
                >
                  {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  상세 조건
                </button>
                {showAdvanced ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <input
                      type="text"
                      value={advPaymentMeans}
                      onChange={(e) => setAdvPaymentMeans(e.target.value)}
                      placeholder="결제수단"
                      className={`${FIELD_INPUT_BASE} w-32`}
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={advPhoneLast4}
                      onChange={(e) => setAdvPhoneLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="전화 뒤 4자리"
                      className={`${FIELD_INPUT_BASE} w-32`}
                    />
                    <select
                      value={advTracking}
                      onChange={(e) => setAdvTracking(e.target.value as 'ALL' | 'REGISTERED' | 'NONE')}
                      className={FIELD_INPUT_BASE}
                    >
                      <option value="ALL">송장 전체</option>
                      <option value="REGISTERED">송장 등록됨</option>
                      <option value="NONE">송장 미등록</option>
                    </select>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border border-t-0 border-zinc-300 bg-zinc-50 px-3 py-2.5">
            <button
              type="button"
              disabled={fetching}
              onClick={() => void onSearch()}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              검색
            </button>
            <button
              type="button"
              disabled={fetching}
              onClick={onDemoPreview}
              className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
              title="스마트스토어 2건·쿠팡 2건 예시로 결과 표 UI만 확인"
            >
              예시 미리보기
            </button>
            <button
              type="button"
              disabled={fetching}
              onClick={resetFilters}
              className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              검색초기화
            </button>
          </div>
        </>
      ) : null}

      {notice ? (
        <p
          className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      {demoPreview && results ? (
        <p
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          role="status"
        >
          예시 미리보기 — 스마트스토어 2건 · 쿠팡 2건 (가상 데이터). 실제 판매 주문이 아닙니다.
          「미리보기에 담기」로 주문연동 합쳐짐도 확인할 수 있습니다.
        </p>
      ) : null}

      {results ? (
        <>
          <div
            className={`mt-4 grid gap-2 ${
              workTarget === 'ALL' ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-2'
            }`}
          >
            <SummaryCard label="조회 연결몰" value={`${summary.okMalls}개`} />
            {workTarget === 'ALL' ? (
              <>
                <SummaryCard label="전체 주문" value={`${summary.total.toLocaleString()}건`} />
                <SummaryCard label="송장 처리 대상" value={`${summary.shipment.toLocaleString()}건`} tone="emerald" />
                <SummaryCard label="배송 중" value={`${summary.delivering.toLocaleString()}건`} tone="amber" />
                <SummaryCard label="취소·반품·교환" value={`${summary.claim.toLocaleString()}건`} tone="red" />
              </>
            ) : (
              <SummaryCard
                label={summary.workTargetLabel}
                value={`${summary.total.toLocaleString()}건`}
                tone={
                  workTarget === 'SHIPMENT_TARGET'
                    ? 'emerald'
                    : workTarget === 'DELIVERING'
                      ? 'amber'
                      : workTarget === 'CLAIM'
                        ? 'red'
                        : 'default'
                }
              />
            )}
          </div>

          {results.some((r) => !r.ok) ? (
            <ul className="mt-3 space-y-1">
              {results
                .filter((r) => !r.ok)
                .map((r) => (
                  <li
                    key={r.mallId}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                  >
                    <span className="font-medium">{r.name}</span> — {r.message}
                  </li>
                ))}
            </ul>
          ) : null}

          {filteredRows.length === 0 ? (
            <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm leading-relaxed text-zinc-600">
              <p className="font-medium text-zinc-800">
                선택한 기간과 조건에 해당하는 주문이 없습니다.
              </p>
              <p className="mt-1">조회기간을 늘리거나 작업 대상을 「전체 주문」으로 다시 조회해 보세요.</p>
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white">
              <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-2 text-sm">
                <span className="font-semibold text-zinc-800">
                  조회 결과 {filteredRows.length.toLocaleString()}건
                  {selectedCount > 0 ? (
                    <span className="ml-2 font-normal text-blue-700">· 선택 {selectedCount}건</span>
                  ) : null}
                </span>
                {hasCoupangAcceptRows ? (
                  <button
                    type="button"
                    disabled={acknowledging || confirmingPlaceOrders || selectedAcknowledgementBoxIds.length === 0}
                    onClick={() => void runAcknowledgement()}
                    className="ml-auto inline-flex h-8 items-center justify-center gap-1 rounded-md border border-amber-600 bg-white px-3 text-xs font-semibold text-amber-800 transition hover:bg-amber-50 disabled:opacity-50"
                  >
                    {acknowledging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    선택 건 상품준비중 처리
                    {selectedAcknowledgementBoxIds.length > 0
                      ? ` (${selectedAcknowledgementBoxIds.length})`
                      : ''}
                  </button>
                ) : null}
                {hasSmartstorePlaceOrderNotYetRows ? (
                  <button
                    type="button"
                    disabled={
                      confirmingPlaceOrders ||
                      acknowledging ||
                      selectedSmartstoreConfirmProductOrderIds.length === 0
                    }
                    onClick={() => void runSmartstoreConfirm()}
                    className={`${hasCoupangAcceptRows ? '' : 'ml-auto '}inline-flex h-8 items-center justify-center gap-1 rounded-md border border-amber-600 bg-white px-3 text-xs font-semibold text-amber-800 transition hover:bg-amber-50 disabled:opacity-50`}
                  >
                    {confirmingPlaceOrders ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    발주확인
                    {selectedSmartstoreConfirmProductOrderIds.length > 0
                      ? ` (${selectedSmartstoreConfirmProductOrderIds.length})`
                      : ''}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={toggleSelectAllFiltered}
                  className={`text-xs font-medium text-blue-700 hover:underline ${
                    hasCoupangAcceptRows || hasSmartstorePlaceOrderNotYetRows ? '' : 'ml-auto'
                  }`}
                >
                  {allFilteredSelected ? '전체 선택 해제' : '이 결과 전체 선택'}
                </button>
              </div>

              {acknowledgeNotice ? (
                <div className="border-b border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {acknowledgeNotice}
                </div>
              ) : null}

              {confirmNotice ? (
                <div className="whitespace-pre-line border-b border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {confirmNotice}
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[96rem] table-fixed text-left text-sm">
                  <thead className="bg-zinc-50 text-xs text-zinc-500">
                    <tr>
                      <th className="w-10 px-2 py-2" />
                      <th className="w-[6.5rem] px-2 py-2 font-medium">쇼핑몰</th>
                      <th className="w-[7.5rem] px-2 py-2 font-medium">주문상태</th>
                      <th className="w-[8.5rem] px-2 py-2 font-medium">결제일시</th>
                      <th className="w-[10rem] px-2 py-2 font-medium">주문번호</th>
                      <th className="w-[14rem] px-2 py-2 font-medium">상품명/옵션</th>
                      <th className="w-14 px-2 py-2 text-center font-medium">수량</th>
                      <th className="w-[6rem] px-2 py-2 font-medium">수취인</th>
                      <th className="w-[8.5rem] px-2 py-2 font-medium">연락처</th>
                      <th className="w-[22rem] px-2 py-2 font-medium">배송지</th>
                      <th className="w-[14rem] px-2 py-2 font-medium">배송요청</th>
                      <th className="w-[6.5rem] px-2 py-2 text-right font-medium">결제금액</th>
                      <th className="w-[6rem] px-2 py-2 font-medium">배송/송장</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredRows.map((row) => {
                      const key = rowKey(row.mallId, row.accountId, row.rowIndex);
                      const checked = selectedRowKeys.has(key);
                      return (
                        <FetchRow
                          key={key}
                          row={row}
                          checked={checked}
                          acknowledgeMessage={
                            row.shipmentBoxId
                              ? acknowledgeItemMessages[row.shipmentBoxId]
                              : undefined
                          }
                          confirmMessage={
                            row.productOrderNo
                              ? confirmItemMessages[row.productOrderNo]
                              : undefined
                          }
                          onToggleCheck={() => toggleRowSelection(key)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 bg-emerald-50/60 px-3 py-3">
                <button
                  type="button"
                  disabled={sendingToHub || selectedCount === 0}
                  onClick={sendSelectedToHub}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {sendingToHub ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  선택 주문 미리보기에 담기
                </button>
                <button
                  type="button"
                  disabled={sendingToHub || filteredRows.length === 0}
                  onClick={sendFilteredToHub}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-emerald-600 bg-white px-4 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                >
                  전체 조회 결과 미리보기에 담기
                </button>
                <p className="basis-full text-xs text-zinc-500">
                  조회만으로는 송장이 전송되지 않습니다. 담은 주문은 미리보기·송장 매칭 흐름에서 확인 후 진행하세요.
                </p>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'emerald' | 'amber' | 'red';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : tone === 'red'
          ? 'text-red-700'
          : 'text-zinc-900';
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-base font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function FetchRow({
  row,
  checked,
  acknowledgeMessage,
  confirmMessage,
  onToggleCheck,
}: {
  row: DisplayRow;
  checked: boolean;
  acknowledgeMessage?: string;
  confirmMessage?: string;
  onToggleCheck: () => void;
}) {
  return (
    <tr className={checked ? 'bg-blue-50/40' : undefined}>
      <td className="px-2 py-2 align-top">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleCheck}
          className="h-4 w-4"
          aria-label="주문 선택"
        />
      </td>
      <td className="px-2 py-2 align-top text-zinc-700">{row.mallName}</td>
      <td className="px-2 py-2 align-top">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusPillClass(row)}`}
        >
          {row.statusLabel || EXCLOAD_ORDER_STATUS_LABEL[row.status]}
        </span>
        {row.placeOrderStatus === 'NOT_YET' ? (
          <span className="mt-1 block text-[11px] text-amber-600">발주 미확인</span>
        ) : null}
        {row.placeOrderStatus === 'OK' ? (
          <span className="mt-1 block text-[11px] text-emerald-700">발주 확인·발송 대기</span>
        ) : null}
        {acknowledgeMessage ? (
          <span className="mt-1 block text-[11px] text-zinc-500">{acknowledgeMessage}</span>
        ) : null}
        {confirmMessage ? (
          <span className="mt-1 block text-[11px] text-zinc-500">{confirmMessage}</span>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-2 py-2 align-top text-zinc-600">
        {formatDateTime(row.paidAt)}
      </td>
      <td className="px-2 py-2 align-top text-zinc-700">
        <div className="font-medium">{row.productOrderNo || row.orderNo || '-'}</div>
        {row.orderNo && row.orderNo !== row.productOrderNo ? (
          <div className="text-[11px] text-zinc-400">주문 {row.orderNo}</div>
        ) : null}
      </td>
      <td className="px-2 py-2 align-top text-zinc-700">
        <div className="line-clamp-2 leading-snug" title={row.productName}>
          {row.productName || '-'}
        </div>
        {row.productOption ? (
          <div className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-zinc-400" title={row.productOption}>
            {row.productOption}
          </div>
        ) : null}
      </td>
      <td className="px-2 py-2 text-center align-top text-zinc-700">
        {row.quantity}
        {row.initialQuantity != null && String(row.initialQuantity) !== row.quantity ? (
          <span className="mt-0.5 block text-[11px] text-amber-600">최초 {row.initialQuantity}</span>
        ) : null}
      </td>
      <td className="px-2 py-2 align-top text-zinc-700">
        <div className="line-clamp-2 leading-snug">{row.receiverName || '-'}</div>
        {row.detail.ordererName && row.detail.ordererName !== row.receiverName ? (
          <div className="mt-0.5 line-clamp-1 text-[11px] text-zinc-400">
            주문자 {row.detail.ordererName}
          </div>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-2 py-2 align-top text-zinc-700">
        {row.detail.receiverPhone || '-'}
      </td>
      <td className="px-2 py-2 align-top text-xs text-zinc-700">
        <div className="line-clamp-2 leading-snug" title={row.detail.receiverAddress || undefined}>
          {row.detail.receiverAddress || '-'}
        </div>
      </td>
      <td className="px-2 py-2 align-top text-xs text-zinc-700">
        <div className="line-clamp-2 leading-snug" title={row.detail.deliveryMemo || undefined}>
          {row.detail.deliveryMemo || '-'}
        </div>
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-right align-top text-zinc-700">
        {formatAmount(row.paymentAmount)}
      </td>
      <td className="px-2 py-2 align-top text-zinc-600">
        {row.hasTracking ? '송장 등록' : '미등록'}
        {row.claimLabel ? <span className="ml-1 text-red-600">· {row.claimLabel}</span> : null}
      </td>
    </tr>
  );
}

type ClientHealthEntry = PublicConnectionHealthView & {
  /** 클라이언트 전용 "확인 중" 상태. */
  checking: boolean;
  /** 사용자가 직접 등록한 인증기간(YYYY-MM-DD, KST). 연결 상태와 독립. */
  authorizationPeriodStart: string | null;
  authorizationPeriodEnd: string | null;
};

const EMPTY_HEALTH_ENTRY: ClientHealthEntry = {
  displayState: 'NOT_CHECKED',
  label: '상태 미확인',
  tone: 'neutral',
  checkedAt: null,
  checkable: false,
  help: null,
  checking: false,
  authorizationPeriodStart: null,
  authorizationPeriodEnd: null,
};

/**
 * 연결 상태 자동 확인 훅.
 * - 화면 최초 렌더를 막지 않도록 useEffect에서 비동기로 실행
 * - 저장된 상태를 먼저 시드 → status !== INACTIVE 계정만, 선택 몰 우선, 최대 3개 동시, 중복 방지
 * - 서버가 최근 10분 결과를 재사용하므로 자동 확인은 force 없이 호출
 */
function useMallHealth(
  connectedMalls: ConnectedMall[],
  selectedMallIdsRef: { current: Set<OrderIntegrationMallId> },
) {
  const [healthByAccount, setHealthByAccount] = useState<Record<string, ClientHealthEntry>>({});
  const inFlight = useRef<Set<string>>(new Set());
  const lastManualAt = useRef<Record<string, number>>({});

  const patchEntry = useCallback((accountId: string, patch: Partial<ClientHealthEntry>) => {
    setHealthByAccount((prev) => {
      const current = prev[accountId] ?? EMPTY_HEALTH_ENTRY;
      return { ...prev, [accountId]: { ...current, ...patch } };
    });
  }, []);

  const checkOne = useCallback(
    async (accountId: string, force: boolean) => {
      if (inFlight.current.has(accountId)) return; // 중복 호출 방지
      inFlight.current.add(accountId);
      patchEntry(accountId, { checking: true });
      try {
        const res = await fetch(
          `/api/order/integration/accounts/${accountId}/health-check${force ? '?force=1' : ''}`,
          { method: 'POST', cache: 'no-store' },
        );
        const data = (await res.json().catch(() => null)) as
          | ({ success?: boolean } & Partial<PublicConnectionHealthView>)
          | null;
        if (res.ok && data?.success) {
          patchEntry(accountId, {
            displayState: data.displayState ?? 'NOT_CHECKED',
            label: data.label ?? '상태 미확인',
            tone: data.tone ?? 'neutral',
            checkedAt: data.checkedAt ?? null,
            checkable: data.checkable ?? false,
            help: data.help ?? null,
            checking: false,
          });
        } else {
          // INACTIVE 스킵/어댑터 준비 중 등: 기존 상태 유지하고 확인 중만 해제
          patchEntry(accountId, { checking: false });
        }
      } catch {
        patchEntry(accountId, { checking: false });
      } finally {
        inFlight.current.delete(accountId);
      }
    },
    [patchEntry],
  );

  useEffect(() => {
    if (connectedMalls.length === 0) return;
    let cancelled = false;
    const autoCheckAccountIds = new Set<string>();
    void (async () => {
      try {
        const res = await fetch('/api/order/integration/connection-health', { cache: 'no-store' });
        const data = (await res.json().catch(() => null)) as {
          accounts?: Array<{
            accountId: string;
            authorizationPeriodStart?: string | null;
            authorizationPeriodEnd?: string | null;
          } & PublicConnectionHealthView>;
        } | null;
        if (!cancelled && res.ok && Array.isArray(data?.accounts)) {
          for (const a of data.accounts) {
            if (a.checkable) {
              autoCheckAccountIds.add(a.accountId);
            }
          }
          setHealthByAccount((prev) => {
            const next = { ...prev };
            for (const a of data.accounts!) {
              next[a.accountId] = {
                displayState: a.displayState,
                label: a.label,
                tone: a.tone,
                checkedAt: a.checkedAt,
                checkable: a.checkable,
                help: a.help,
                authorizationPeriodStart: a.authorizationPeriodStart ?? null,
                authorizationPeriodEnd: a.authorizationPeriodEnd ?? null,
                checking: false,
              };
            }
            return next;
          });
        }
      } catch {
        // 시드 실패는 무시(자동 확인이 이어서 상태를 채운다).
      }
      if (cancelled) return;

      // 자동 확인 대상: 시드에서 VERIFIED 공급자로 확인된 계정만(PROVISIONAL/미등록 제외).
      const checkable = connectedMalls.filter(
        (m) => m.status !== 'INACTIVE' && autoCheckAccountIds.has(m.accountId),
      );
      const selected = selectedMallIdsRef.current;
      const selectedAccountIds = new Set(
        checkable.filter((m) => selected.has(m.mallId)).map((m) => m.accountId),
      );
      const orderedIds = orderAccountIdsForCheck(
        checkable.map((m) => m.accountId),
        selectedAccountIds,
      );
      void runWithConcurrency(orderedIds, DEFAULT_HEALTH_CHECK_CONCURRENCY, (id) => checkOne(id, false));
    })();
    return () => {
      cancelled = true;
    };
    // 몰 목록 로드/변경 시에만 자동 확인. 선택 몰은 ref로 최신값을 참조한다.
  }, [connectedMalls, checkOne]);

  const recheck = useCallback(
    (accountId: string) => {
      if (inFlight.current.has(accountId)) return; // 확인 중 비활성
      const now = Date.now();
      if (now - (lastManualAt.current[accountId] ?? 0) < MANUAL_RECHECK_MIN_INTERVAL_MS) return; // 연타 방지
      lastManualAt.current[accountId] = now;
      void checkOne(accountId, true);
    },
    [checkOne],
  );

  return { healthByAccount, recheck };
}

const HEALTH_TONE_DOT: Record<PublicConnectionHealthView['tone'], string> = {
  success: 'bg-emerald-500',
  neutral: 'bg-zinc-400',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
};
const HEALTH_TONE_TEXT: Record<PublicConnectionHealthView['tone'], string> = {
  success: 'text-emerald-600',
  neutral: 'text-zinc-600',
  warning: 'text-amber-600',
  danger: 'text-red-600',
};

function formatCheckedTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  });
}

/** 몰별 연결 상태 배지 한 줄. 정상은 절제된 초록 점, 문제는 최소한의 색으로 표시. */
function MallHealthRow({
  mall,
  entry,
  onRecheck,
}: {
  mall: ConnectedMall;
  entry?: ClientHealthEntry;
  onRecheck: (accountId: string) => void;
}) {
  const checking = entry?.checking ?? false;
  const isInactive = mall.status === 'INACTIVE' || entry?.displayState === 'NOT_IN_USE';
  const isUnavailable = entry?.displayState === 'CHECK_UNAVAILABLE';

  let label: string;
  let dotClass: string;
  let textClass = 'text-zinc-600';
  let showRecheck = false;

  if (isInactive) {
    label = '미사용';
    dotClass = 'bg-zinc-300';
  } else if (isUnavailable) {
    label = entry?.label ?? '연결 확인 준비 중';
    dotClass = 'bg-zinc-300';
  } else if (checking) {
    label = '확인 중';
    dotClass = 'bg-zinc-400';
  } else {
    const tone = entry?.tone ?? 'neutral';
    label = entry?.label ?? '상태 미확인';
    dotClass = HEALTH_TONE_DOT[tone];
    textClass = HEALTH_TONE_TEXT[tone];
    showRecheck = Boolean(entry?.checkable && entry.displayState !== 'CONNECTED');
  }

  const checkedTime = entry?.checkedAt && !isUnavailable ? formatCheckedTime(entry.checkedAt) : null;
  const detail = !isInactive && !isUnavailable && !checking ? entry?.help : null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-zinc-600">
      <span className="font-medium text-zinc-700">{mall.name}</span>
      <span className="text-zinc-300" aria-hidden>·</span>
      <span
        className="inline-flex items-center gap-1"
        title={detail ? `${detail.title} ${detail.description}` : undefined}
      >
        {checking ? (
          <Loader2 className="h-3 w-3 animate-spin text-zinc-400" aria-hidden />
        ) : (
          <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} aria-hidden />
        )}
        <span className={textClass}>{label}</span>
      </span>
      {checkedTime ? (
        <>
          <span className="text-zinc-300" aria-hidden>·</span>
          <span className="text-zinc-400">마지막 확인 {checkedTime}</span>
        </>
      ) : null}
      {showRecheck ? (
        <button
          type="button"
          onClick={() => onRecheck(mall.accountId)}
          disabled={checking}
          className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} aria-hidden />
          다시 확인
        </button>
      ) : null}
    </div>
  );
}

/**
 * 현재 선택된 문제 몰에 대한 인라인 안내(1~2줄). 정상/미확인이면 아무것도 렌더하지 않는다.
 * 해결 방법을 툴팁에만 숨기지 않고 선택 몰 아래에 짧게 노출한다.
 */
function MallHealthNotice({
  mall,
  entry,
  onRecheck,
}: {
  mall: ConnectedMall;
  entry?: ClientHealthEntry;
  onRecheck: (accountId: string) => void;
}) {
  if (mall.status === 'INACTIVE' || entry?.checking) return null;
  const help = entry?.help ?? null;
  if (!help) return null;

  const accent =
    help.tone === 'error' ? 'border-red-300' : help.tone === 'warn' ? 'border-amber-300' : 'border-zinc-300';
  const titleClass =
    help.tone === 'error' ? 'text-red-700' : help.tone === 'warn' ? 'text-amber-700' : 'text-zinc-700';
  const linkClass =
    'inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-50';

  return (
    <div className={`border-l-2 py-1 pl-2 text-[12px] ${accent}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className={`font-medium ${titleClass}`}>{help.title}</span>
        <span className="text-zinc-600">{help.description}</span>
      </div>
      {help.checks.length > 0 ? (
        <p className="mt-0.5 text-zinc-500">확인: {help.checks.join(' · ')}</p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {help.center ? (
          <a href={help.center.url} target="_blank" rel="noreferrer" className={linkClass}>
            {help.center.label}
          </a>
        ) : null}
        {help.showSettings && help.settingsUrl ? (
          <Link href={help.settingsUrl} className={linkClass}>
            연동 정보 수정
          </Link>
        ) : null}
        {help.showRecheck ? (
          <button type="button" onClick={() => onRecheck(mall.accountId)} className={linkClass}>
            <RefreshCw className="h-3 w-3" aria-hidden />
            다시 확인
          </button>
        ) : null}
      </div>
    </div>
  );
}

const AUTH_PERIOD_ACCENT: Record<AuthorizationPeriodLevel, string> = {
  none: 'border-zinc-300 text-zinc-600',
  info: 'border-zinc-300 text-zinc-600',
  notice: 'border-amber-300 text-amber-700',
  important: 'border-amber-400 text-amber-800',
  check: 'border-red-300 text-red-700',
};

/** 인증기간까지 남은 일수를 사람이 읽기 쉬운 문구로. */
function authPeriodDaysLabel(state: string, daysUntilStart: number | null, daysUntilEnd: number | null): string | null {
  if (state === 'UPCOMING' && daysUntilStart != null) {
    return daysUntilStart <= 0 ? '오늘 시작' : `시작 ${daysUntilStart}일 전`;
  }
  if (state === 'IN_PERIOD' && daysUntilEnd != null) {
    return daysUntilEnd <= 0 ? '오늘 종료' : `종료 ${daysUntilEnd}일 전`;
  }
  if (state === 'ENDED' && daysUntilEnd != null) {
    return `${Math.abs(daysUntilEnd)}일 지남`;
  }
  return null;
}

/**
 * 스마트스토어 인증기간 인라인 안내(작은 한두 줄). 연결 상태 배지와 혼합하지 않는다.
 * - 등록된 기간이 없으면(NONE) 아무것도 표시하지 않는다(불필요한 경고 방지).
 * - 스마트스토어가 선택됐거나 알림이 있을 때만 상세 표시.
 * - 기간이 지났다는 이유만으로 연결 오류로 단정하지 않는다.
 */
function SmartstoreAuthorizationNotice({
  mall,
  entry,
  selected,
}: {
  mall: ConnectedMall;
  entry?: ClientHealthEntry;
  selected: boolean;
}) {
  const start = entry?.authorizationPeriodStart ?? null;
  const end = entry?.authorizationPeriodEnd ?? null;
  if (!start || !end) return null;

  const parsed = parseAuthorizationPeriodInput({ start, end });
  if (!parsed.ok || parsed.value.clear) return null;
  const notice = resolveAuthorizationPeriodNotice({
    periodStart: parsed.value.start,
    periodEnd: parsed.value.end,
  });
  // 등록됐지만 아직 안내 시점이 아니고(선택되지 않았으면) 표시하지 않는다.
  if (notice.state === 'NONE' && !selected) return null;

  const daysLabel = authPeriodDaysLabel(notice.state, notice.daysUntilStart, notice.daysUntilEnd);
  const accent = notice.state === 'NONE' ? AUTH_PERIOD_ACCENT.none : AUTH_PERIOD_ACCENT[notice.level];

  return (
    <div className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-l-2 py-1 pl-2 text-[12px] ${accent}`}>
      <span className="font-medium">{mall.name} 인증기간</span>
      <span className="text-zinc-600">
        {start} ~ {end}
        {daysLabel ? ` · ${daysLabel}` : ''}
      </span>
      {notice.state !== 'NONE' ? <span className="text-zinc-600">{notice.title}</span> : null}
      <Link
        href={`/order/integration/${mall.mallId}`}
        className="inline-flex items-center rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-50"
      >
        기간 수정
      </Link>
    </div>
  );
}
