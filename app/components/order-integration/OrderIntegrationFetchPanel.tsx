'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type { OrderIntegrationMallId } from '@/app/lib/order-integration/malls';
import {
  getOrderFetchRangeError,
  isDateRangeSupportedMall,
  kstTodayDateString,
  MAX_FETCH_RANGE_DAYS,
} from '@/app/lib/order-integration/order-fetch-range';
import type { StandardOrderRow } from '@/app/pipeline/order/order-pipeline';
import { writeHubPendingFetchTransfer } from '@/app/lib/order-integration/hub-pending-fetch-transfer';
import { useUserStore } from '@/app/store/userStore';
import {
  buildOrderFetchViewsFromStandardRows,
  type OrderFetchView,
} from '@/app/lib/order-integration/order-fetch-view';
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
  ok: boolean;
  message: string;
  rows: StandardOrderRow[];
  views: OrderFetchView[];
};

/** 최근 기간(빠른 조회) 프리셋. days는 몰 fetch API가 실제로 받는 값. */
const DAY_PRESETS = [
  { days: 1, label: '오늘' },
  { days: 3, label: '최근 3일' },
  { days: 7, label: '최근 7일' },
  { days: 14, label: '최근 14일' },
  { days: 30, label: '최근 30일' },
] as const;

type DisplayRow = OrderFetchView & { mallId: OrderIntegrationMallId; mallName: string };

function rowKey(mallId: string, rowIndex: number): string {
  return `${mallId}:${rowIndex}`;
}

