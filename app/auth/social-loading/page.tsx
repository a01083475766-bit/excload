'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2 } from 'lucide-react';
import { getPostLoginPath, navigatePostLogin } from '@/app/lib/auth/post-login-redirect';

function SocialLoadingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = searchParams ?? new URLSearchParams();
  const { status } = useSession();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (redirectedRef.current) return;

    if (status === 'authenticated') {
      redirectedRef.current = true;
      const provider = (params.get('provider') || '').toLowerCase();
      if (provider === 'google' || provider === 'kakao' || provider === 'naver') {
        try {
          window.localStorage.setItem('preferred-social-provider', provider);
        } catch {
          // ignore localStorage failures
        }
      }
      navigatePostLogin(getPostLoginPath(params), router);
      return;
    }

    if (status === 'unauthenticated') {
      redirectedRef.current = true;
      router.replace('/auth?mode=login&error=OAuthSignin');
    }
  }, [status, router, params]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
        </div>
        <p className="text-base font-semibold text-gray-900">로그인 처리 중입니다.</p>
        <p className="mt-2 text-sm text-gray-500">계정 정보를 확인하고 있습니다. 잠시만 기다려주세요.</p>
      </div>
    </div>
  );
}

function SocialLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
        </div>
        <p className="text-base font-semibold text-gray-900">로그인 처리 중입니다.</p>
        <p className="mt-2 text-sm text-gray-500">잠시만 기다려주세요.</p>
      </div>
    </div>
  );
}

export default function SocialLoadingPage() {
  return (
    <Suspense fallback={<SocialLoadingFallback />}>
      <SocialLoadingContent />
    </Suspense>
  );
}
