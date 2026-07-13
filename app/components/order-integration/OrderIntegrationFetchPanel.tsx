'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Loader2 } from 'lucide-react';
import type { OrderIntegrationMallId } from '@/app/lib/order-integration/malls';

type ConnectedMall = {
  mallId: OrderIntegrationMallId;
  name: string;
  accountId: string;
  accountName: string;
  status: string;
};

type FetchMallResult = {
  mallId: OrderIntegrationMallId;
  name: string;
  ok: boolean;
  count: number;
  message: string;
};

/** 몰 fetch API가 실제로 받는 값(days)에 맞춘 기간 선택 */
const DAY_PRESETS = [
  { days: 1, label: '오늘(1일)' },
  { days: 3, label: '3일' },
  { days: 7, label: '7일' },
  { days: 30, label: '30일' },
] as const;

function mallChipClass(selected: boolean): string {
  if (selected) {
    return 'border-blue-600 bg-blue-600 text-white';
  }
  return 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50';
}

/**
 * 주문조회 — 연동된 몰만 표시.
 * 구현된 범위: 몰 선택 + 최근 N일(days) + fetch-orders 호출.
 * (검색어·상태·주문/결제일자 구분 등은 몰 API 미연동이라 UI에 넣지 않음)
 */
export default function OrderIntegrationFetchPanel() {
  const [loadingMalls, setLoadingMalls] = useState(true);
  const [connectedMalls, setConnectedMalls] = useState<ConnectedMall[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedMallIds, setSelectedMallIds] = useState<Set<OrderIntegrationMallId>>(new Set());
  const [days, setDays] = useState(7);

  const [fetching, setFetching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [results, setResults] = useState<FetchMallResult[] | null>(null);

  const allSelected =
    connectedMalls.length > 0 && selectedMallIds.size === connectedMalls.length;

  const loadConnected = useCallback(async () => {
    setLoadingMalls(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/order/integration/connected-malls');
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
    setNotice(null);
    setResults(null);
  };

  const selectedMalls = useMemo(
    () => connectedMalls.filter((m) => selectedMallIds.has(m.mallId)),
    [connectedMalls, selectedMallIds]
  );

  const onSearch = async () => {
    if (selectedMalls.length === 0) {
      setNotice('조회할 쇼핑몰을 선택해 주세요.');
      setResults(null);
      return;
    }

    setFetching(true);
    setNotice(null);
    setResults(null);

    const nextResults: FetchMallResult[] = [];
    for (const mall of selectedMalls) {
      try {
        const res = await fetch(`/api/order/integration/${mall.mallId}/fetch-orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days }),
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
            count: 0,
            message: data.error || data.message || '조회에 실패했습니다.',
          });
          continue;
        }
        nextResults.push({
          mallId: mall.mallId,
          name: mall.name,
          ok: true,
          count: data.count ?? 0,
          message: data.message || `${data.count ?? 0}건`,
        });
      } catch (error) {
        nextResults.push({
          mallId: mall.mallId,
          name: mall.name,
          ok: false,
          count: 0,
          message: error instanceof Error ? error.message : '조회 중 오류',
        });
      }
    }

    setResults(nextResults);
    const okCount = nextResults.filter((r) => r.ok).length;
    const totalOrders = nextResults.reduce((sum, r) => sum + r.count, 0);
    setNotice(
      `최근 ${days}일 · 선택 ${selectedMalls.length}개 몰 중 ${okCount}개 조회 완료 · 총 ${totalOrders.toLocaleString()}건`
    );
    setFetching(false);
  };

  const labelCellClass =
    'w-[7.5rem] shrink-0 border-r border-zinc-200 bg-zinc-100 px-3 py-3 text-sm font-medium text-zinc-700 sm:w-28';
  const valueCellClass = 'min-w-0 flex-1 px-3 py-3';

  return (
    <div className="mx-auto max-w-5xl px-3 pb-12 pt-1.5 sm:px-5 lg:px-8">
      <Link
        href="/order/integration"
        className="mb-3 inline-block text-sm text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline"
      >
        주문연동으로 돌아가기
      </Link>

      <header className="mb-6 border-b border-gray-200 pb-5">
        <h1 className="text-xl font-semibold text-gray-900">주문조회</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          연동이 완료된 쇼핑몰의 주문을 조회할 수 있습니다.
          <br />
          쇼핑몰과 조회 기간을 선택한 뒤 검색해 주세요.
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
          <p className="mt-1">연동이 완료되면 이 화면에서 주문을 조회할 수 있습니다.</p>
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

            <div className="flex">
              <div className={labelCellClass}>조회기간</div>
              <div className={`${valueCellClass} flex flex-wrap gap-2`}>
                {DAY_PRESETS.map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => setDays(preset.days)}
                    className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-medium transition ${mallChipClass(days === preset.days)}`}
                  >
                    {preset.label}
                  </button>
                ))}
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
        <div className="mt-4 overflow-hidden border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-800">
            조회 결과
          </div>
          <ul className="divide-y divide-zinc-100">
            {results.map((row) => (
              <li
                key={row.mallId}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm"
              >
                <span className="font-medium text-zinc-900">{row.name}</span>
                <span className={row.ok ? 'text-zinc-600' : 'text-red-600'}>{row.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
