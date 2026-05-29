"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useSession } from "next-auth/react";
import { useUserStore } from "@/app/store/userStore";
import {
  createEmptyFavoriteMallEntry,
  favoriteMallsHaveContent,
  fetchFavoriteMallsFromServer,
  loadFavoriteMalls,
  openAllFavoriteMallUrls,
  openFavoriteMallUrl,
  saveFavoriteMalls,
  saveFavoriteMallsToServer,
  type FavoriteMallEntry,
} from "@/app/lib/favorite-malls-storage";

export default function FavoriteMallsPanel() {
  const { data: session, status: sessionStatus } = useSession();
  const user = useUserStore((state) => state.user);
  const storageUserId = user?.userId ?? session?.user?.id ?? null;
  const [entries, setEntries] = useState<FavoriteMallEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const skipSaveRef = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const authReady = sessionStatus !== "loading";

  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;

    async function loadEntries() {
      setLoadError(null);

      if (storageUserId) {
        const localEntries = loadFavoriteMalls(storageUserId);
        setEntries(localEntries);
        setHydrated(true);
        skipSaveRef.current = true;

        setIsSyncing(true);
        try {
          const serverEntries = await fetchFavoriteMallsFromServer();
          if (cancelled) return;

          if (serverEntries) {
            const serverHasContent = favoriteMallsHaveContent(serverEntries);
            const localHasContent = favoriteMallsHaveContent(localEntries);

            if (!serverHasContent && localHasContent) {
              const migrated = await saveFavoriteMallsToServer(localEntries);
              if (cancelled) return;
              saveFavoriteMalls(storageUserId, migrated);
              setEntries(migrated);
            } else {
              saveFavoriteMalls(storageUserId, serverEntries);
              setEntries(serverEntries);
            }
          }
        } catch (error) {
          if (cancelled) return;
          console.error("[FavoriteMallsPanel] server load failed:", error);
          setLoadError("서버에서 불러오지 못해 이 기기에 저장된 목록을 표시합니다.");
        } finally {
          if (!cancelled) setIsSyncing(false);
        }
      } else {
        setEntries(loadFavoriteMalls(null));
        setHydrated(true);
        skipSaveRef.current = true;
      }
    }

    void loadEntries();

    return () => {
      cancelled = true;
    };
  }, [authReady, storageUserId]);

  useEffect(() => {
    if (!hydrated || skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }

    saveFavoriteMalls(storageUserId, entries);

    if (storageUserId) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void saveFavoriteMallsToServer(entries)
          .then((saved) => {
            saveFavoriteMalls(storageUserId, saved);
            setLoadError(null);
          })
          .catch((error) => {
            console.error("[FavoriteMallsPanel] server save failed:", error);
            setLoadError(
              "서버 저장에 실패했습니다. 이 기기에는 저장되어 있으며, 연결 후 다시 동기화됩니다.",
            );
          });
      }, 500);
      return () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      };
    }
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

  const moveRowUp = useCallback((id: string) => {
    setEntries((prev) => {
      const index = prev.findIndex((row) => row.id === id);
      if (index <= 0) return prev;
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  const moveRowDown = useCallback((id: string) => {
    setEntries((prev) => {
      const index = prev.findIndex((row) => row.id === id);
      if (index < 0 || index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
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

  if (!authReady || !hydrated) {
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

      {loadError ? (
        <p className="mb-4 text-sm text-amber-700 dark:text-amber-400">{loadError}</p>
      ) : null}

      {storageUserId ? (
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-500">
          이 기기와 로그인 계정에 함께 저장되어, 빠르게 불러오고 다른 기기에서도 동일한 목록을
          사용할 수 있습니다.
          {isSyncing ? " (동기화 중…)" : null}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <table className="w-full min-w-[560px] text-sm table-fixed">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-800 dark:bg-zinc-950">
              <th className="px-3 py-3 font-semibold text-zinc-700 dark:text-zinc-300 w-[24%]">
                쇼핑몰
              </th>
              <th className="px-3 py-3 font-semibold text-zinc-700 dark:text-zinc-300">
                URL 주소
              </th>
              <th className="px-3 py-3 font-semibold text-zinc-700 dark:text-zinc-300 w-[132px]">
                열기
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((row, index) => (
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
                  <div className="flex items-start gap-1.5">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpen(row.url)}
                        className="w-full rounded-lg bg-blue-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 whitespace-nowrap"
                      >
                        바로가기
                      </button>
                      {entries.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-[11px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                          삭제
                        </button>
                      ) : null}
                    </div>
                    {entries.length > 1 ? (
                      <div className="flex shrink-0 flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => moveRowUp(row.id)}
                          disabled={index === 0}
                          title="위로 이동"
                          aria-label="위로 이동"
                          className="rounded border border-zinc-200 px-1 py-0.5 text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:disabled:hover:bg-transparent"
                        >
                          <ChevronUp className="h-3 w-3" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveRowDown(row.id)}
                          disabled={index === entries.length - 1}
                          title="아래로 이동"
                          aria-label="아래로 이동"
                          className="rounded border border-zinc-200 px-1 py-0.5 text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:disabled:hover:bg-transparent"
                        >
                          <ChevronDown className="h-3 w-3" aria-hidden />
                        </button>
                      </div>
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
          모두 바로가기
        </button>
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg border border-dashed border-blue-300 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40"
        >
          추가하기
        </button>
      </div>

      <section className="mt-16 rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-950/60">
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
              ① 자주 쓰는 상세 페이지로 이동한 뒤, 주소창 URL을 복사해 URL 주소란에
              붙여 넣습니다.
            </p>
            <img
              src="/favorite-malls/guide-copy-url.png"
              alt="스마트스토어센터 주소창에서 상세 페이지 URL 복사 예시"
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700"
            />
          </figure>
          <figure>
            <p className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              ② 로그인 합니다.
            </p>
            <img
              src="/favorite-malls/guide-naver-login.png"
              alt="네이버 커머스 ID 로그인 화면 예시"
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700"
            />
          </figure>
        </div>
      </section>
    </div>
  );
}
