'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useUserStore } from '@/app/store/userStore';
import { useFeedbackEventStatus } from '@/app/components/feedback-event/useFeedbackEventStatus';
import {
  FEEDBACK_CONVERSION_RESULTS,
  FEEDBACK_FEATURES,
  MIN_FEEDBACK_CONTENT_LENGTH,
} from '@/app/lib/feedback-event/constants';

function FeedbackEventInner() {
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
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [systemReply, setSystemReply] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') void fetchUser();
  }, [status, fetchUser]);

  const handleSubmit = useCallback(async () => {
    if (status !== 'authenticated') {
      router.push(`/auth/login?callbackUrl=${encodeURIComponent('/feedback-event')}`);
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
    setResultMessage(null);
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

      setResultMessage(
        json.trialGranted
          ? 'PRO 체험이 시작되었습니다. 마이페이지에서 확인할 수 있습니다.'
          : '피드백이 접수되었습니다.',
      );
      setSystemReply(json.systemReply ?? null);
      await fetchUser();
      await refresh();
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
        <h1 className="text-2xl font-bold text-zinc-900 mb-4">오픈 피드백 이벤트</h1>
        <p className="text-zinc-600 mb-6">현재 피드백 이벤트 접수 기간이 아닙니다.</p>
        <Link href="/pricing" className="text-blue-600 underline">
          가격 플랜 보기
        </Link>
      </div>
    );
  }

  const endsLabel = data?.event.endsAtLabel ?? '';
  const trialActive = data?.user.feedbackTrialActive ?? false;
  const trialEnds = data?.user.feedbackTrialEndsAt;
  const canTrial = data?.user.canSubmitForTrial ?? false;

  return (
    <div className="bg-zinc-50 min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-2">오픈 피드백 이벤트</h1>
        <p className="text-zinc-600 text-sm leading-relaxed mb-6">
          엑클로드를 사용해 보시고 변환 결과나 개선 의견을 남겨 주세요. 제출이 확인되면{' '}
          <strong>30일 PRO 체험</strong>(사용량 400,000, 유료 PRO와 동일)이{' '}
          <strong>계정당 1회</strong> 자동으로 시작됩니다. 좋은 후기뿐 아니라 오류·불편 사항도
          환영합니다.
        </p>
        <p className="text-xs text-zinc-500 mb-8">접수 마감: {endsLabel}까지 (KST)</p>

        {from === 'pricing' && canTrial && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            먼저 서비스를 무료 플랜으로 사용해 보신 뒤, 피드백을 남기시면 1개월 PRO 체험을 받을 수
            있습니다. 체험 종료 후에도 구독 없이 무료 플랜으로 계속 이용할 수 있습니다.
          </div>
        )}

        {trialActive && trialEnds && (
          <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            현재 오픈 피드백 이벤트 PRO 체험 중입니다. (
            {new Date(trialEnds).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}까지) 체험
            종료 후 자동 결제 없이 FREE 플랜으로 전환됩니다.{' '}
            <Link href="/subscribe?plan=monthly" className="underline font-medium">
              구독하기
            </Link>
          </div>
        )}

        {data?.user.feedbackTrialUsed && !trialActive && (
          <div className="mb-6 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
            이 계정은 이미 피드백 이벤트 PRO 체험을 사용했습니다. 추가 피드백은 접수되지만 체험권은
            다시 제공되지 않습니다.
          </div>
        )}

        {data?.user.isPaid && (
          <div className="mb-6 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
            유료 플랜 이용 중입니다. 피드백은 접수할 수 있으나 PRO 체험권은 제공되지 않습니다.
          </div>
        )}

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
              rows={6}
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
              첨부 파일은 이벤트 검토·CS용이며, 공개 후기에 올리지 않습니다. (5MB 이하)
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
              (선택) 공개 후기로 활용하는 것에 동의합니다. 동의한 글만 후기 페이지에 노출될 수
              있습니다.
            </span>
          </label>

          {systemReply && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
              {systemReply}
            </div>
          )}

          {resultMessage && !systemReply && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-900">
              {resultMessage}
            </div>
          )}

          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg"
          >
            {submitting ? '제출 중…' : '피드백 제출하기'}
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-zinc-500">
          <Link href="/order-convert" className="text-blue-600 underline">
            변환 페이지로 이동
          </Link>
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
      <FeedbackEventInner />
    </Suspense>
  );
}
