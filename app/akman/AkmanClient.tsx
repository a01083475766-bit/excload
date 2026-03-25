'use client';

import { useSession } from 'next-auth/react';

export default function AkmanClient() {
  const { data: session, status } = useSession();

  if (status === 'loading') return <div>로딩중...</div>;

  const email = (session?.user?.email || '').trim();
  if (!email) return <div>로그인이 필요합니다</div>;

  // /akman 접근 권한(관리자 여부)은 middleware.ts에서 1차로 차단/허용합니다.
  // 여기서는 추가로 NEXT_PUBLIC_ADMIN_EMAIL을 검사하지 않습니다.
  return <div>관리자 페이지</div>;
}

