'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import type { FeedbackCommentDto } from '@/app/lib/feedback-event/comments';
import { FEEDBACK_COMMENT_MAX_LENGTH } from '@/app/lib/feedback-event/comments';

type Props = {
  postId: string;
  initialComments: FeedbackCommentDto[];
  publicConsent: boolean;
  viewerIsAdmin: boolean;
  canComment: boolean;
};

export function FeedbackComments({
  postId,
  initialComments,
  publicConsent,
  viewerIsAdmin,
  canComment,
}: Props) {
  const router = useRouter();
  const [comments, setComments] = useState(initialComments);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = content.trim();
    if (trimmed.length < 2) {
      setError('댓글은 2자 이상 입력해주세요.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/feedback-event/posts/${postId}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || '댓글을 등록하지 못했습니다.');
        return;
      }

      setComments((current) => [...current, json.comment as FeedbackCommentDto]);
      setContent('');
      router.refresh();
    } catch {
      setError('댓글을 등록하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!confirm('이 댓글을 삭제할까요?')) return;

    setError(null);
    try {
      const response = await fetch(
        `/api/feedback-event/posts/${postId}/comments/${commentId}`,
        { method: 'DELETE', credentials: 'include' },
      );
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || '댓글을 삭제하지 못했습니다.');
        return;
      }

      setComments((current) => current.filter((comment) => comment.id !== commentId));
      router.refresh();
    } catch {
      setError('댓글을 삭제하지 못했습니다.');
    }
  };

  return (
    <section className="border-t border-zinc-200 px-5 py-5">
      <h2 className="text-sm font-semibold text-zinc-950">댓글 {comments.length}</h2>

      {!publicConsent ? (
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          {viewerIsAdmin
            ? '비공개 글의 댓글은 작성자와 관리자에게만 표시됩니다.'
            : '비공개 글에는 운영자만 답변할 수 있습니다.'}
        </p>
      ) : null}

      <div className="mt-4 divide-y divide-zinc-100 border-y border-zinc-200">
        {comments.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">등록된 댓글이 없습니다.</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 sm:flex sm:items-center sm:gap-2">
                  <p className="text-sm font-semibold text-zinc-800">
                    {comment.authorLabel}
                    {comment.isAdminComment ? (
                      <span className="ml-1.5 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                        운영자
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400 sm:mt-0">
                    {formatDate(comment.createdAt)}
                  </p>
                </div>
                {comment.canDelete ? (
                  <button
                    type="button"
                    title="댓글 삭제"
                    aria-label="댓글 삭제"
                    onClick={() => void deleteComment(comment.id)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">
                {comment.content}
              </p>
            </div>
          ))
        )}
      </div>

      {canComment ? (
        <form onSubmit={submitComment} className="mt-4">
          <label htmlFor="feedback-comment" className="mb-2 block text-sm font-medium text-zinc-800">
            댓글 작성
          </label>
          <textarea
            id="feedback-comment"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={FEEDBACK_COMMENT_MAX_LENGTH}
            rows={4}
            placeholder={viewerIsAdmin && !publicConsent ? '운영자 답변을 입력해주세요.' : '댓글을 입력해주세요.'}
            className="w-full resize-y rounded border border-zinc-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-zinc-500"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-400">
              {content.length.toLocaleString()} / {FEEDBACK_COMMENT_MAX_LENGTH.toLocaleString()}
            </p>
            <button
              type="submit"
              disabled={submitting || content.trim().length < 2}
              className="h-9 rounded bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? '등록 중' : '댓글 등록'}
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
