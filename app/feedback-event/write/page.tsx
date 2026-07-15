'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useCallback, useRef, useState } from 'react';
import { serializeFeedbackContent } from '@/app/lib/feedback-event/map-board-post';
import {
  DEFAULT_FEEDBACK_CATEGORY,
  FEEDBACK_CATEGORIES,
  FEEDBACK_SELECT_VALUE,
  MIN_FEEDBACK_CONTENT_LENGTH,
} from '@/app/lib/feedback-event/constants';
import { getBetaFeedbackPostPath } from '@/app/lib/feedback-event/routes';
import { ArrowLeft } from 'lucide-react';

type PostVisibility = 'public' | 'private';

function FeedbackWriteInner() {
  const router = useRouter();
  const { status } = useSession();

  const [category, setCategory] = useState(FEEDBACK_SELECT_VALUE);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const submissionIdRef = useRef<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (status !== 'authenticated') {
      router.push(`/auth/login?callbackUrl=${encodeURIComponent('/beta-feedback/write')}`);
      return;
    }
    if (title.trim().length < 2) {
      alert('제목을 2자 이상 입력해 주세요.');
      return;
    }
    if (content.trim().length < MIN_FEEDBACK_CONTENT_LENGTH) {
      alert(`내용을 ${MIN_FEEDBACK_CONTENT_LENGTH}자 이상 입력해 주세요.`);
      return;
    }
    if (!visibility) {
      alert('공개 또는 비공개를 선택해 주세요.');
      return;
    }
    setSubmitting(true);

    try {
      const form = new FormData();
      const fullContent = serializeFeedbackContent({ title, body: content });
      form.append('featureUsed', category || DEFAULT_FEEDBACK_CATEGORY);
      form.append('conversionResult', 'other');
      form.append('content', fullContent);
      form.append('publicConsent', visibility === 'public' ? 'true' : 'false');
      submissionIdRef.current ||= crypto.randomUUID();
      form.append('submissionId', submissionIdRef.current);
      if (attachment) form.append('attachment', attachment);

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 30_000);
      const res = await fetch('/api/feedback-event/submit', {
        method: 'POST',
        credentials: 'include',
        body: form,
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || '제출에 실패했습니다.');
        setSubmitting(false);
        return;
      }

      if (json.submissionId) {
        router.push(getBetaFeedbackPostPath(json.submissionId));
        return;
      }
      router.push('/beta-feedback');
    } catch {
      alert('제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      setSubmitting(false);
    }
  }, [
    status,
    router,
    content,
    title,
    category,
    visibility,
    attachment,
  ]);

  return (
    <div className="bg-zinc-50 min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/beta-feedback"
          className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-blue-600 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          게시판 목록
        </Link>

        <h1 className="mb-2 text-2xl font-bold text-zinc-950">베타 피드백 작성</h1>
        <p className="mb-2 text-sm leading-6 text-zinc-600">
          엑클로드를 사용하며 느낀 점, 궁금한 점, 불편한 점이나 개선 의견을 자유롭게 남겨주세요.
        </p>
        <p className="mb-6 border-l-2 border-amber-500 pl-3 text-sm leading-6 text-amber-900">
          고객 이름, 전화번호, 주소, 주문번호 등 개인정보는 가린 뒤 첨부해 주세요.
        </p>

        <div className="border border-zinc-200 bg-white p-5 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-zinc-800 mb-1">말머리</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value={FEEDBACK_SELECT_VALUE}>
                자유글
              </option>
              {FEEDBACK_CATEGORIES.filter(
                (item) => item.value !== DEFAULT_FEEDBACK_CATEGORY,
              ).map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-zinc-500">선택하지 않으면 자유글로 등록됩니다.</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-zinc-800 mb-1">제목</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              placeholder="제목을 입력해주세요."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-zinc-800 mb-1">내용</label>
            <ul className="mb-2 list-disc space-y-0.5 pl-5 text-xs leading-5 text-zinc-500">
              <li>사용하면서 궁금했던 점</li>
              <li>불편하거나 개선되었으면 하는 점</li>
              <li>새롭게 추가되었으면 하는 기능</li>
              <li>자유로운 사용 후기</li>
            </ul>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm resize-y"
              placeholder="엑클로드를 사용하며 느낀 점이나 궁금한 내용을 자유롭게 적어주세요."
            />
            <p className="mt-1 text-xs text-zinc-500">최소 {MIN_FEEDBACK_CONTENT_LENGTH}자</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-zinc-800 mb-1">
              스크린샷 첨부 (선택)
            </label>
            <p className="mb-2 text-xs leading-5 text-zinc-500">
              오류 화면이나 확인이 필요한 화면을 첨부할 수 있습니다. 고객 이름, 전화번호,
              주소, 주문번호 등 개인정보는 가린 후 올려주세요.
            </p>
            <input
              ref={attachmentInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                if (!file) {
                  setAttachment(null);
                  return;
                }
                const extension = file.name.split('.').pop()?.toLowerCase();
                if (!extension || !['png', 'jpg', 'jpeg', 'webp'].includes(extension)) {
                  alert('PNG, JPG, WebP 이미지만 첨부할 수 있습니다.');
                  e.target.value = '';
                  setAttachment(null);
                  return;
                }
                if (file.size > 5 * 1024 * 1024) {
                  alert('첨부 파일은 5MB 이하만 가능합니다.');
                  e.target.value = '';
                  setAttachment(null);
                  return;
                }
                setAttachment(file);
              }}
              className="w-full text-sm"
            />
            <p className="mt-1 text-xs text-zinc-500">PNG, JPG, WebP · 최대 5MB</p>
            {attachment ? (
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-zinc-100 pt-2 text-sm">
                <span className="min-w-0 truncate text-zinc-700">
                  {attachment.name} · {(attachment.size / 1024).toFixed(1)}KB
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAttachment(null);
                    if (attachmentInputRef.current) attachmentInputRef.current.value = '';
                  }}
                  className="shrink-0 text-sm font-medium text-zinc-600 underline"
                >
                  삭제
                </button>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-6 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={visibility === 'public'}
                onChange={() => setVisibility('public')}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium text-zinc-800">공개</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={visibility === 'private'}
                onChange={() => setVisibility('private')}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium text-zinc-800">비공개</span>
            </label>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Link
              href="/beta-feedback"
              className="inline-flex h-11 items-center justify-center rounded border border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              취소
            </Link>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSubmit()}
              className="inline-flex h-11 items-center justify-center rounded bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {submitting ? '등록 중…' : '등록하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FeedbackWritePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex items-center justify-center text-zinc-500">
          불러오는 중…
        </div>
      }
    >
      <FeedbackWriteInner />
    </Suspense>
  );
}
