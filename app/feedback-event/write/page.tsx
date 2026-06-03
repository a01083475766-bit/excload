'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useUserStore } from '@/app/store/userStore';
import { useFeedbackEventStatus } from '@/app/components/feedback-event/useFeedbackEventStatus';
import { FeedbackEventIntro } from '@/app/components/feedback-event/FeedbackEventIntro';
import {
  FEEDBACK_CONVERSION_RESULTS,
  FEEDBACK_FEATURES,
  MIN_FEEDBACK_CONTENT_LENGTH,
} from '@/app/lib/feedback-event/constants';
import { PenLine, ArrowLeft } from 'lucide-react';

function FeedbackWriteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams?.get('from');
  const { status } = useSession();
  const fetchUser = useUserStore((s) => s.fetchUser);
  const { data, loading, refresh, isEventActive } = useFeedbackEventStatus(true);

  const [featureUsed, setFeatureUsed] = useState('order-convert');
  const [conversionResult, setConversionResult] = useState('good');
  const [content, setContent] = useState('');
  const [publicConsent, setPublicConsent] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [systemReply, setSystemReply] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') void fetchUser();
  }, [status, fetchUser]);

  const handleSubmit = useCallback(async () => {
    if (status !== 'authenticated') {
      router.push(`/auth/login?callbackUrl=${encodeURIComponent('/feedback-event/write')}`);
      return;
    }
    if (!isEventActive) {
      alert('피드백 이벤트 접수 기간이 종료되었습니다.');
      return;
    }
    if (content.trim().length < MIN_FEEDBACK_CONTENT_LENGTH) {
      alert(`내용을 ${MIN_FEEDBACK_CONTENT_LENGTH}자 이상 입력해 주세요.`);
      return;
    }

    setSubmitting(true);
    setSystemReply(null);

    try {
      const form = new FormData();
      form.append('featureUsed', featureUsed);
      form.append('conversionResult', conversionResult);
      form.append('content', content.trim());
      form.append('publicConsent', publicConsent ? 'true' : 'false');
      if (attachment) form.append('attachment', attachment);

      const res = await fetch('/api/feedback-event/submit', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || '제출에 실패했습니다.');
        return;
      }

      await fetchUser();
      await refresh();

      if (json.submissionId) {
        router.push(`/feedback-event/${json.submissionId}`);
        return;
      }
      router.push('/feedback-event');
    } catch {
      alert('제출 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }, [
    status,
    router,
    isEventActive,
    content,
    featureUsed,
    conversionResult,
    publicConsent,
    attachment,
    fetchUser,
    refresh,
  ]);

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-zinc-500">
        불러오는 중…
      </div>
    );
  }

  if (!isEventActive) {
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

        <FeedbackEventIntro data={data} from={from} />

        <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-5 shadow-sm">
          <div>
            <label className="block text-sm font-semibold text-zinc-800 mb-1">사용한 기능</label>
            <select
              value={featureUsed}
              onChange={(e) => setFeatureUsed(e.target.value)}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm"
            >
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

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={publicConsent}
              onChange={(e) => setPublicConsent(e.target.checked)}
              className="mt-1"
            />
            <span className="text-sm text-zinc-700">
              (선택) 이 글을 공개 게시판에 함께 보여 주세요. 동의한 글만 목록에 노출됩니다.
            </span>
          </label>

          {systemReply && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900 whitespace-pre-line leading-relaxed">
              {systemReply}
            </div>
          )}

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
