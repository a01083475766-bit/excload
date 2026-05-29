'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface FavoriteMallStatRow {
  id: string;
  normalizedUrl: string;
  registerCount: number;
  uniqueUserCount: number;
  updatedAt: string;
}

export default function AkmanFavoriteMallsPage() {
  const [items, setItems] = useState<FavoriteMallStatRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/akman/favorite-mall-stats?limit=100', {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || '집계 목록을 불러오지 못했습니다.');
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(typeof data.total === 'number' ? data.total : 0);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : '집계 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/akman" className="text-sm text-blue-600 hover:underline">
            ← 관리자 대시보드
          </Link>
          <h1 className="mt-2 text-xl font-bold text-zinc-900">자주 등록된 쇼핑몰 URL</h1>
          <p className="mt-1 text-sm text-zinc-600">
            사용자가 즐겨찾는 쇼핑몰에 저장한 주소를 URL별로 집계합니다. (개인정보·계정 연결 없음)
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadStats()}
          disabled={isLoading}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
        >
          {isLoading ? '새로고침 중…' : '새로고침'}
        </button>
      </div>

      <p className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
        <strong className="text-zinc-800">등록 사용자 수</strong>는 서로 다른 계정 수,
        <strong className="ml-2 text-zinc-800">등록 횟수</strong>는 저장·수정 시 집계된 총 횟수입니다.
        URL은 비교를 위해 쿼리·해시를 제외한 형태로 표시됩니다.
      </p>

      {error ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-zinc-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-zinc-700 w-12">#</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-700">URL</th>
              <th className="px-3 py-2 text-right font-medium text-zinc-700 w-28">등록 사용자</th>
              <th className="px-3 py-2 text-right font-medium text-zinc-700 w-24">등록 횟수</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-700 w-36">최근 갱신</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">
                  불러오는 중…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">
                  아직 집계된 URL이 없습니다. 사용자가 즐겨찾기를 저장하면 여기에 쌓입니다.
                </td>
              </tr>
            ) : (
              items.map((row, index) => (
                <tr key={row.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2 text-zinc-500 tabular-nums">{index + 1}</td>
                  <td className="px-3 py-2">
                    <a
                      href={row.normalizedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-blue-600 hover:underline"
                    >
                      {row.normalizedUrl}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-zinc-900 tabular-nums">
                    {row.uniqueUserCount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-700 tabular-nums">
                    {row.registerCount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 whitespace-nowrap">
                    {new Date(row.updatedAt).toLocaleString('ko-KR')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && total > 0 ? (
        <p className="mt-3 text-xs text-zinc-500">
          전체 집계 URL {total.toLocaleString()}건 중 상위 {items.length.toLocaleString()}건 표시
        </p>
      ) : null}
    </div>
  );
}
