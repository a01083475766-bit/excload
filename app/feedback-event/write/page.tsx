'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';
import { useUserStore } from '@/app/store/userStore';
import { useFeedbackEventStatus } from '@/app/components/feedback-event/useFeedbackEventStatus';
import {
  FEEDBACK_CONVERSION_RESULTS,
  FEEDBACK_FEATURES,
  FEEDBACK_SELECT_VALUE,
  isValidFeedbackConversionResult,
  isValidFeedbackFeature,
  MIN_FEEDBACK_CONTENT_LENGTH,
} from '@/app/lib/feedback-event/constants';
import { ArrowLeft } from 'lucide-react';

type PostVisibility = 'public' | 'private';

function FeedbackWriteInner() {
  const router = useRouter();
  const { status } = useSession();
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const { data, loading: statusLoading, refresh } = useFeedbackEventStatus(true);

  const eventActive = data?.event.isActive ?? true;

  const noAdditionalTrial =
    status === 'authenticated' &&
    (data?.user.isPaid ?? data?.user.feedbackTrialUsed ?? user?.feedbackTrialUsed ?? false);

  const [featureUsed, setFeatureUsed] = useState(FEEDBACK_SELECT_VALUE);
  const [conversionResult, setConversionResult] = useState(FEEDBACK_SELECT_VALUE);
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
    if (!eventActive) {
      alert('베타 피드백 접수 기간이 종료되었습니다.');
      return;
    }
    if (!isValidFeedbackFeature(featureUsed)) {
      alert('사용한 기능을 선택해 주세요.');
      return;
    }
    if (!isValidFeedbackConversionResult(conversionResult)) {
      alert('현재 상황을 선택해 주세요.');
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
      const fullContent = `${title.trim()}\n\n${content.trim()}`;
      form.append('featureUsed', featureUsed);
      form.append('conversionResult', conversionResult);
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

      if (json.trialGranted && json.trialEndsAt && user) {
        setUser({
          ...user,
          points: typeof json.points === 'number' ? json.points : user.points,
          feedbackTrialEndsAt: json.trialEndsAt,
          feedbackTrialUsed: true,
        });
      }

      void refresh();

      if (json.submissionId) {
        router.replace(`/beta-feedback/${json.submissionId}`);
        return;
      }
      router.replace('/beta-feedback');
    } catch {
      alert('제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      setSubmitting(false);
    }
  }, [
    status,
    router,
    eventActive,
    content,
    title,
    featureUsed,
    conversionResult,
    visibility,
    attachment,
    user,
    setUser,
    refresh,
  ]);

  if (!statusLoading && !eventActive) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-zinc-900 mb-4">피드백 작성</h1>
        <p className="text-zinc-600 mb-6">현재 베타 피드백 접수 기간이 아닙니다.</p>
        <Link href="/beta-feedback" className="text-blue-600 underline">
          게시판으로
        </Link>
      </div>
    );
  }

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
          오류가 발생한 화면과 실행 순서를 자세히 적어주시면 확인에 도움이 됩니다.
        </p>
        <p className="mb-6 border-l-2 border-amber-500 pl-3 text-sm leading-6 text-amber-900">
          고객 이름, 전화번호, 주소, 주문번호 등 개인정보는 가린 뒤 첨부해 주세요.
        </p>

        {noAdditionalTrial && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 leading-relaxed">
            PRO 30일 체험 혜택은 <strong>계정당 1회</strong>입니다. 추가로 남기신 피드백에도
            체험 기간이 다시 제공되지는 않으며, 의견은 정상적으로 접수됩니다.
          </div>
        )}

        <div className="border border-zinc-200 bg-white p-5 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-zinc-800 mb-1">관련 기능</label>
            <select
              value={featureUsed}
              onChange={(e) => setFeatureUsed(e.target.value)}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value={FEEDBACK_SELECT_VALUE} disabled>
                선택
              </option>
              {FEEDBACK_FEATURES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-zinc-800 mb-1">현재 상황</label>
            <select
              value={conversionResult}
              onChange={(e) => setConversionResult(e.target.value)}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value={FEEDBACK_SELECT_VALUE} disabled>
                선택
              </option>
              {FEEDBACK_CONVERSION_RESULTS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-zinc-800 mb-1">제목</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              placeholder="예: 송장 변환 결과에서 주소가 잘못 분리됩니다"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-zinc-800 mb-1">내용</label>
            <ul className="mb-2 list-disc space-y-0.5 pl-5 text-xs leading-5 text-zinc-500">
              <li>어떤 기능을 사용했나요?</li>
              <li>어떤 순서로 실행했나요?</li>
              <li>기대한 결과와 실제 결과는 어떻게 달랐나요?</li>
            </ul>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm resize-y"
              placeholder="오류 화면, 실행 순서, 기대한 결과, 실제 결과를 적어주세요."
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
