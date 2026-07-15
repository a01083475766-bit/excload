'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';
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
    if (visibility === 'private' && attachment) {
      alert('비공개 글의 안전한 파일 첨부 기능은 준비 중입니다. 첨부를 해제하고 본문에 내용을 적어 주세요.');
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
              첨부 (스크린샷·엑셀 헤더 등, 선택)
            </label>
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv"
              onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
            <p className="mt-1 text-xs text-zinc-500">
              공개 글에 첨부한 파일은 다른 베타 사용자도 볼 수 있습니다. 고객 이름, 전화번호,
              주소, 주문번호 등 개인정보는 반드시 가려주세요. (5MB 이하)
            </p>
            {visibility === 'private' && (
              <p className="mt-2 text-xs leading-5 text-amber-800">
                운영자에게만 공개하는 글의 안전한 파일 첨부 기능은 준비 중입니다. 현재는
                개인정보를 제거한 내용을 본문으로 작성해 주세요.
              </p>
            )}
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
                onChange={() => {
                  if (attachment) {
                    alert('비공개 글에는 현재 첨부를 등록할 수 없습니다. 첨부 파일을 해제해 주세요.');
                  }
                  setVisibility('private');
                }}
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