function mallChipClass(selected: boolean): string {
  if (selected) return 'border-blue-600 bg-blue-600 text-white';
  return 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50';
}

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
 * 검색 조건(작업 대상·변경일 기준 기간·검색어) → 요약 → 실무형 표(행 상세) → 선택 흐름.
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
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
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
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());

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

  const resetFilters = () => {
    setSelectedMallIds(new Set(connectedMalls.map((m) => m.mallId)));
    setDays(7);
    setRangeMode(false);
    setStartDate('');
    setEndDate('');
    setWorkTarget('SHIPMENT_TARGET');
    setSearchTerm('');
    setShowAdvanced(false);
    setAdvPaymentMeans('');
    setAdvPhoneLast4('');
    setAdvTracking('ALL');
    setNotice(null);
    setResults(null);
    setExpandedKeys(new Set());
    setSelectedRowKeys(new Set());
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
      setRangeMode(false);
    }
  }, [selectedSupportsRange, rangeMode]);

  const todayDateString = useMemo(() => kstTodayDateString(), []);
  const rangeError = rangeMode ? getOrderFetchRangeError({ from: startDate, to: endDate }) : null;

  const onSearch = async () => {
    if (selectedMalls.length === 0) {
      setNotice('조회할 쇼핑몰을 선택해 주세요.');
      setResults(null);
      return;
    }

    const useRange = rangeMode && selectedSupportsRange;
    if (useRange) {
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
    setExpandedKeys(new Set());
    setSelectedRowKeys(new Set());

    const nextResults: MallFetchResult[] = [];

    for (const mall of selectedMalls) {
      try {
        const requestBody =
          useRange && isDateRangeSupportedMall(mall.mallId)
            ? { from: startDate, to: endDate }
            : { days };
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
          ok: true,
          message: data.message || `${rows.length}건`,
          rows,
          views,
        });
      } catch (error) {
        nextResults.push({
          mallId: mall.mallId,
          name: mall.name,
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

  /** 조회된 모든 주문 뷰(몰 정보 포함) — 요약 계산용. */
  const allDisplayRows = useMemo<DisplayRow[]>(() => {
    if (!results) return [];
    return results.flatMap((mall) =>
      mall.views.map((view) => ({ ...view, mallId: mall.mallId, mallName: mall.name })),
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

  const summary = useMemo(() => {
    const okMalls = results ? results.filter((r) => r.ok).length : 0;
    let shipment = 0;
    let delivering = 0;
    let claim = 0;
    for (const row of allDisplayRows) {
      if (isShipmentTarget(row)) shipment += 1;
      if (row.status === 'DELIVERING') delivering += 1;
      if (isClaimStatus(row.status)) claim += 1;
    }
    return { okMalls, total: allDisplayRows.length, shipment, delivering, claim };
  }, [results, allDisplayRows]);

  const filteredKeys = useMemo(
    () => filteredRows.map((row) => rowKey(row.mallId, row.rowIndex)),
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

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const collectRows = useCallback(
    (predicate: (row: DisplayRow) => boolean) => {
      if (!results) return { rows: [] as StandardOrderRow[], summaries: [] as Array<{ mallId: string; name: string; count: number }> };
      const rows: StandardOrderRow[] = [];
      const summaries: Array<{ mallId: string; name: string; count: number }> = [];
      for (const mall of results) {
        if (!mall.ok) continue;
        const picked = mall.views
          .filter((view) => predicate({ ...view, mallId: mall.mallId, mallName: mall.name }))
          .map((view) => mall.rows[view.rowIndex])
          .filter((row): row is StandardOrderRow => Boolean(row));
        if (picked.length > 0) {
          rows.push(...picked);
          summaries.push({ mallId: mall.mallId, name: mall.name, count: picked.length });
        }
      }
      return { rows, summaries };
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
    const { rows, summaries } = collectRows(predicate);
    if (rows.length === 0) {
      setNotice(emptyMessage);
      return;
    }
    setSendingToHub(true);
    const result = writeHubPendingFetchTransfer({
      accountScope,
      rows,
      mallSummaries: summaries,
    });
    if (!result.ok) {
      setNotice(
        result.reason === 'too_large'
          ? '한 번에 담을 주문이 너무 많습니다.\n주문을 나누어 선택한 뒤 다시 시도해 주세요.'
          : emptyMessage,
      );
      setSendingToHub(false);
      return;
    }
    router.push('/order/integration');
  };

  const sendSelectedToHub = () =>
    sendToHub(
      (row) => selectedRowKeys.has(rowKey(row.mallId, row.rowIndex)),
      '먼저 담을 주문을 선택해 주세요.',
    );

  const sendFilteredToHub = () =>
    sendToHub((row) => matchesAllFilters(row), '담을 조회 결과가 없습니다.');

  const labelCellClass =
    'w-[7.5rem] shrink-0 border-r border-zinc-200 bg-zinc-100 px-3 py-3 text-sm font-medium text-zinc-700 sm:w-28';
  const valueCellClass = 'min-w-0 flex-1 px-3 py-3';
  const selectedCount = selectedRowKeys.size;

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
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={toggleAllMalls}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition ${mallChipClass(allSelected)}`}
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
                        className={`inline-flex h-9 min-w-[6.5rem] items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition ${mallChipClass(selected)}`}
                      >
                        {selected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                        <span className="truncate">{mall.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex border-b border-zinc-200">
              <div className={labelCellClass}>작업 대상</div>
              <div className={`${valueCellClass} flex flex-wrap gap-2`}>
                {ORDER_WORK_TARGET_ORDER.map((target) => (
                  <button
                    key={target}
                    type="button"
                    onClick={() => setWorkTarget(target)}
                    className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-medium transition ${mallChipClass(workTarget === target)}`}
                  >
                    {ORDER_WORK_TARGET_LABEL[target]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex border-b border-zinc-200">
              <div className={labelCellClass}>조회 기간</div>
              <div className={`${valueCellClass} space-y-2`}>
                <div className="flex flex-wrap items-center gap-2">
                  {DAY_PRESETS.map((preset) => (
                    <button
                      key={preset.days}
                      type="button"
                      onClick={() => {
                        setRangeMode(false);
                        setDays(preset.days);
                      }}
                      className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-medium transition ${mallChipClass(!rangeMode && days === preset.days)}`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setRangeMode(true)}
                    disabled={!selectedSupportsRange}
                    title={!selectedSupportsRange ? '이 쇼핑몰은 현재 최근 기간 조회만 지원합니다.' : undefined}
                    className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${mallChipClass(rangeMode)}`}
                  >
                    기간 직접 선택
                  </button>
                </div>

                {rangeMode ? (
                  <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 text-sm text-zinc-600">
                        시작일
                        <input
                          type="date"
                          value={startDate}
                          max={endDate || todayDateString}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="h-9 rounded-lg border border-zinc-300 px-2 text-sm"
                        />
                      </label>
                      <span className="text-zinc-400">~</span>
                      <label className="inline-flex items-center gap-1.5 text-sm text-zinc-600">
                        종료일
                        <input
                          type="date"
                          value={endDate}
                          min={startDate || undefined}
                          max={todayDateString}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="h-9 rounded-lg border border-zinc-300 px-2 text-sm"
                        />
                      </label>
                    </div>
                    <p className="text-xs text-zinc-500">
                      과거 주문을 다시 조회하려면 시작일과 종료일을 선택하세요. 한 번에 최대 {MAX_FETCH_RANGE_DAYS}일까지
                      조회할 수 있습니다.
                    </p>
                    {rangeError ? <p className="text-xs font-medium text-red-600">{rangeError}</p> : null}
                  </div>
                ) : null}

                <p className="text-xs text-zinc-500">
                  쇼핑몰에 따라 주문일이 아닌 최종 변경일을 기준으로 조회될 수 있습니다.
                  {!selectedSupportsRange ? (
                    <span className="mt-0.5 block text-amber-700">
                      이 쇼핑몰은 현재 최근 기간 조회만 지원합니다.
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
                  className="h-9 w-full rounded-lg border border-zinc-300 px-3 text-sm"
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
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={advPaymentMeans}
                      onChange={(e) => setAdvPaymentMeans(e.target.value)}
                      placeholder="결제수단"
                      className="h-9 w-32 rounded-lg border border-zinc-300 px-3 text-sm"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={advPhoneLast4}
                      onChange={(e) => setAdvPhoneLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="전화 뒤 4자리"
                      className="h-9 w-32 rounded-lg border border-zinc-300 px-3 text-sm"
                    />
                    <select
                      value={advTracking}
                      onChange={(e) => setAdvTracking(e.target.value as 'ALL' | 'REGISTERED' | 'NONE')}
                      className="h-9 rounded-lg border border-zinc-300 px-2 text-sm"
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

          <div className="flex items-center justify-center gap-2 border border-t-0 border-zinc-300 bg-sky-50/80 px-3 py-3">
            <button
              type="button"
              disabled={fetching}
              onClick={() => void onSearch()}
              className="inline-flex h-10 min-w-[7rem] items-center justify-center gap-1.5 rounded bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              검색
            </button>
            <button
              type="button"
              disabled={fetching}
              onClick={resetFilters}
              className="inline-flex h-10 min-w-[7rem] items-center justify-center rounded bg-zinc-600 px-5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
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

      {results ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <SummaryCard label="조회 연결몰" value={`${summary.okMalls}개`} />
            <SummaryCard label="전체 주문" value={`${summary.total.toLocaleString()}건`} />
            <SummaryCard label="송장 처리 대상" value={`${summary.shipment.toLocaleString()}건`} tone="emerald" />
            <SummaryCard label="배송 중" value={`${summary.delivering.toLocaleString()}건`} tone="amber" />
            <SummaryCard label="취소·반품·교환" value={`${summary.claim.toLocaleString()}건`} tone="red" />
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
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-2 text-sm">
                <span className="font-semibold text-zinc-800">
                  조회 결과 {filteredRows.length.toLocaleString()}건
                  {selectedCount > 0 ? (
                    <span className="ml-2 font-normal text-blue-700">· 선택 {selectedCount}건</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={toggleSelectAllFiltered}
                  className="text-xs font-medium text-blue-700 hover:underline"
                >
                  {allFilteredSelected ? '전체 선택 해제' : '이 결과 전체 선택'}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[64rem] table-auto text-left text-sm">
                  <thead className="bg-zinc-50 text-xs text-zinc-500">
                    <tr>
                      <th className="w-10 px-2 py-2" />
                      <th className="w-8 px-2 py-2" />
                      <th className="px-2 py-2 font-medium">쇼핑몰</th>
                      <th className="px-2 py-2 font-medium">주문상태</th>
                      <th className="px-2 py-2 font-medium">결제일시</th>
                      <th className="px-2 py-2 font-medium">주문번호</th>
                      <th className="px-2 py-2 font-medium">상품명/옵션</th>
                      <th className="px-2 py-2 text-center font-medium">수량</th>
                      <th className="px-2 py-2 font-medium">수취인</th>
                      <th className="px-2 py-2 text-right font-medium">결제금액</th>
                      <th className="px-2 py-2 font-medium">배송/송장</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredRows.map((row) => {
                      const key = rowKey(row.mallId, row.rowIndex);
                      const expanded = expandedKeys.has(key);
                      const checked = selectedRowKeys.has(key);
                      return (
                        <FetchRow
                          key={key}
                          row={row}
                          rowId={key}
                          expanded={expanded}
                          checked={checked}
                          onToggleCheck={() => toggleRowSelection(key)}
                          onToggleExpand={() => toggleExpand(key)}
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
                <Link
                  href="/order/integration"
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  송장 매칭으로 이동
                </Link>
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
  rowId,
  expanded,
  checked,
  onToggleCheck,
  onToggleExpand,
}: {
  row: DisplayRow;
  rowId: string;
  expanded: boolean;
  checked: boolean;
  onToggleCheck: () => void;
  onToggleExpand: () => void;
}) {
  return (
    <>
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
        <td className="px-2 py-2 align-top">
          <button
            type="button"
            onClick={onToggleExpand}
            className="text-zinc-400 hover:text-zinc-700"
            aria-expanded={expanded}
            aria-controls={`${rowId}-detail`}
            aria-label="행 상세 열기"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
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
        </td>
        <td className="px-2 py-2 align-top text-zinc-600">{formatDateTime(row.paidAt)}</td>
        <td className="px-2 py-2 align-top text-zinc-700">
          <div className="font-medium">{row.productOrderNo || row.orderNo || '-'}</div>
          {row.orderNo && row.orderNo !== row.productOrderNo ? (
            <div className="text-[11px] text-zinc-400">주문 {row.orderNo}</div>
          ) : null}
        </td>
        <td className="px-2 py-2 align-top text-zinc-700">
          <div className="max-w-[18rem] truncate" title={row.productName}>
            {row.productName || '-'}
          </div>
          {row.productOption ? (
            <div className="max-w-[18rem] truncate text-[11px] text-zinc-400" title={row.productOption}>
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
        <td className="px-2 py-2 align-top text-zinc-700">{row.receiverName || '-'}</td>
        <td className="px-2 py-2 text-right align-top text-zinc-700">{formatAmount(row.paymentAmount)}</td>
        <td className="px-2 py-2 align-top text-zinc-600">
          {row.hasTracking ? '송장 등록' : '미등록'}
          {row.claimLabel ? <span className="ml-1 text-red-600">· {row.claimLabel}</span> : null}
        </td>
      </tr>
      {expanded ? (
        <tr id={`${rowId}-detail`} className="bg-zinc-50/60">
          <td />
          <td />
          <td colSpan={9} className="px-2 py-3">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs text-zinc-600 sm:grid-cols-2 lg:grid-cols-3">
              <DetailItem label="주문자" value={row.detail.ordererName} />
              <DetailItem label="수취인 연락처" value={row.detail.receiverPhone} />
              <DetailItem label="배송지" value={row.detail.receiverAddress} />
              <DetailItem label="배송 메모" value={row.detail.deliveryMemo} />
              <DetailItem label="결제수단" value={row.paymentMeans} />
              <DetailItem label="판매자 상품코드" value={row.detail.sellerProductCode} />
              <DetailItem label="클레임 상태" value={row.claimLabel} />
            </dl>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 font-medium text-zinc-500">{label}</dt>
      <dd className="min-w-0 break-words text-zinc-800">{value || '-'}</dd>
    </div>
  );
}
