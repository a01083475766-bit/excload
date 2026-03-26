'use client';

import Link from 'next/link';
import { XCircle } from 'lucide-react';

export default function PaymentCancelPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-8 text-center">
        <XCircle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          결제가 취소되었습니다
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-6">
          결제가 완료되지 않았습니다. 원하시면 다시 결제를 진행해 주세요.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/pricing"
            className="w-full px-4 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
          >
            가격 페이지로 이동
          </Link>
          <Link
            href="/mypage"
            className="w-full px-4 py-3 rounded-lg border border-zinc-300 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            마이페이지로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}
