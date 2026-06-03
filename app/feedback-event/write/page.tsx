'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';
import { useUserStore } from '@/app/store/userStore';
import { useFeedbackEventStatus } from '@/app/components/feedback-event/useFeedbackEventStatus';
import { readFeedbackStatusCache, clearFeedbackStatusCache } from '@/app/lib/feedback-event/status-cache';
import {
  FEEDBACK_CONVERSION_RESULTS,
  FEEDBACK_FEATURES,
  FEEDBACK_SELECT_VALUE,
  isValidFeedbackConversionResult,
  isValidFeedbackFeature,
  MIN_FEEDBACK_CONTENT_LENGTH,
} from '@/app/lib/feedback-event/constants';
import { PenLine, ArrowLeft } from 'lucide-react';

type PostVisibility = 'public' | 'private';

function FeedbackWriteInner() {
  const router = useRouter();
  const { status } = useSession();
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const { data, loading: statusLoading, refresh } = useFeedbackEventStatus(true);

  const eventActive =
    data?.event.isActive ?? readFeedbackStatusCache()?.event.isActive ?? true;

  const [featureUsed, setFeatureUsed] = useState(FEEDBACK_SELECT_VALUE);
  const [conversionResult, setConversionResult] = useState(FEEDBACK_SELECT_VALUE);
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (status !== 'authenticated') {
      router.push(`/auth/login?callbackUrl=${encodeURIComponent('/feedback-event/write')}`);
      return;
    }
    if (!eventActive) {
      alert('피드백 이벤트 접수 기간이 종료되었습니다.');
      return;
    }
    if (!isValidFeedbackFeature(featureUsed)) {
      alert('사용한 기능을 선택해 주세요.');
      return;
    }
    if (!isValidFeedbackConversionResult(conversionResult)) {
      alert('변환 결과를 선택해 주세요.');
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
      form.append('featureUsed', featureUsed);
      form.append('conversionResult', conversionResult);
      form.append('content', content.trim());
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

      clearFeedbackStatusCache();
      void refresh();

      if (json.submissionId) {
        router.replace(`/feedback-event/${json.submissionId}`);
        return;
      }
      router.replace('/feedback-event');
    } catch {
      alert('제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      setSubmitting(false);
    }
  }, [
    status,
    router,
    eventActive,
    content,
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
        <p className="text-zinc-600 mb-6">현재 피드백 이벤트 접수 기간이 아닙니다.</p>
        <Link href="/feedback-event" className="text-blue-600 underline">
          게시판으로
        </Link>
      </div>
    );
  }

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

        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-2 flex items-center gap-2">
          <PenLine className="h-7 w-7 text-blue-600" aria-hidden />
          피드백 작성하기
        </h1>

        <p className="text-sm text-zinc-500 mb-6">
          이벤트 안내·PRO 체험 상태는{' '}
          <Link href="/feedback-event" className="text-blue-600 underline">
            게시판 목록
          </Link>
          에서 확인할 수 있습니다.
        </p>

        <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-5 shadow-sm">
          <div>
            <label className="block text-sm font-semibold text-zinc-800 mb-1">사용한 기능</label>
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
            <label className="block text-sm font-semibold text-zinc-800 mb-1">변환 결과</label>
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
            <label className="block text-sm font-semibold text-zinc-800 mb-1">내용</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm resize-y"
              placeholder="어떤 점이 좋았는지, 어디가 불편했는지 알려주세요."
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
              첨부는 운영 검토용이며, 공개 게시판에는 올리지 않습니다. (5MB 이하)
            </p>
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

          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg"
          >
            {submitting ? '등록 중…' : '등록하기'}
          </button>
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
