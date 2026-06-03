'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, MessageSquare } from 'lucide-react';

type MyPost = {
  id: string;
  featureLabel: string;
  resultLabel: string;
  excerpt: string;
  publicConsent?: boolean;
  hasSystemReply?: boolean;
  createdAt: string;
};

export default function FeedbackMinePage() {
  const router = useRouter();
  const { status } = useSession();
  const [posts, setPosts] = useState<MyPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMine = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      const res = await fetch('/api/feedback-event/posts?scope=mine', {
        credentials: 'include',
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || '목록을 불러오지 못했습니다.');
        return;
      }
      setPosts(json.myPosts ?? []);
    } catch {
      setError('목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(
        `/auth/login?callbackUrl=${encodeURIComponent('/feedback-event/mine')}`,
      );
      return;
    }
    if (status === 'authenticated') {
      void loadMine();
    }
  }, [status, router, loadMine]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-zinc-500">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="bg-zinc-50 min-h-screen py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/feedback-event"
          className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-blue-600 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          게시판 목록
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-2 flex items-center gap-2">
          <MessageSquare className="h-7 w-7 text-blue-600" aria-hidden />
          내가 작성한 글
        </h1>
        <p className="text-sm text-zinc-500 mb-6">
          비공개로 작성한 글도 여기에서 확인할 수 있습니다.
        </p>

        {loading ? (
          <p className="text-sm text-zinc-500 py-8 text-center">목록 불러오는 중…</p>
        ) : error ? (
          <p className="text-sm text-red-600 py-8 text-center">{error}</p>
        ) : posts.length === 0 ? (
          <div className="bg-white rounded-xl border border-zinc-200 px-6 py-12 text-center text-sm text-zinc-500">
            아직 작성한 피드백이 없습니다.
            <br />
            <Link href="/feedback-event/write" className="text-blue-600 underline mt-2 inline-block">
              피드백 작성하기
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100 overflow-hidden">
            {posts.map((p) => (
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
        )}
      </div>
    </div>
  );
}
