'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUserStore } from '@/app/store/userStore';
import { useFeedbackEventStatus } from '@/app/components/feedback-event/useFeedbackEventStatus';
import { FeedbackEventIntro } from '@/app/components/feedback-event/FeedbackEventIntro';
import { PenLine, MessageSquare } from 'lucide-react';

type BoardPost = {
  id: string;
  authorLabel: string;
  isMine?: boolean;
  featureLabel: string;
  resultLabel: string;
  excerpt: string;
  publicConsent?: boolean;
  trialGranted?: boolean;
  hasSystemReply?: boolean;
  createdAt: string;
};

function FeedbackBoardInner() {
  const searchParams = useSearchParams();
  const from = searchParams?.get('from');
  const { status } = useSession();
  const fetchUser = useUserStore((s) => s.fetchUser);
  const { data, loading, isEventActive } = useFeedbackEventStatus(true);
  const [publicPosts, setPublicPosts] = useState<BoardPost[]>([]);
  const [myPosts, setMyPosts] = useState<BoardPost[]>([]);
  const [boardLoading, setBoardLoading] = useState(true);

  useEffect(() => {
    if (status === 'authenticated') void fetchUser();
  }, [status, fetchUser]);

  const loadBoard = useCallback(async () => {
    setBoardLoading(true);
    try {
      const res = await fetch('/api/feedback-event/posts', { credentials: 'include' });
      const json = await res.json();
      if (res.ok && json.success) {
        setPublicPosts(json.publicPosts ?? []);
        setMyPosts(json.myPosts ?? []);
      }
    } finally {
      setBoardLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-zinc-500">
        불러오는 중…
      </div>
    );
  }

  if (!isEventActive) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-zinc-900 mb-4">오픈 피드백 이벤트</h1>
        <p className="text-zinc-600 mb-6">현재 피드백 이벤트 접수 기간이 아닙니다.</p>
        <Link href="/pricing" className="text-blue-600 underline">
          가격 플랜 보기
        </Link>
      </div>
    );
  }

  const writeHref =
    status === 'authenticated'
      ? '/feedback-event/write'
      : `/auth/login?callbackUrl=${encodeURIComponent('/feedback-event/write')}`;

  return (
    <div className="bg-zinc-50 min-h-screen py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-1">오픈 피드백 이벤트</h1>
            <p className="text-sm text-zinc-500">이용 후기·개선 의견 게시판</p>
          </div>
          <Link
            href={writeHref}
            className="inline-flex items-center justify-center gap-2 shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm"
          >
            <PenLine className="h-4 w-4" aria-hidden />
            작성하기
          </Link>
        </div>

        <FeedbackEventIntro data={data} from={from} />

        {status === 'authenticated' && myPosts.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-zinc-900 mb-3 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-600" aria-hidden />
              내가 작성한 글
            </h2>
            <div className="bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100 overflow-hidden">
              {myPosts.map((p) => (
                <Link
                  key={p.id}
                  href={`/feedback-event/${p.id}`}
                  className="block px-4 py-3 hover:bg-zinc-50 transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 mb-1">
                    <span>{formatDate(p.createdAt)}</span>
                    <span>{p.featureLabel}</span>
                    <span className="text-zinc-400">·</span>
                    <span>{p.resultLabel}</span>
                    {p.publicConsent && (
                      <span className="rounded bg-blue-50 text-blue-700 px-1.5 py-0.5">공개</span>
                    )}
                    {p.hasSystemReply && (
                      <span className="rounded bg-amber-50 text-amber-800 px-1.5 py-0.5">
                        운영 안내
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-800 line-clamp-2">{p.excerpt}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">공개 피드백</h2>
          <p className="text-xs text-zinc-500 mb-3">
            작성 시 「공개 게시판에 함께 보여 주세요」에 동의한 글만 표시됩니다.
          </p>

          {boardLoading ? (
            <p className="text-sm text-zinc-500 py-8 text-center">목록 불러오는 중…</p>
          ) : publicPosts.length === 0 ? (
            <div className="bg-white rounded-xl border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-500">
              아직 공개된 피드백이 없습니다.
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {publicPosts.map((p) => (
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
                        <Link
                          href={`/feedback-event/${p.id}`}
                          className="text-zinc-800 hover:text-blue-600 line-clamp-2"
                        >
                          {p.excerpt}
                        </Link>
                        <span className="block sm:hidden text-xs text-zinc-400 mt-0.5">
                          {p.resultLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="mt-8 text-center text-sm text-zinc-500">
          비공개로 작성한 글은 본인만 「내가 작성한 글」에서 확인할 수 있습니다.
        </p>
      </div>
    </div>
  );
}

export default function FeedbackEventPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex items-center justify-center text-zinc-500">
          불러오는 중…
        </div>
      }
    >
      <FeedbackBoardInner />
    </Suspense>
  );
}
