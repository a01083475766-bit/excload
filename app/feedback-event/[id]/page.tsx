'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';

type PostDetail = {
  id: string;
  isMine: boolean;
  isAdminViewer?: boolean;
  canDelete?: boolean;
  authorLabel: string;
  authorEmail: string | null;
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
  const router = useRouter();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [post, setPost] = useState<PostDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!id || !confirm('이 피드백을 삭제할까요? 복구할 수 없습니다.')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/feedback-event/posts/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || '삭제에 실패했습니다.');
        setDeleting(false);
        return;
      }
      router.replace('/feedback-event');
    } catch {
      alert('삭제 중 오류가 발생했습니다.');
      setDeleting(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (!id) {
      setContentLoading(false);
      setError('잘못된 주소입니다.');
      return;
    }
    setPost(null);
    setError(null);
    setContentLoading(true);

    let cancelled = false;
    (async () => {
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 12_000);
        const res = await fetch(`/api/feedback-event/posts/${id}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        window.clearTimeout(timeout);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || '글을 불러오지 못했습니다.');
          return;
        }
        setPost(json.post);
      } catch {
        if (!cancelled) setError('글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const dateLabel = post
    ? new Date(post.createdAt).toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="bg-zinc-50 min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/feedback-event"
          prefetch
          className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-blue-600 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          게시판 목록
        </Link>

        <article className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <header className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/80">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 min-h-[1.25rem]">
                {contentLoading && !post ? (
                  <span className="text-zinc-400">작성자·날짜 불러오는 중…</span>
                ) : post ? (
                  <>
                    <span className="font-medium text-zinc-700">{post.authorLabel}</span>
                    <span>·</span>
                    <span>{dateLabel}</span>
                    {post.publicConsent ? (
                      <span className="rounded bg-blue-100 text-blue-800 px-2 py-0.5">공개</span>
                    ) : (
                      <span className="rounded bg-zinc-200 text-zinc-700 px-2 py-0.5">비공개</span>
                    )}
                    {post.isMine && (
                      <span className="rounded bg-emerald-100 text-emerald-800 px-2 py-0.5">
                        내 글
                      </span>
                    )}
                    {post.isAdminViewer && (
                      <span className="rounded bg-amber-100 text-amber-900 px-2 py-0.5">
                        관리자 열람
                      </span>
                    )}
                    {post.authorEmail && (
                      <span className="rounded bg-slate-100 text-slate-700 px-2 py-0.5">
                        작성자 이메일: {post.authorEmail}
                      </span>
                    )}
                  </>
                ) : null}
              </div>
              {post?.canDelete && (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void handleDelete()}
                  className="inline-flex items-center gap-1.5 shrink-0 text-xs font-medium text-red-600 hover:text-red-800 border border-red-200 hover:border-red-300 rounded-lg px-3 py-1.5 bg-white disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  {deleting ? '삭제 중…' : '삭제'}
                </button>
              )}
            </div>
            <p className="text-sm text-zinc-600 min-h-[1.25rem]">
              {contentLoading && !post ?
                <span className="text-zinc-400">기능·결과 불러오는 중…</span>
              : post ?
                <>
                  {post.featureLabel} · {post.resultLabel}
                </>
              : null}
            </p>
          </header>

          {contentLoading && (
            <div className="px-6 py-10 flex items-center justify-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin shrink-0" aria-hidden />
              글 내용 불러오는 중…
            </div>
          )}

          {!contentLoading && error && (
            <div className="px-6 py-10 text-center text-sm text-zinc-600">
              <p className="mb-3">{error}</p>
              <Link href="/feedback-event" className="text-blue-600 underline">
                게시판으로
              </Link>
            </div>
          )}

          {!contentLoading && post && (
            <>
              <div className="px-6 py-5 text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">
                {post.content}
              </div>

              {(post.isMine || post.isAdminViewer) && post.attachmentUrl && post.attachmentName && (
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

              {(post.isMine || post.isAdminViewer) && post.systemReply && (
                <div className="mx-6 mb-6 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900 whitespace-pre-line leading-relaxed">
                  <p className="font-semibold text-amber-950 mb-2">운영 안내</p>
                  {post.systemReply}
                </div>
              )}
            </>
          )}
        </article>
      </div>
    </div>
  );
}
