'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function TossSuccessInner() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [cardSummary, setCardSummary] = useState('');
  const plan = searchParams.get('plan') === 'yearly' ? 'yearly' : 'monthly';

  useEffect(() => {
    const customerKey = searchParams.get('customerKey') || '';
    const authKey = searchParams.get('authKey') || '';

    if (!customerKey || !authKey) {
      setStatus('error');
      setMessage('customerKey 또는 authKey가 없습니다. 카드 등록을 다시 시도해 주세요.');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/toss/billing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ customerKey, authKey }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStatus('error');
          setMessage(typeof data.error === 'string' ? data.error : '빌링키 저장에 실패했습니다.');
          return;
        }
        const company =
          typeof data.cardCompany === 'string' && data.cardCompany.trim()
            ? data.cardCompany.trim()
            : '';
        const number =
          typeof data.maskedCardNumber === 'string' && data.maskedCardNumber.trim()
            ? data.maskedCardNumber.trim()
            : '';
        if (company || number) {
          setCardSummary([company, number].filter(Boolean).join(' '));
        } else {
          setCardSummary('');
        }
        setStatus('ok');
        setMessage('카드 등록이 완료되었습니다.\n이제 결제를 진행해주세요.');
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setMessage(e instanceof Error ? e.message : '요청 중 오류가 발생했습니다.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <div className="max-w-[560px] mx-auto py-16 px-6 text-center">
      <h1 className="text-xl font-bold mb-4">토스 카드 등록</h1>
      {status === 'loading' && (
        <p className="text-zinc-600">빌링키를 저장하는 중입니다…</p>
      )}
      {status === 'ok' && (
        <>
          <p className="text-green-700 dark:text-green-400 mb-6 whitespace-pre-line">{message}</p>
          {cardSummary && (
            <p className="text-sm text-zinc-600 mb-4">
              등록된 결제카드: <span className="font-medium text-zinc-800">{cardSummary}</span>
            </p>
          )}
          <div className="flex justify-center">
            <Link
              href={`/subscribe?plan=${plan}`}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700"
            >
              결제 진행하기
            </Link>
          </div>
        </>
      )}
      {status === 'error' && (
        <>
          <p className="text-red-600 dark:text-red-400 mb-6">{message}</p>
          <Link
            href={`/subscribe?plan=${plan}`}
            className="text-blue-600 underline underline-offset-2"
          >
            구독 페이지로 돌아가기
          </Link>
        </>
      )}
    </div>
  );
}

export default function TossSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[560px] mx-auto py-16 text-center text-zinc-600">불러오는 중…</div>
      }
    >
      <TossSuccessInner />
    </Suspense>
  );
}
