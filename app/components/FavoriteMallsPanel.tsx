"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUserStore } from "@/app/store/userStore";
import {
  createEmptyFavoriteMallEntry,
  loadFavoriteMalls,
  openFavoriteMallUrl,
  saveFavoriteMalls,
  type FavoriteMallEntry,
} from "@/app/lib/favorite-malls-storage";

type FavoriteMallsPanelProps = {
  backHref?: string;
  backLabel?: string;
};

export default function FavoriteMallsPanel({
  backHref = "/mypage",
  backLabel = "← 마이페이지로 돌아가기",
}: FavoriteMallsPanelProps) {
  const user = useUserStore((state) => state.user);
  const storageUserId = user?.userId ?? null;
  const [entries, setEntries] = useState<FavoriteMallEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const skipSaveRef = useRef(true);

  useEffect(() => {
    setEntries(loadFavoriteMalls(storageUserId));
    setHydrated(true);
    skipSaveRef.current = true;
  }, [storageUserId]);

  useEffect(() => {
    if (!hydrated || skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    saveFavoriteMalls(storageUserId, entries);
  }, [entries, hydrated, storageUserId]);

  const updateEntry = useCallback((id: string, patch: Partial<Pick<FavoriteMallEntry, "name" | "url">>) => {
    setEntries((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }, []);

  const addRow = useCallback(() => {
    setEntries((prev) => [...prev, createEmptyFavoriteMallEntry()]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setEntries((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((row) => row.id !== id);
    });
  }, []);

  const handleOpen = useCallback((url: string) => {
    if (!openFavoriteMallUrl(url)) {
      window.alert("URL 주소를 입력해 주세요.");
    }
  }, []);

  if (!hydrated) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-sm text-gray-500">불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold mb-3 text-zinc-900 dark:text-zinc-100">
        즐겨찾는 쇼핑몰
      </h1>

      <p className="text-sm text-gray-600 dark:text-zinc-400 mb-6 leading-relaxed">
        자주 찾는 쇼핑몰 주소를 등록해 두면, 엑클로드에서 바로 해당 사이트로
        이동해 주문·배송 업무를 이어갈 수 있습니다. 등록한 주소는 이 기기·브라우저에
        저장되며, 로그인하시면 계정별로 따로 보관됩니다.
      </p>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-800 dark:bg-zinc-950">
              <th className="px-3 py-3 font-semibold text-zinc-700 dark:text-zinc-300 w-[28%]">
                쇼핑몰
              </th>
              <th className="px-3 py-3 font-semibold text-zinc-700 dark:text-zinc-300">
                URL 주소
              </th>
              <th className="px-3 py-3 font-semibold text-zinc-700 dark:text-zinc-300 w-[200px]">
                열기
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((row) => (
              <tr
                key={row.id}
                className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
              >
                <td className="px-3 py-2 align-top">
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => updateEntry(row.id, { name: e.target.value })}
                    placeholder="예: 쿠팡"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <input
                    type="url"
                    value={row.url}
                    onChange={(e) => updateEntry(row.id, { url: e.target.value })}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => handleOpen(row.url)}
                      className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap"
                    >
                      새창으로 열기
                    </button>
                    {entries.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="shrink-0 rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        삭제
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addRow}
        className="mt-4 rounded-lg border border-dashed border-blue-300 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40"
      >
        추가하기
      </button>

      {backHref ? (
        <Link
          href={backHref}
          className="mt-8 inline-block text-sm text-gray-500 underline hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          {backLabel}
        </Link>
      ) : null}
    </div>
  );
}
