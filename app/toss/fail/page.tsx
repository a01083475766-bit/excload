'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function TossFailInner() {
  const searchParams = useSearchParams();
  const code = searchParams?.get('code') || '';
  const msg = searchParams?.get('message') || '';
  const plan =
    searchParams?.get('plan') === 'yearly' ? 'yearly' : 'monthly';

  return (
    <div className="max-w-[560px] mx-auto py-16 px-6 text-center">
      <h1 className="text-xl font-bold mb-4">토스 카드 등록 실패</h1>
      <p className="text-zinc-600 mb-2">
        {msg || '카드 등록이 완료되지 않았습니다.'}
      </p>
      {code ? (
        <p className="text-sm text-zinc-500 mb-8">코드: {code}</p>
      ) : (
        <div className="mb-8" />
      )}
      <Link
        href={`/subscribe?plan=${plan}`}
        className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700"
      >
        구독 페이지로 돌아가기
      </Link>
    </div>
  );
}

export default function TossFailPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[560px] mx-auto py-16 text-center text-zinc-600">불러오는 중…</div>
      }
    >
      <TossFailInner />
    </Suspense>
  );
}
