'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BoardPostDto } from '@/app/lib/feedback-event/map-board-post';
import { MessageSquare, PenLine, RotateCw, Search } from 'lucide-react';

const PUBLIC_POSTS_URL = '/api/feedback-event/posts?scope=public';

type Props = {
  initialPosts: BoardPostDto[];
  initialViewerIsAdmin: boolean;
};

export function FeedbackBoardClient({ initialPosts, initialViewerIsAdmin }: Props) {
  const { status } = useSession();

  const [boardPosts, setBoardPosts] = useState<BoardPostDto[]>(initialPosts);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(initialViewerIsAdmin);
  const [boardLoading, setBoardLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'mine'>('all');
  const [featureFilter, setFeatureFilter] = useState('all');

  const loadBoard = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setBoardLoading(true);
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      const res = await fetch(PUBLIC_POSTS_URL, {
        credentials: 'include',
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      const json = await res.json();
      if (res.ok && json.success) {
        const nextPosts = (json.boardPosts ?? json.publicPosts ?? []) as BoardPostDto[];
        const nextAdmin = Boolean(json.viewerIsAdmin);
        setBoardPosts(nextPosts);
        setViewerIsAdmin(nextAdmin);
      }
    } finally {
      setBoardLoading(false);
    }
  }, []);

  useEffect(() => {
    setBoardPosts(initialPosts);
    setViewerIsAdmin(initialViewerIsAdmin);
    setBoardLoading(false);
  }, [initialPosts, initialViewerIsAdmin]);

  const handleDeletePost = useCallback(
    async (postId: string) => {
      if (!confirm('이 피드백을 삭제할까요? 복구할 수 없습니다.')) return;
      try {
        const res = await fetch(`/api/feedback-event/posts/${postId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        const json = await res.json();
        if (!res.ok) {
          alert(json.error || '삭제에 실패했습니다.');
          return;
        }
        await loadBoard();
      } catch {
        alert('삭제 중 오류가 발생했습니다.');
      }
    },
    [loadBoard],
  );

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return boardPosts.filter((post) => {
      if (visibilityFilter === 'public' && !post.publicConsent) return false;
      if (visibilityFilter === 'mine' && !post.isMine) return false;
      if (featureFilter !== 'all' && post.featureLabel !== featureFilter) return false;
      if (!q) return true;
      return [post.title, post.excerpt, post.featureLabel, post.resultLabel, post.authorLabel]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [boardPosts, featureFilter, query, visibilityFilter]);

  const featureOptions = useMemo(
    () => Array.from(new Set(boardPosts.map((post) => post.featureLabel))).sort(),
    [boardPosts],
  );

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-col gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-950">베타 피드백</h1>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              엑클로드를 사용하며 발견한 오류와 필요한 기능을 알려주세요. 베타 사용자의 의견과
              운영자의 확인 내용을 함께 볼 수 있습니다.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {status === 'authenticated' && (
              <Link
                href="/beta-feedback/mine"
                prefetch
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                <MessageSquare className="h-4 w-4" aria-hidden />
                내가 작성한 글
              </Link>
            )}
            <Link
              href="/beta-feedback/write"
              prefetch
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded bg-zinc-900 px-3 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              <PenLine className="h-4 w-4" aria-hidden />
              피드백 작성하기
            </Link>
          </div>
        </div>

        <section className="mt-5 border border-zinc-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-zinc-200 px-3 py-3 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="제목, 내용, 기능 검색"
                className="h-9 w-full rounded border border-zinc-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-zinc-500"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <select
                value={visibilityFilter}
                onChange={(event) =>
                  setVisibilityFilter(event.target.value as 'all' | 'public' | 'mine')
                }
                className="h-9 rounded border border-zinc-300 bg-white px-2 text-sm"
              >
                <option value="all">전체</option>
                <option value="public">공개 글</option>
                <option value="mine">내 글</option>
              </select>
              <select
                value={featureFilter}
                onChange={(event) => setFeatureFilter(event.target.value)}
                className="h-9 rounded border border-zinc-300 bg-white px-2 text-sm"
              >
                <option value="all">전체 기능</option>
                {featureOptions.map((feature) => (
                  <option key={feature} value={feature}>
                    {feature}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void loadBoard()}
                disabled={boardLoading}
                className="inline-flex h-9 items-center gap-1.5 rounded border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                <RotateCw className="h-4 w-4" aria-hidden />
                새로고침
              </button>
            </div>
          </div>

          {boardLoading && boardPosts.length === 0 ? (
            <p className="text-sm text-zinc-500 py-8 text-center">목록 불러오는 중…</p>
          ) : filteredPosts.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-zinc-500">
              아직 남겨진 의견이 없습니다.
              <br />
              첫 번째 후기를 남겨 주세요.
            </div>
          ) : (
            <div>
              <table className="hidden w-full table-fixed text-sm md:table">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-600">
                  <tr>
                    <th className="w-24 px-3 py-2 font-medium">공개</th>
                    <th className="w-32 px-3 py-2 font-medium">관련 기능</th>
                    <th className="px-3 py-2 font-medium">제목</th>
                    <th className="w-28 px-3 py-2 font-medium">작성자</th>
                    <th className="w-24 px-3 py-2 font-medium">답변</th>
                    <th className="w-28 px-3 py-2 font-medium">작성일</th>
                    {viewerIsAdmin && (
                      <th className="w-16 px-3 py-2 text-center font-medium">관리</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredPosts.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-50">
                      <td className="px-3 py-2 align-top">
                        <span className="rounded border border-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600">
                          {p.publicConsent ? '공개' : '비공개'}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-zinc-600">{p.featureLabel}</td>
                      <td className="px-3 py-2 align-top">
                        <Link
                          href={`/beta-feedback/${p.id}`}
                          prefetch
                          className="font-semibold text-zinc-950 hover:text-blue-700"
                        >
                          {p.title}
                        </Link>
                        {p.excerpt ? (
                          <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{p.excerpt}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top text-zinc-600">
                        {p.isMine ? '나' : p.authorLabel}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span className={p.hasSystemReply ? 'text-xs text-emerald-700' : 'text-xs text-zinc-400'}>
                          {p.hasSystemReply ? '답변 있음' : '확인 대기'}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-zinc-500">
                        {formatDate(p.createdAt)}
                      </td>
                      {viewerIsAdmin && (
                        <td className="px-3 py-2 align-top text-center">
                          <button
                            type="button"
                            onClick={() => void handleDeletePost(p.id)}
                            className="text-xs text-red-600 hover:text-red-800 font-medium whitespace-nowrap"
                          >
                            삭제
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="divide-y divide-zinc-100 md:hidden">
                {filteredPosts.map((p) => (
                  <Link
                    key={p.id}
                    href={`/beta-feedback/${p.id}`}
                    prefetch
                    className="block px-3 py-3 hover:bg-zinc-50"
                  >
                    <div className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
                      <span>{p.publicConsent ? '공개' : '비공개'}</span>
                      <span>{p.featureLabel}</span>
                      <span>{formatDate(p.createdAt)}</span>
                      <span className={p.hasSystemReply ? 'text-emerald-700' : 'text-zinc-400'}>
                        {p.hasSystemReply ? '답변 있음' : '확인 대기'}
                      </span>
                    </div>
                    <p className="line-clamp-1 text-sm font-semibold text-zinc-950">{p.title}</p>
                    {p.excerpt ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{p.excerpt}</p>
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
