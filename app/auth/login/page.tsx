/**
 * 로그인 페이지 (리다이렉트)
 *
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 인증 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 *
 * 통합 인증 페이지(/auth)로 리다이렉트합니다.
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.set('mode', 'login');
    router.replace(`/auth?${params.toString()}`);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
        </div>
        <p className="text-base font-semibold text-gray-900">로그인 페이지로 이동 중입니다.</p>
        <p className="mt-2 text-sm text-gray-500">잠시만 기다려주세요.</p>
      </div>
    </div>
  );
}
