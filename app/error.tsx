'use client';

import Link from 'next/link';
import { useEffect } from 'react';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[Global Error Boundary]', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-[800px] flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="mb-3 text-2xl font-bold text-zinc-900">문제가 발생했습니다</h1>
      <p className="mb-2 text-sm text-zinc-700">
        변환 처리 또는 네트워크 요청 중 오류가 발생했습니다.
      </p>
      <p className="mb-8 text-sm text-zinc-600">
        잠시 후 다시 시도해 주세요. 문제가 계속되면 고객문의로 알려주시면 빠르게 확인하겠습니다.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          다시 시도
        </button>
        <Link
          href="/contact"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          고객문의
        </Link>
        <Link
          href="/excload"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          홈으로 이동
        </Link>
      </div>
    </main>
  );
}
