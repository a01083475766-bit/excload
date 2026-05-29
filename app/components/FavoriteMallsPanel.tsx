"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUserStore } from "@/app/store/userStore";
import {
  createEmptyFavoriteMallEntry,
  loadFavoriteMalls,
  openAllFavoriteMallUrls,
  openFavoriteMallUrl,
  saveFavoriteMalls,
  type FavoriteMallEntry,
} from "@/app/lib/favorite-malls-storage";

export default function FavoriteMallsPanel() {
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

  const handleOpenAll = useCallback(() => {
    const opened = openAllFavoriteMallUrls(entries);
    if (opened === 0) {
      window.alert("열 수 있는 URL이 없습니다. URL 주소를 입력해 주세요.");
    }
  }, [entries]);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-3xl p-6 pb-4">
        <p className="text-sm text-gray-500">불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6 pb-4">
      <h1 className="text-xl font-bold mb-3 text-zinc-900 dark:text-zinc-100">
        즐겨찾는 쇼핑몰
      </h1>

      <p className="text-sm text-gray-600 dark:text-zinc-400 mb-6 leading-relaxed">
        자주 사용하는 쇼핑몰 주소를 저장해두고 클릭 한 번으로 바로 이동해보세요.
        <br />
        주문조회·배송관리·엑셀다운로드 페이지 같은 자주 사용하는 상세 주소도 등록할 수
        있습니다.
        <br />
        <span className="text-zinc-500 dark:text-zinc-500">
          예) https://sell.smartstore.naver.com/o/orders
        </span>
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

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={handleOpenAll}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          새창으로 모두열기
        </button>
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg border border-dashed border-blue-300 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40"
        >
          추가하기
        </button>
      </div>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-950/60">
        <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          URL 등록 방법
        </h2>
        <p className="mb-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          자주 쓰는 주문·배송 관리 페이지 주소를 복사해 위 표에 붙여 넣으면, 다음부터 한 번에
          열 수 있습니다.
        </p>
        <div className="flex flex-col gap-6">
          <figure>
            <p className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              ① 쇼핑몰 관리자 페이지에 로그인합니다.
            </p>
            <img
              src="/favorite-malls/guide-naver-login.png"
              alt="네이버 커머스 ID 로그인 화면 예시"
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700"
            />
          </figure>
          <figure>
            <p className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              ② 자주 쓰는 상세 페이지로 이동한 뒤, 주소창 URL을 복사해 URL 주소란에
              붙여 넣습니다.
            </p>
            <img
              src="/favorite-malls/guide-copy-url.png"
              alt="스마트스토어센터 주소창에서 상세 페이지 URL 복사 예시"
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700"
            />
          </figure>
        </div>
      </section>
    </div>
  );
}
