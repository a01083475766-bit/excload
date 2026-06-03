'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

type PostDetail = {
  id: string;
  isMine: boolean;
  authorLabel: string;
  featureLabel: string;
  resultLabel: string;
  content: string;
  publicConsent: boolean;
  attachmentName: string | null;
  attachmentUrl: string | null;
  trialGranted: boolean;
  systemReply: string | null;
  createdAt: string;
};

export default function FeedbackPostDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [post, setPost] = useState<PostDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/feedback-event/posts/${id}`, { credentials: 'include' });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || '글을 불러오지 못했습니다.');
          return;
        }
        setPost(json.post);
      } catch {
        if (!cancelled) setError('글을 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-zinc-500">
        불러오는 중…
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-zinc-600 mb-4">{error ?? '글을 찾을 수 없습니다.'}</p>
        <Link href="/feedback-event" className="text-blue-600 underline">
          게시판으로
        </Link>
      </div>
    );
  }

  const dateLabel = new Date(post.createdAt).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="bg-zinc-50 min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/feedback-event"
          className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-blue-600 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          게시판 목록
        </Link>

        <article className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <header className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/80">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 mb-2">
              <span className="font-medium text-zinc-700">{post.authorLabel}</span>
              <span>·</span>
              <span>{dateLabel}</span>
              {post.publicConsent && (
                <span className="rounded bg-blue-100 text-blue-800 px-2 py-0.5">공개</span>
              )}
              {post.isMine && (
                <span className="rounded bg-emerald-100 text-emerald-800 px-2 py-0.5">내 글</span>
              )}
            </div>
            <p className="text-sm text-zinc-600">
              {post.featureLabel} · {post.resultLabel}
            </p>
          </header>

          <div className="px-6 py-5 text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">
            {post.content}
          </div>

          {post.isMine && post.attachmentUrl && post.attachmentName && (
            <div className="px-6 pb-4 text-sm">
              <span className="text-zinc-500">첨부: </span>
              <a
                href={post.attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                {post.attachmentName}
              </a>
            </div>
          )}

          {post.isMine && post.systemReply && (
            <div className="mx-6 mb-6 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900 whitespace-pre-line leading-relaxed">
              <p className="font-semibold text-amber-950 mb-2">운영 안내</p>
              {post.systemReply}
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
