'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { ORDER_INTEGRATION_MALLS } from '@/app/lib/order-integration/malls';

/**
 * 주문조회 골격 — 날짜·몰 선택 UI.
 * 실제 조회 API → 미리보기 적재는 2단계에서 연결합니다.
 */
export default function OrderIntegrationFetchPanel() {
  const availableMalls = ORDER_INTEGRATION_MALLS.filter((mall) => mall.status === 'available');
  const [mallId, setMallId] = useState(availableMalls[0]?.id ?? '');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!mallId || !fromDate || !toDate) {
      setNotice('쇼핑몰과 조회 기간을 모두 선택해 주세요.');
      return;
    }
    if (fromDate > toDate) {
      setNotice('시작일은 종료일보다 늦을 수 없습니다.');
      return;
    }
    setNotice(
      '주문조회 API 결과는 다음 단계에서 주문연동 미리보기로 전달됩니다. (골격 단계)',
    );
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-10 sm:px-6">
      <Link
        href="/order/integration"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" />
        주문연동 허브로
      </Link>

      <div className="mb-6 flex items-center gap-2">
        <CalendarDays className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">주문조회</h1>
      </div>

      <p className="mb-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        API 연동이 완료된 쇼핑몰의 주문을 기간으로 조회합니다. 조회 결과는 주문연동 허브의
        미리보기에 쌓이도록 연결할 예정입니다.
      </p>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            쇼핑몰
          </span>
          <select
            value={mallId}
            onChange={(event) => setMallId(event.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          >
            {availableMalls.map((mall) => (
              <option key={mall.id} value={mall.id}>
                {mall.name}
                {mall.badge === 'live' ? ' (운영)' : mall.badge === 'beta' ? ' (베타)' : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              시작일
            </span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              종료일
            </span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
        </div>

        {notice ? (
          <p
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100"
            role="status"
          >
            {notice}
          </p>
        ) : null}

        <button
          type="submit"
          className="h-10 w-full rounded-lg bg-indigo-600 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          주문 조회 (골격)
        </button>
      </form>
    </div>
  );
}
