'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFeedbackEventStatus } from '@/app/components/feedback-event/useFeedbackEventStatus';
import { FeedbackEventIntro } from '@/app/components/feedback-event/FeedbackEventIntro';
import { PenLine, MessageSquare } from 'lucide-react';

const PUBLIC_POSTS_URL = '/api/feedback-event/posts?scope=public';

type BoardPost = {
  id: string;
  authorLabel: string;
  isMine?: boolean;
  featureLabel: string;
  resultLabel: string;
  publicConsent: boolean;
  excerpt: string | null;
  canOpen: boolean;
  canDelete?: boolean;
  createdAt: string;
};

function FeedbackBoardInner() {
  const searchParams = useSearchParams();
  const from = searchParams?.get('from');
  const { status } = useSession();
  const { data, loading: statusLoading, isEventActive } = useFeedbackEventStatus(true);
  const [boardPosts, setBoardPosts] = useState<BoardPost[]>([]);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);
  const [boardLoading, setBoardLoading] = useState(true);

  const loadBoard = useCallback(async () => {
    setBoardLoading(true);
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
        setBoardPosts(json.boardPosts ?? json.publicPosts ?? []);
        setViewerIsAdmin(Boolean(json.viewerIsAdmin));
      }
    } finally {
      setBoardLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

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

  const writeHref =
    status === 'authenticated'
      ? '/feedback-event/write'
      : `/auth/login?callbackUrl=${encodeURIComponent('/feedback-event/write')}`;

  return (
    <div className="bg-zinc-50 min-h-screen py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-1">피드백 이벤트</h1>
            <p className="text-sm text-zinc-500">이용 후기·개선 의견 게시판</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {status === 'authenticated' && (
              <Link
                href="/feedback-event/mine"
                className="inline-flex items-center justify-center gap-2 border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-800 font-semibold px-5 py-2.5 rounded-lg text-sm"
              >
                <MessageSquare className="h-4 w-4" aria-hidden />
                내가 작성한 글
              </Link>
            )}
            <Link
              href={writeHref}
              className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm"
            >
              <PenLine className="h-4 w-4" aria-hidden />
              작성하기
            </Link>
          </div>
        </div>

        {!statusLoading && !isEventActive && (
          <div className="mb-6 rounded-xl border border-zinc-200 bg-white px-4 py-4 text-center text-sm text-zinc-600">
            <p className="mb-2">현재 피드백 이벤트 접수 기간이 아닙니다.</p>
            <Link href="/pricing" className="text-blue-600 underline">
              가격 플랜 보기
            </Link>
          </div>
        )}

        <FeedbackEventIntro data={data} from={from} />

        <section>
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">남겨주신 의견들</h2>
          <p className="text-xs text-zinc-500 mb-3">
            {viewerIsAdmin ?
              '관리자: 비공개 글 내용·첨부도 확인할 수 있습니다.'
            : '공개 글은 내용이 보이고, 비공개 글은 내용 없이 함께 표시됩니다.'}
          </p>

          {boardLoading ? (
            <p className="text-sm text-zinc-500 py-8 text-center">목록 불러오는 중…</p>
          ) : boardPosts.length === 0 ? (
            <div className="bg-white rounded-xl border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-500">
              아직 남겨진 의견이 없습니다.
              <br />
              첫 번째 후기를 남겨 주세요.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-zinc-600 text-left">
                  <tr>
                    <th className="px-4 py-2.5 font-medium w-[88px]">작성일</th>
                    <th className="px-4 py-2.5 font-medium w-[100px]">작성자</th>
                    <th className="px-4 py-2.5 font-medium hidden sm:table-cell w-[120px]">
                      기능
                    </th>
                    <th className="px-4 py-2.5 font-medium">내용</th>
                    {viewerIsAdmin && (
                      <th className="px-4 py-2.5 font-medium w-[72px] text-center">관리</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {boardPosts.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 text-zinc-500 whitespace-nowrap align-top">
                        {formatDate(p.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 whitespace-nowrap align-top">
                        {p.isMine ? '나' : p.authorLabel}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 hidden sm:table-cell align-top">
                        {p.featureLabel}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {p.canOpen && p.excerpt ?
                          <Link
                            href={`/feedback-event/${p.id}`}
                            className="text-zinc-800 hover:text-blue-600 line-clamp-2"
                          >
                            {!p.publicConsent && (
                              <span className="text-xs text-amber-700 mr-1.5">[비공개]</span>
                            )}
                            {p.excerpt}
                          </Link>
                        : p.canOpen ?
                          <Link
                            href={`/feedback-event/${p.id}`}
                            className="text-zinc-400 hover:text-blue-600"
                          >
                            비공개
                          </Link>
                        : <span className="text-zinc-400">비공개</span>}
                        <span className="block sm:hidden text-xs text-zinc-400 mt-0.5">
                          {p.resultLabel}
                          {!p.publicConsent && ' · 비공개'}
                        </span>
                      </td>
                      {viewerIsAdmin && (
                        <td className="px-4 py-3 align-top text-center">
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
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function FeedbackPageShell() {
  return (
    <div className="bg-zinc-50 min-h-screen py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-1">피드백 이벤트</h1>
        <p className="text-sm text-zinc-500">이용 후기·개선 의견 게시판</p>
      </div>
    </div>
  );
}

export default function FeedbackEventPage() {
  return (
    <Suspense fallback={<FeedbackPageShell />}>
      <FeedbackBoardInner />
    </Suspense>
  );
}
